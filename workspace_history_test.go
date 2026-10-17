package main

import (
	"os"
	"path/filepath"
	"testing"

	"openmind/internal/document"
)

func TestWorkspaceHistoryMigrationAndLimit(t *testing.T) {
	a := &App{stateDir: t.TempDir()}
	empty, err := a.RecentWorkspaces()
	if err != nil || empty == nil || len(empty) != 0 {
		t.Fatalf("empty history: %v, %v", empty, err)
	}
	if err := os.WriteFile(filepath.Join(a.stateDir, "workspace.json"), []byte(`{"root":"/old","name":"old"}`), 0600); err != nil {
		t.Fatal(err)
	}
	saved, err := a.readWorkspaceState()
	if err != nil || len(saved.Recent) != 1 || saved.Recent[0].Root != "/old" {
		t.Fatalf("migration: %+v, %v", saved, err)
	}
	for _, root := range []string{"/a", "/b", "/c", "/d", "/b"} {
		saved.WorkspaceInfo = WorkspaceInfo{Root: root}
		saved.Recent = recentWorkspaces(saved.WorkspaceInfo, saved.Recent)
		if err := a.writeWorkspaceState(saved); err != nil {
			t.Fatal(err)
		}
	}
	restarted := &App{stateDir: a.stateDir}
	recent, err := restarted.RecentWorkspaces()
	if err != nil {
		t.Fatal(err)
	}
	if len(recent) != 4 {
		t.Fatalf("got %d entries", len(recent))
	}
	for i, root := range []string{"/b", "/d", "/c", "/a"} {
		if recent[i].Root != root {
			t.Fatalf("entry %d: %+v", i, recent[i])
		}
	}
}

