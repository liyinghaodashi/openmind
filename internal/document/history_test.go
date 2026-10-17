package document

import (
	"os"
	"testing"
)

func TestRestoreMindPreservesExactSourceAndRetry(t *testing.T) {
	s, _, path := setupMove(t)
	original := "# Root\r\n## A [color:#5EAA80]\n### Child\r\n- Leaf\n## B\r\n"
	if err := os.WriteFile(path, []byte(original), 0644); err != nil {
		t.Fatal(err)
	}
	snap, err := s.Open("a.mind.md")
	if err != nil {
		t.Fatal(err)
	}
	a, b := snap.Root.Children[0].Children[0].ID, snap.Root.Children[0].Children[1].ID
	snap, err = s.Apply(Edit{Session: snap.Session, Version: snap.Version, OpID: "move", Kind: "move-node", NodeID: a, TargetID: b, Placement: "after"})
	if err != nil {
		t.Fatal(err)
	}
	if snap.Source == original {
		t.Fatal("fixture did not move the subtree")
	}
	edit := Edit{Session: snap.Session, Version: snap.Version, OpID: "restore", Kind: "restore-mind", Text: original}
	restored, err := s.Apply(edit)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil || restored.Source != original || string(data) != original {
		t.Fatalf("restore must preserve mixed line endings, color and descendants: %v, %q", err, data)
	}
	retry, err := s.Apply(edit)
	if err != nil || retry != restored || s.commits != 2 {
		t.Fatalf("restore retry must not write twice: %v", err)
	}
}

func TestRestoreMindRejectsExternalConflictAndMarkdown(t *testing.T) {
	s, snap, path := setupMove(t)
	external := "# External\n"
	if err := os.WriteFile(path, []byte(external), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Apply(Edit{Session: snap.Session, Version: snap.Version, OpID: "restore", Kind: "restore-mind", Text: "# History\n"}); err == nil {
		t.Fatal("restore accepted an external conflict")
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != external {
		t.Fatalf("restore overwrote external changes: %v", err)
	}
	s, snap, _ = setup(t)
	if _, err := s.Apply(Edit{Session: snap.Session, Version: snap.Version, OpID: "restore", Kind: "restore-mind", Text: "# History\n"}); err == nil || s.commits != 0 {
		t.Fatal("ordinary Markdown accepted a mind restore")
	}
}
