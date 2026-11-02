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

func TestLeftReturnsToRightDocument(t *testing.T) {
	a := externalOpenApp(t)
	root := t.TempDir()
	path := externalOpenFile(t, root, "共享.md", []byte("# 开始"))
	externalOpenFile(t, root, "另一份.md", []byte("# 切换"))
	if _, err := a.OpenExternalDocument(path); err != nil {
		t.Fatal(err)
	}
	right, err := a.OpenRightDocument("共享.md")
	if err != nil {
		t.Fatal(err)
	}
	for _, opID := range []string{"first", "second"} {
		other, err := a.OpenDocument("另一份.md")
		if err != nil {
			t.Fatal(err)
		}
		right, err = a.ApplyEdit(document.Edit{Session: right.Session, Version: right.Version, Kind: "source", OpID: opID, Text: "# " + opID})
		if err != nil {
			t.Fatal(err)
		}
		left, err := a.OpenDocument(right.Path)
		if err != nil || left.Session != right.Session || left.Version != right.Version || left.Source != right.Source {
			t.Fatalf("rejoin: %+v %v", left, err)
		}
		if _, err := a.ApplyEdit(document.Edit{Session: other.Session, Version: other.Version, Kind: "source", OpID: "stale", Text: "过期写入"}); err == nil {
			t.Fatal("previous left session still active")
		}
	}
}

func TestRightDocumentSurvivesWorkspaceSwitch(t *testing.T) {
	for _, mode := range []string{"independent", "shared"} {
		t.Run(mode, func(t *testing.T) {
			a := externalOpenApp(t)
			oldRoot, newRoot := t.TempDir(), t.TempDir()
			const name = "笔记.md"
			oldFile := externalOpenFile(t, oldRoot, name, []byte("# 原文件"))
			newFile := externalOpenFile(t, newRoot, name, []byte("# 新文件"))
			externalOpenFile(t, oldRoot, "链接.md", []byte("# 旧目录的链接"))
			if mode == "shared" {
				if _, err := a.OpenExternalDocument(oldFile); err != nil {
					t.Fatal(err)
				}
			} else if _, err := a.openWorkspace(oldRoot); err != nil {
				t.Fatal(err)
			}
			right, err := a.OpenRightDocument(name)
			if err != nil {
				t.Fatal(err)
			}
			if mode == "shared" {
				if _, err := a.OpenExternalDocument(newFile); err != nil {
					t.Fatal(err)
				}
			} else {
				if _, err := a.openWorkspace(newRoot); err != nil {
					t.Fatal(err)
				}
				if _, err := a.OpenDocument(name); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := a.ApplyEdit(document.Edit{Session: right.Session, Version: right.Version, Kind: "source", OpID: "save", Text: "# 跨目录保存"}); err != nil {
				t.Fatal(err)
			}
			for path, want := range map[string]string{oldFile: "# 跨目录保存", newFile: "# 新文件"} {
				if data, err := os.ReadFile(path); err != nil || string(data) != want {
					t.Fatalf("%s = %q, %v", path, data, err)
				}
			}
			if _, err := a.CreateEntry("", "新建.md", false); err != nil {
				t.Fatal(err)
			}
			items, err := a.ListDirectory("")
			if err != nil || len(items) != 2 {
				t.Fatalf("new tree: %+v, %v", items, err)
			}
			if _, err := os.Stat(filepath.Join(newRoot, "新建.md")); err != nil {
				t.Fatal(err)
			}
			if _, err := a.OpenRightDocument("不存在.md"); err == nil {
				t.Fatal("missing replacement accepted")
			}
			if next, err := a.OpenRightLink("链接.md"); err != nil || next.Source != "# 旧目录的链接" {
				t.Fatalf("right link: %+v, %v", next, err)
			}
			if next, err := a.OpenRightDocument(name); err != nil || next.Source != "# 新文件" {
				t.Fatalf("right replacement: %+v, %v", next, err)
			}
		})
	}
}