func TestRecentWorkspaceSwitchAndFailure(t *testing.T) {
	base := t.TempDir()
	a := &App{stateDir: t.TempDir(), service: document.New(t.TempDir()), changed: make(chan struct{}, 1)}
	t.Cleanup(func() {
		if a.watcher != nil {
			a.watcher.Close()
		}
	})
	for _, name := range []string{"first", "second"} {
		root := filepath.Join(base, name)
		if err := os.Mkdir(root, 0700); err != nil {
			t.Fatal(err)
		}
		if _, err := a.openWorkspace(root); err != nil {
			t.Fatal(err)
		}
	}
	recent, err := a.RecentWorkspaces()
	if err != nil {
		t.Fatal(err)
	}
	first, second := recent[1].Root, recent[0].Root
	if _, err := a.OpenRecentWorkspace(first); err != nil {
		t.Fatal(err)
	}
	if a.workspace.Root != first {
		t.Fatal("workspace did not switch")
	}
	if err := os.Remove(second); err != nil {
		t.Fatal(err)
	}
	if _, err := a.OpenRecentWorkspace(second); err == nil {
		t.Fatal("missing workspace accepted")
	}
	if a.workspace.Root != first {
		t.Fatal("failed switch replaced workspace")
	}
	before, err := os.ReadFile(filepath.Join(a.stateDir, "workspace.json"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.OpenRecentWorkspace(base); err == nil {
		t.Fatal("unlisted workspace accepted")
	}
	a.stateDir = filepath.Join(base, "missing-state")
	if _, err := a.openWorkspace(base); err == nil {
		t.Fatal("persistence failure ignored")
	}
	if a.workspace.Root != first {
		t.Fatal("persistence failure replaced workspace")
	}
	if len(before) == 0 {
		t.Fatal("no persisted history")
	}
}

func TestRecentWorkspaceFollowsRenameAfterRestart(t *testing.T) {
	base := t.TempDir()
	base, _ = filepath.EvalSymlinks(base)
	oldRoot := filepath.Join(base, "原名称")
	newRoot := filepath.Join(base, "新名称")
	if err := os.Mkdir(oldRoot, 0700); err != nil {
		t.Fatal(err)
	}
	a := &App{stateDir: t.TempDir(), service: document.New(t.TempDir()), changed: make(chan struct{}, 1)}
	original, err := a.openWorkspace(oldRoot)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(oldRoot, "笔记.md"), []byte("# 内容\n"), 0600); err != nil {
		t.Fatal(err)
	}
	snapshot, err := a.OpenDocument("笔记.md")
	if err != nil {
		t.Fatal(err)
	}
	a.watcher.Close()
	if err := os.Rename(oldRoot, newRoot); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(oldRoot, 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := a.ApplyEdit(document.Edit{Session: snapshot.Session, Version: snapshot.Version, OpID: "after-root-rename", Kind: "source", Text: "# 改名后继续编辑\n"}); err != nil {
		t.Fatalf("editing active workspace after rename: %v", err)
	}
	restarted := &App{stateDir: a.stateDir, service: document.New(t.TempDir()), changed: make(chan struct{}, 1)}
	t.Cleanup(func() {
		if restarted.watcher != nil {
			restarted.watcher.Close()
		}
	})
	recent, err := restarted.RecentWorkspaces()
	if err != nil || len(recent) != 1 || recent[0].Root != newRoot || recent[0].Name != "新名称" {
		t.Fatalf("renamed history: %+v, %v", recent, err)
	}
	info, err := restarted.OpenRecentWorkspace(original.ID)
	if err != nil || info.Root != newRoot {
		t.Fatalf("switch from stale menu: %+v, %v", info, err)
	}
	restored, err := restarted.RestoreWorkspace()
	if err != nil || restored.Root != newRoot {
		t.Fatalf("restore renamed workspace: %+v, %v", restored, err)
	}
	if err := os.Rename(newRoot, filepath.Join(base, "再次改名")); err != nil {
		t.Fatal(err)
	}
	info, err = restarted.OpenRecentWorkspace(original.ID)
	if err != nil || info.Name != "再次改名" {
		t.Fatalf("rename while menu is open: %+v, %v", info, err)
	}
}

func TestRecentWorkspaceMigratesLegacyAndRejectsDeletedFolder(t *testing.T) {
	base := t.TempDir()
	base, _ = filepath.EvalSymlinks(base)
	oldRoot := filepath.Join(base, "旧笔记")
	newRoot := filepath.Join(base, "新笔记")
	if err := os.Mkdir(oldRoot, 0700); err != nil {
		t.Fatal(err)
	}
	a := &App{stateDir: t.TempDir(), service: document.New(t.TempDir()), changed: make(chan struct{}, 1)}
	if err := a.writeWorkspaceState(workspaceState{WorkspaceInfo: WorkspaceInfo{Root: oldRoot}}); err != nil {
		t.Fatal(err)
	}
	recent, err := a.RecentWorkspaces()
	if err != nil || len(recent) != 1 || recent[0].ID == "" || recent[0].Bookmark != "" || recent[0].Unavailable {
		t.Fatalf("legacy migration: %+v, %v", recent, err)
	}
	id := recent[0].ID
	if err := os.Rename(oldRoot, newRoot); err != nil {
		t.Fatal(err)
	}
	recent, err = a.RecentWorkspaces()
	if err != nil || recent[0].Root != newRoot || recent[0].ID != id {
		t.Fatalf("migrated rename: %+v, %v", recent, err)
	}
	if err := os.Remove(newRoot); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(newRoot, 0700); err != nil {
		t.Fatal(err)
	}
	recent, err = a.RecentWorkspaces()
	if err != nil || !recent[0].Unavailable {
		t.Fatalf("deleted original should be unavailable: %+v, %v", recent, err)
	}
	if _, err := a.OpenRecentWorkspace(id); err == nil {
		t.Fatal("switched to replacement folder")
	}
	if _, err := a.RestoreWorkspace(); err == nil {
		t.Fatal("restored replacement folder")
	}
	selected, err := a.openWorkspace(newRoot)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { a.watcher.Close() })
	if selected.ID == id {
		t.Fatal("reselecting replacement reused original directory identity")
	}
	recent, err = a.RecentWorkspaces()
	if err != nil || len(recent) != 1 || recent[0].Unavailable {
		t.Fatalf("reselected folder: %+v, %v", recent, err)
	}
}

func TestRemoveRecentWorkspacePersistsWithoutClosingCurrent(t *testing.T) {
	base := t.TempDir()
	base, _ = filepath.EvalSymlinks(base)
	a := &App{stateDir: t.TempDir(), service: document.New(t.TempDir()), changed: make(chan struct{}, 1)}
	t.Cleanup(func() {
		if a.watcher != nil {
			a.watcher.Close()
		}
	})
	missing := filepath.Join(base, "missing")
	currentRoot := filepath.Join(base, "current")
	for _, root := range []string{missing, currentRoot} {
		if err := os.Mkdir(root, 0700); err != nil {
			t.Fatal(err)
		}
		if _, err := a.openWorkspace(root); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Remove(missing); err != nil {
		t.Fatal(err)
	}
	if err := a.RemoveRecentWorkspace(missing); err != nil {
		t.Fatal(err)
	}
	recent, err := a.RecentWorkspaces()
	if err != nil || len(recent) != 1 {
		t.Fatalf("remove missing folder: %+v, %v", recent, err)
	}
	currentID := recent[0].ID
	workspace, watch := a.workspace, a.watcher
	if err := a.RemoveRecentWorkspace(currentID); err != nil {
		t.Fatal(err)
	}
	if a.workspace != workspace || a.watcher != watch {
		t.Fatal("removing history changed the active workspace")
	}
	if _, err := os.Stat(workspace.Root); err != nil {
		t.Fatal("removing history deleted the directory")
	}
	restarted := &App{stateDir: a.stateDir, service: document.New(t.TempDir()), changed: make(chan struct{}, 1)}
	t.Cleanup(func() {
		if restarted.watcher != nil {
			restarted.watcher.Close()
		}
	})
	for i := 0; i < 2; i++ {
		recent, err = restarted.RecentWorkspaces()
		if err != nil || recent == nil || len(recent) != 0 {
			t.Fatalf("removed records returned: %+v, %v", recent, err)
		}
	}
	if _, err := restarted.OpenRecentWorkspace(currentID); err == nil {
		t.Fatal("removed history can still be selected")
	}
	restored, err := restarted.RestoreWorkspace()
	if err != nil || restored.ID != currentID {
		t.Fatalf("restore current workspace: %+v, %v", restored, err)
	}
	recent, err = restarted.RecentWorkspaces()
	if err != nil || len(recent) != 0 {
		t.Fatalf("restoring resurrected history: %+v, %v", recent, err)
	}
	if _, err := restarted.openWorkspace(restored.Root); err != nil {
		t.Fatal(err)
	}
	recent, err = restarted.RecentWorkspaces()
	if err != nil || len(recent) != 1 || recent[0].ID != currentID {
		t.Fatalf("explicitly adding folder again: %+v, %v", recent, err)
	}
}

func TestRemoveRecentWorkspaceReportsPersistenceFailure(t *testing.T) {
	a := &App{stateDir: t.TempDir()}
	if err := a.writeWorkspaceState(workspaceState{Recent: []WorkspaceInfo{{Root: "/missing", Name: "missing", Unavailable: true}}}); err != nil {
		t.Fatal(err)
	}
	a.stateDir = filepath.Join(a.stateDir, "missing-state")
	if err := a.RemoveRecentWorkspace("/missing"); err == nil {
		t.Fatal("persistence failure ignored")
	}
}
