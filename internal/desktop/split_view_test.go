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

func TestSameFileSplitSharesRevisionAndDetaches(t *testing.T) {
	a := externalOpenApp(t)
	root := t.TempDir()
	path := externalOpenFile(t, root, "共享.md", []byte("# 开始"))
	externalOpenFile(t, root, "第二份.md", []byte("# 第二份"))
	opened, err := a.OpenExternalDocument(path)
	if err != nil {
		t.Fatal(err)
	}
	left := opened.Snapshot
	for _, next := range []string{"第二份.md", "共享.md"} {
		right, err := a.OpenRightDocument(left.Path)
		if err != nil || right.Session != left.Session {
			t.Fatalf("shared session: %+v %v", right, err)
		}
		edit := document.Edit{Session: right.Session, Version: right.Version, OpID: "right", Kind: "source", Text: "# 右侧修改"}
		saved, err := a.ApplyEdit(edit)
		if err != nil {
			t.Fatal(err)
		}
		edit.OpID = "stale"
		edit.Text = "stale"
		if _, err = a.ApplyEdit(edit); err == nil {
			t.Fatal("stale write accepted")
		}
		if _, err = a.OpenDocument("不存在.md"); err == nil {
			t.Fatal("missing document accepted")
		}
		left, err = a.OpenDocument(next)
		if err != nil || left.Session == right.Session {
			t.Fatalf("detach: %+v %v", left, err)
		}
		edit.Version = saved.Version
		edit.OpID = "detached"
		edit.Text = "# 右栏保留原文档"
		if _, err = a.ApplyEdit(edit); err != nil {
			t.Fatal(err)
		}
		a.CloseRightDocument()
		edit.Session = left.Session
		edit.Version = left.Version
		edit.OpID = "left"
		edit.Text = "# 左侧修改"
		left, err = a.ApplyEdit(edit)
		if err != nil {
			t.Fatal(err)
		}
	}
}
