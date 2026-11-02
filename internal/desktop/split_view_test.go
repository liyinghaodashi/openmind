package desktop

import (
	"os"
	"path/filepath"
	"testing"

	"openmind/internal/document"
)

func TestSplitPaneWritesAndSessionIsolation(t *testing.T) {
	a := externalOpenApp(t)
	root := t.TempDir()
	leftPath := externalOpenFile(t, root, "左.md", []byte("# 左"))
	rightPath := externalOpenFile(t, root, "右.mind.md", []byte("# 右"))
	left, err := a.OpenExternalDocument(leftPath)
	if err != nil {
		t.Fatal(err)
	}
	right, err := a.OpenRightDocument(filepath.Base(rightPath))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = a.OpenDocument(right.Path); err == nil {
		t.Fatal("right document opened twice")
	}
	if _, err = a.OpenRightDocument(left.Snapshot.Path); err == nil {
		t.Fatal("left document opened twice")
	}
	edit := func(snapshot *document.Snapshot, text string) error {
		_, err := a.ApplyEdit(document.Edit{Session: snapshot.Session, Version: snapshot.Version, Kind: "source", OpID: "save", Text: text})
		return err
	}
	results := make(chan error, 2)
	go func() { results <- edit(left.Snapshot, "# 左栏保存") }()
	go func() { results <- edit(right, "# 右栏保存") }()
	for i := 0; i < 2; i++ {
		if err = <-results; err != nil {
			t.Fatal(err)
		}
	}
	for path, want := range map[string]string{leftPath: "# 左栏保存", rightPath: "# 右栏保存"} {
		data, err := os.ReadFile(path)
		if err != nil || string(data) != want {
			t.Fatalf("%s: %q, %v", path, data, err)
		}
	}
	if err = os.WriteFile(rightPath, []byte("# external"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = a.RenameDocument(right.Path, "changed.md"); err == nil {
		t.Fatal("renamed an externally modified open document")
	}
	reloaded, err := a.CheckRightDocument()
	if err != nil || reloaded == nil || reloaded.Source != "# external" {
		t.Fatalf("reload: %+v %v", reloaded, err)
	}
	if _, err = a.ReparseDocument(reloaded.Session); err != nil {
		t.Fatal(err)
	}
	a.CloseRightDocument()
	if err = edit(right, "stale"); err == nil {
		t.Fatal("closed session accepted")
	}
	if _, err = a.OpenDocument(right.Path); err != nil {
		t.Fatal(err)
	}
}
