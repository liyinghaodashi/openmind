package workspace

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNestedTreeAndPathBoundary(t *testing.T) {
	root := t.TempDir()
	os.Mkdir(filepath.Join(root, "后端"), 0755)
	os.WriteFile(filepath.Join(root, "readme.MD"), []byte("# A"), 0644)
	os.WriteFile(filepath.Join(root, "notes.txt"), []byte("private"), 0644)
	w, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	entries, err := w.List("")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 || !entries[0].Directory {
		t.Fatalf("bad tree %#v", entries)
	}
	for _, path := range []string{"../escape.md", "/tmp/out.md"} {
		if _, err = w.Resolve(path, true); err == nil {
			t.Fatal("path escaped")
		}
	}
	if err = os.Symlink(t.TempDir(), filepath.Join(root, "link")); err != nil {
		t.Fatal(err)
	}
	if _, err = w.Resolve("link/new.md", true); err == nil {
		t.Fatal("followed symlink")
	}
}
