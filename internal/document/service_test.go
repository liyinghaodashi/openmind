package document

import (
	"openmind/internal/workspace"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func setup(t *testing.T) (*Service, *Snapshot, string) {
	t.Helper()
	root := t.TempDir()
	path := filepath.Join(root, "a.md")
	os.WriteFile(path, []byte("# A\n\n## Item\n"), 0644)
	w, _ := workspace.Open(root)
	s := New(t.TempDir())
	s.SetWorkspace(w)
	snapshot, err := s.Open("a.md")
	if err != nil {
		t.Fatal(err)
	}
	return s, snapshot, path
}

func TestEveryInputWritesFileAndRetryIsIdempotent(t *testing.T) {
	s, snap, path := setup(t)
	id := snap.Root.Children[0].ID
	for _, value := range []string{"a", "ab", "abc"} {
		edit := Edit{Session: snap.Session, Version: snap.Version, OpID: value, Kind: "label", NodeID: id, Text: value}
		var err error
		snap, err = s.Apply(edit)
		if err != nil {
			t.Fatal(err)
		}
		onDisk, _ := os.ReadFile(path)
		if !strings.Contains(string(onDisk), "## "+value+"\n") {
			t.Fatal("intermediate revision not written")
		}
		if _, err = s.Apply(edit); err != nil {
			t.Fatal(err)
		}
	}
	if s.commits != 3 {
		t.Fatalf("want 3 file commits, got %d", s.commits)
	}
}

func TestInsertChildWritesOnceAndReturnsEditableNode(t *testing.T) {
	s, snap, path := setup(t)
	edit := Edit{Session: snap.Session, Version: snap.Version, OpID: "insert", Kind: "insert-child", NodeID: snap.Root.Children[0].ID}
	next, err := s.Apply(edit)
	if err != nil {
		t.Fatal(err)
	}
	if next.CreatedNodeID == "" || next.Root.Children[0].Children[0].ID != next.CreatedNodeID {
		t.Fatal("missing created node")
	}
	retry, err := s.Apply(edit)
	if err != nil || retry.CreatedNodeID != next.CreatedNodeID || s.commits != 1 {
		t.Fatal("insert not idempotent")
	}
	_, err = s.Apply(Edit{Session: next.Session, Version: next.Version, OpID: "rename", Kind: "label", NodeID: next.CreatedNodeID, Text: "Child"})
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil || !strings.Contains(string(data), "### Child") {
		t.Fatal("child not saved")
	}
}

func TestDeleteNodeWritesOnceAndRejectsConflict(t *testing.T) {
	s, snap, path := setup(t)
	edit := Edit{Session: snap.Session, Version: snap.Version, OpID: "delete", Kind: "delete-node", NodeID: snap.Root.Children[0].ID}
	next, err := s.Apply(edit)
	if err != nil {
		t.Fatal(err)
	}
	if len(next.Root.Children) != 0 || next.FocusNodeID != next.Root.ID {
		t.Fatal("wrong deletion result")
	}
	retry, err := s.Apply(edit)
	if err != nil || retry.FocusNodeID != next.FocusNodeID || s.commits != 1 {
		t.Fatal("delete not idempotent")
	}
	data, _ := os.ReadFile(path)
	if strings.Contains(string(data), "Item") {
		t.Fatal("node remains on disk")
	}
	s, snap, path = setup(t)
	external := []byte("# External\n")
	if err := os.WriteFile(path, external, 0644); err != nil {
		t.Fatal(err)
	}
	_, err = s.Apply(Edit{Session: snap.Session, Version: snap.Version, OpID: "conflict", Kind: "delete-node", NodeID: snap.Root.Children[0].ID})
	if err == nil {
		t.Fatal("external change overwritten")
	}
	data, _ = os.ReadFile(path)
	if string(data) != string(external) {
		t.Fatal("external file changed")
	}
}

func TestExternalConflictAndRecoveryAcrossCheckRace(t *testing.T) {
	s, snap, path := setup(t)
	id := snap.Root.Children[0].ID
	os.WriteFile(path, []byte("# External\n"), 0644)
	if _, err := s.Apply(Edit{Session: snap.Session, Version: snap.Version, OpID: "1", Kind: "label", NodeID: id, Text: "local"}); err == nil {
		t.Fatal("missed conflict")
	}
	data, _ := os.ReadFile(path)
	if string(data) != "# External\n" {
		t.Fatal("external file overwritten")
	}
	s, snap, path = setup(t)
	id = snap.Root.Children[0].ID
	os.WriteFile(path, []byte("# Disk\n"), 0644)
	changed, err := s.Check()
	if err != nil || changed == nil {
		t.Fatalf("external update missing: %v", err)
	}
	recovery, err := s.PreserveDraft(snap.Session, "label", id, "late local input")
	if err != nil {
		t.Fatal(err)
	}
	data, _ = os.ReadFile(recovery)
	if string(data) != "# A\n\n## late local input\n" {
		t.Fatalf("lost race draft: %q", data)
	}
}

func TestExternalRestoresHistoricalOwnContent(t *testing.T) {
	s, snap, path := setup(t)
	old := snap.Source
	_, err := s.Apply(Edit{Session: snap.Session, Version: snap.Version, OpID: "1", Kind: "source", Text: "# B\n"})
	if err != nil {
		t.Fatal(err)
	}
	os.WriteFile(path, []byte(old), 0644)
	got, err := s.Check()
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.Source != old {
		t.Fatal("historical content incorrectly ignored")
	}
}
