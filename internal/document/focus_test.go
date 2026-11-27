package document

import (
	"os"
	"strings"
	"testing"
)

func TestFocusFirstOnOpenAndUniqueOnSave(t *testing.T) {
	s, _, path := setupMove(t)
	source := "# A [color:#abc] [isFocus] [isFoldKid] [isFocus]\r\n## B\r\n续行 [isFold] [isFocus]\r\n"
	if err := os.WriteFile(path, []byte(source), 0644); err != nil {
		t.Fatal(err)
	}
	snap, err := s.Open("a.mind.md")
	if err != nil {
		t.Fatal(err)
	}
	disk, _ := os.ReadFile(path)
	a := snap.Root.Children[0]
	b := a.Children[0]
	if string(disk) != source || snap.Source != source || snap.FocusedID != a.ID || a.Label != "A" || b.Label != "B\n续行" {
		t.Fatal("opening duplicate markers changed the file or selected the wrong node")
	}
	save := func(kind, id, value string) {
		t.Helper()
		next, err := s.Apply(Edit{Session: snap.Session, Version: snap.Version, Kind: kind, NodeID: id, Text: value, OpID: randomID()})
		if err != nil {
			t.Fatal(err)
		}
		snap = next
	}
	save("label", b.ID, "改名\n续行")
	if strings.Count(snap.Source, "[isFocus]") != 1 || snap.FocusedID != a.ID {
		t.Fatal(snap.Source)
	}
	save("node-focus", b.ID, "true")
	snap, err = s.Open("a.mind.md")
	if err != nil {
		t.Fatal(err)
	}
	if snap.FocusedID != b.ID || !strings.Contains(snap.Source, "续行 [isFold] [isFocus]\r\n") || !snap.Root.Children[0].FoldKid {
		t.Fatal(snap.Source)
	}
	copied, err := s.doc.BranchMarkdown(a.ID, nil)
	if err != nil || strings.Contains(copied, "[isFocus]") {
		t.Fatalf("copy: %q %v", copied, err)
	}
	save("node-focus", b.ID, "false")
	if snap.FocusedID != "" || strings.Contains(snap.Source, "[isFocus]") {
		t.Fatal(snap.Source)
	}
	save("source", "", "# ###\n")
	save("node-focus", snap.Root.Children[0].ID, "true")
	if snap.Source != "# [isFocus] ###\r\n" || snap.FocusedID == "" {
		t.Fatal(snap.Source)
	}
}
