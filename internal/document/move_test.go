package document

import (
	"os"
	"path/filepath"
	"testing"
)

func setupMove(t *testing.T) (*Service, *Snapshot, string) {
	t.Helper()
	s, _, path := setup(t)
	nextPath := filepath.Join(filepath.Dir(path), "a.mind.md")
	if err := os.Rename(path, nextPath); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(nextPath, []byte("# Root\n\n## A\n\n## B\n"), 0644); err != nil {
		t.Fatal(err)
	}
	snap, err := s.Open("a.mind.md")
	if err != nil {
		t.Fatal(err)
	}
	return s, snap, nextPath
}

func TestMoveWritesOnceAndReopensInNewOrder(t *testing.T) {
	s, snap, path := setupMove(t)
	a, b := snap.Root.Children[0].Children[0].ID, snap.Root.Children[0].Children[1].ID
	edit := Edit{Session: snap.Session, Version: snap.Version, OpID: "move", Kind: "move-node", NodeID: a, TargetID: b, Placement: "after"}
	next, err := s.Apply(edit)
	if err != nil {
		t.Fatal(err)
	}
	if next.Root.Children[0].Children[1].ID != next.FocusNodeID || next.NodeIDMap[a] != next.FocusNodeID {
		t.Fatal("invalid selection mapping")
	}
	retry, err := s.Apply(edit)
	if err != nil || retry != next || s.commits != 1 {
		t.Fatal("move is not idempotent")
	}
	edit.Placement = "before"
	if _, err = s.Apply(edit); err == nil {
		t.Fatal("reused operation with different placement accepted")
	}
	onDisk, _ := os.ReadFile(path)
	if string(onDisk) != next.Source {
		t.Fatal("disk differs from snapshot")
	}
	opened, err := s.Open("a.mind.md")
	if err != nil || opened.Root.Children[0].Children[0].Label != "B" || opened.Root.Children[0].Children[1].Label != "A" {
		t.Fatal("reopening lost order")
	}
}

func TestMoveRejectsConflictAndOrdinaryMarkdown(t *testing.T) {
	s, snap, path := setupMove(t)
	external := "# External\n"
	if err := os.WriteFile(path, []byte(external), 0644); err != nil {
		t.Fatal(err)
	}
	_, err := s.Apply(Edit{Session: snap.Session, Version: snap.Version, OpID: "move", Kind: "move-node", NodeID: snap.Root.Children[0].Children[0].ID, TargetID: snap.Root.Children[0].Children[1].ID, Placement: "child"})
	if err == nil {
		t.Fatal("external modification overwritten")
	}
	onDisk, _ := os.ReadFile(path)
	if string(onDisk) != external {
		t.Fatal("external content changed")
	}
	s, snap, path = setup(t)
	before, _ := os.ReadFile(path)
	_, err = s.Apply(Edit{Session: snap.Session, Version: snap.Version, OpID: "move", Kind: "move-node", NodeID: snap.Root.Children[0].ID, TargetID: snap.Root.ID, Placement: "child"})
	if err == nil {
		t.Fatal("ordinary Markdown allowed node move")
	}
	after, _ := os.ReadFile(path)
	if string(before) != string(after) || s.commits != 0 {
		t.Fatal("rejected move wrote file")
	}
}

func TestMoveUnchangedOrderDoesNotWrite(t *testing.T) {
	s, snap, _ := setupMove(t)
	next, err := s.Apply(Edit{Session: snap.Session, Version: snap.Version, OpID: "move", Kind: "move-node", NodeID: snap.Root.Children[0].Children[0].ID, TargetID: snap.Root.Children[0].Children[1].ID, Placement: "before"})
	if err != nil || next.Version != snap.Version || s.commits != 0 || next.FocusNodeID == "" || len(next.NodeIDMap) != 4 {
		t.Fatalf("no-op move changed document: %v", err)
	}
}
