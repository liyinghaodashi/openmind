package document

import (
	"os"
	"strings"
	"testing"
)

func TestChildrenFoldWriteConflictAndRecovery(t *testing.T) {
	s, snap, path := setupMove(t)
	id := snap.Root.Children[0].ID
	edit := Edit{Session: snap.Session, Version: snap.Version, OpID: "fold", Kind: "node-fold-kid", NodeID: id, Text: "true"}
	next, err := s.Apply(edit)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != next.Source || !next.Root.Children[0].FoldKid {
		t.Fatalf("save: %v", err)
	}
	if _, err := s.Apply(edit); err != nil || s.commits != 1 {
		t.Fatal("fold retry must be idempotent")
	}
	snap, err = s.Open("a.mind.md")
	if err != nil || !snap.Root.Children[0].FoldKid {
		t.Fatalf("reopen: %v", err)
	}
	external := "# 外部修改\n"
	if err := os.WriteFile(path, []byte(external), 0644); err != nil {
		t.Fatal(err)
	}
	edit.Session, edit.Version, edit.OpID, edit.Text = snap.Session, snap.Version, "unfold", "false"
	if _, err := s.Apply(edit); err == nil {
		t.Fatal("must reject external conflict")
	}
	data, err = os.ReadFile(path)
	if err != nil || string(data) != external {
		t.Fatal("conflict must preserve external file")
	}
	recovery, err := s.PreserveDraft(snap.Session, "node-fold-kid", id, "false")
	if err != nil {
		t.Fatal(err)
	}
	data, err = os.ReadFile(recovery)
	if err != nil || strings.Contains(string(data), "[isFoldKid]") || !strings.Contains(string(data), "## A") {
		t.Fatalf("recovery must contain unfolded document: %q %v", data, err)
	}
}
