package main

import (
	"os"
	"path/filepath"
	"sync"
	"testing"

	"openmind/internal/document"
)

func externalOpenApp(t *testing.T) *App {
	t.Helper()
	a := &App{stateDir: t.TempDir(), service: document.New(t.TempDir()), changed: make(chan struct{}, 1)}
	t.Cleanup(func() {
		if a.watcher != nil {
			a.watcher.Close()
		}
	})
	return a
}

func externalOpenFile(t *testing.T, root, name string, content []byte) string {
	t.Helper()
	path := filepath.Join(root, name)
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, content, 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestExternalOpenColdWarmAndWorkspaceSwitch(t *testing.T) {
	a := externalOpenApp(t)
	root := t.TempDir()
	first := externalOpenFile(t, root, "中文 空格.md", []byte("# 第一份\n"))
	a.onFileOpen(first)
	requests := a.TakePendingFileOpens()
	if len(requests) != 1 || requests[0] != first || len(a.TakePendingFileOpens()) != 0 {
		t.Fatal("cold-start file event was lost or delivered twice")
	}
	opened, err := a.OpenExternalDocument(requests[0])
	if err != nil || opened.Snapshot.Source != "# 第一份\n" || opened.Snapshot.Path != "中文 空格.md" {
		t.Fatalf("cold open: %+v, %v", opened, err)
	}
	workspaceRoot := opened.Workspace.Root
	second := externalOpenFile(t, root, "子目录/导图.mind.md", []byte("# 导图\n\n## 子节点\n"))
	opened, err = a.OpenExternalDocument(second)
	if err != nil || opened.Workspace.Root != workspaceRoot || opened.Snapshot.Path != "子目录/导图.mind.md" {
		t.Fatalf("warm open must retain the containing workspace: %+v, %v", opened, err)
	}
	other := externalOpenFile(t, t.TempDir(), "其他.MARKDOWN", []byte("# 新工作区\n"))
	opened, err = a.OpenExternalDocument(other)
	if err != nil || opened.Workspace.Root == workspaceRoot || opened.Snapshot.Source != "# 新工作区\n" {
		t.Fatalf("outside workspace open: %+v, %v", opened, err)
	}
	current, err := a.CheckDocument()
	if err != nil || current != nil {
		t.Fatalf("opened document should already match disk: %+v, %v", current, err)
	}
}

func TestExternalOpenFailurePreservesDocumentAndWorkspace(t *testing.T) {
	a := externalOpenApp(t)
	first := externalOpenFile(t, t.TempDir(), "当前.md", []byte("# 保留当前\n"))
	opened, err := a.OpenExternalDocument(first)
	if err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(filepath.Join(a.stateDir, "workspace.json"))
	if err != nil {
		t.Fatal(err)
	}
	other := t.TempDir()
	invalid := externalOpenFile(t, other, "无效.md", []byte{0xff})
	plain := externalOpenFile(t, other, "正文.txt", []byte("text"))
	link := filepath.Join(other, "链接.md")
	if err := os.Symlink(first, link); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{invalid, plain, link, filepath.Join(other, "不存在.md"), "相对.md"} {
		if _, err := a.OpenExternalDocument(path); err == nil {
			t.Fatalf("invalid target accepted: %s", path)
		}
		if a.workspace.Root != opened.Workspace.Root {
			t.Fatalf("failed open replaced the workspace: %s", path)
		}
		snapshot, err := a.ReparseDocument(opened.Snapshot.Session)
		if err != nil || snapshot.Source != opened.Snapshot.Source {
			t.Fatalf("failed open replaced the document: %+v, %v", snapshot, err)
		}
		opened.Snapshot = snapshot
	}
	after, err := os.ReadFile(filepath.Join(a.stateDir, "workspace.json"))
	if err != nil || string(before) != string(after) {
		t.Fatal("failed open changed persisted workspace")
	}
	a.stateDir = filepath.Join(other, "missing-state-directory")
	valid := externalOpenFile(t, other, "有效.md", []byte("# 新文件\n"))
	if _, err := a.OpenExternalDocument(valid); err == nil {
		t.Fatal("workspace persistence failure ignored")
	}
	if _, err := a.ReparseDocument(opened.Snapshot.Session); err != nil || a.workspace.Root != opened.Workspace.Root {
		t.Fatal("persistence failure replaced current session or workspace")
	}
}

func TestExternalOpenConcurrentDelivery(t *testing.T) {
	a := externalOpenApp(t)
	var senders sync.WaitGroup
	for i := 0; i < 50; i++ {
		senders.Add(1)
		go func() { defer senders.Done(); a.onFileOpen("/tmp/笔记.md") }()
	}
	senders.Wait()
	if len(a.TakePendingFileOpens()) != 50 {
		t.Fatal("concurrent file events were lost")
	}
}

func TestExternalOpenOnlyExplicitFoldersAppearInSwitcher(t *testing.T) {
	a := externalOpenApp(t)
	assertFolders := func(app *App, roots ...string) {
		t.Helper()
		folders, err := app.RecentWorkspaces()
		if err != nil || len(folders) != len(roots) {
			t.Fatalf("folder switcher: %+v, want %v, error %v", folders, roots, err)
		}
		for i, root := range roots {
			if folders[i].Root != root {
				t.Fatalf("folder %d: %s, want %s", i, folders[i].Root, root)
			}
		}
	}
	first := externalOpenFile(t, t.TempDir(), "外部.md", []byte("# 外部\n"))
	opened, err := a.OpenExternalDocument(first)
	if err != nil {
		t.Fatal(err)
	}
	assertFolders(a)
	restarted := externalOpenApp(t)
	restarted.stateDir = a.stateDir
	if _, err := restarted.RestoreWorkspace(); err != nil {
		t.Fatal(err)
	}
	assertFolders(restarted)
	added, err := a.openWorkspace(opened.Workspace.Root)
	if err != nil {
		t.Fatal(err)
	}
	assertFolders(a, added.Root)
	for _, path := range []string{
		first,
		externalOpenFile(t, t.TempDir(), "其他.mind.md", []byte("# 导图\n")),
		first,
	} {
		if _, err := a.OpenExternalDocument(path); err != nil {
			t.Fatal(err)
		}
		assertFolders(a, added.Root)
	}
	if err := a.RemoveRecentWorkspace(added.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := a.OpenExternalDocument(externalOpenFile(t, t.TempDir(), "切换.md", []byte("# 切换\n"))); err != nil {
		t.Fatal(err)
	}
	if _, err := a.OpenExternalDocument(first); err != nil {
		t.Fatal(err)
	}
	assertFolders(a)
	assertFolders(restarted)
}
