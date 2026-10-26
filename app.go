package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"openmind/internal/appicon"
	"openmind/internal/document"
	"openmind/internal/globalshortcut"
	"openmind/internal/watcher"
	"openmind/internal/workspace"
)

type WorkspaceInfo struct {
	Root        string `json:"root"`
	Name        string `json:"name"`
	ID          string `json:"id,omitempty"`
	Bookmark    string `json:"bookmark,omitempty"`
	Unavailable bool   `json:"unavailable,omitempty"`
}
type App struct {
	ctx           context.Context
	service       *document.Service
	stateDir      string
	mu            sync.Mutex
	watcher       *watcher.Watcher
	workspace     *workspace.Workspace
	changed       chan struct{}
	done          chan struct{}
	allowClose    atomic.Bool
	frontendReady atomic.Bool
	fileOpenMu    sync.Mutex
	pendingFiles  []string

	shortcut            globalshortcut.Manager
	shortcutInitialized bool
	shortcutRequested   string
	shortcutWarning     string
}

func NewApp() (*App, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	state := filepath.Join(base, "OpenMind")
	if err = os.MkdirAll(state, 0700); err != nil {
		return nil, err
	}
	return &App{service: document.New(filepath.Join(state, "recovery")), stateDir: state, changed: make(chan struct{}, 1), done: make(chan struct{})}, nil
}
func (a *App) startup(ctx context.Context) {
	a.fileOpenMu.Lock()
	defer a.fileOpenMu.Unlock()
	a.ctx = ctx
}
func (a *App) domReady(ctx context.Context) {
	appicon.Apply()
	go func() {
		tick := time.NewTicker(3 * time.Second)
		defer tick.Stop()
		for {
			select {
			case <-a.done:
				return
			case <-a.changed:
				runtime.EventsEmit(ctx, "workspace:changed")
			case <-tick.C:
				runtime.EventsEmit(ctx, "document:check")
			}
		}
	}()
}
func (a *App) shutdown(ctx context.Context) {
	close(a.done)
	a.mu.Lock()
	defer a.mu.Unlock()
	a.shortcut.Close()
	if a.watcher != nil {
		a.watcher.Close()
	}
}
func (a *App) beforeClose(ctx context.Context) bool {
	if a.allowClose.Load() || !a.frontendReady.Load() {
		return false
	}
	runtime.EventsEmit(ctx, "app:closing")
	return true
}
func (a *App) FinishClose() { a.allowClose.Store(true); runtime.Quit(a.ctx) }

func (a *App) FrontendReady() { a.frontendReady.Store(true) }

func (a *App) SelectWorkspace() (*WorkspaceInfo, error) {
	root, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "选择 Markdown 工作区"})
	if err != nil {
		return nil, err
	}
	if root == "" {
		return nil, nil
	}
	return a.openWorkspace(root)
}
func (a *App) RestoreWorkspace() (*WorkspaceInfo, error) {
	a.mu.Lock()
	saved, err := a.readWorkspaceState()
	a.mu.Unlock()
	if err != nil || saved.Root == "" {
		return nil, err
	}
	if saved.Unavailable {
		return nil, fmt.Errorf("原文件夹已不可用，请重新选择文件夹")
	}
	return a.openWorkspaceWithHistory(saved.Root, false)
}
func (a *App) RecentWorkspaces() ([]WorkspaceInfo, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	saved, err := a.readWorkspaceState()
	for i := range saved.Recent {
		saved.Recent[i].Bookmark = ""
	}
	return saved.Recent, err
}
func (a *App) RemoveRecentWorkspace(key string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	saved, err := a.readWorkspaceState()
	if err != nil {
		return err
	}
	remaining := make([]WorkspaceInfo, 0, len(saved.Recent))
	for _, info := range saved.Recent {
		if info.Root == key || info.ID != "" && info.ID == key {
			continue
		}
		remaining = append(remaining, info)
	}
	saved.Recent = remaining
	return a.writeWorkspaceState(saved)
}
func (a *App) OpenRecentWorkspace(root string) (*WorkspaceInfo, error) {
	a.mu.Lock()
	saved, err := a.readWorkspaceState()
	a.mu.Unlock()
	if err != nil {
		return nil, err
	}
	for _, info := range saved.Recent {
		if info.Root == root || info.ID != "" && info.ID == root {
			if err := resolveWorkspaceRecord(&info); err != nil {
				return nil, fmt.Errorf("原文件夹已不可用，请重新添加：%w", err)
			}
			return a.openWorkspace(info.Root)
		}
	}
	return nil, fmt.Errorf("该文件夹不在快捷列表中，请重新添加")
}

func (a *App) OpenRecentWorkspaceInFinder(root string) error {
	a.mu.Lock()
	saved, err := a.readWorkspaceState()
	a.mu.Unlock()
	if err != nil {
		return err
	}
	for _, info := range saved.Recent {
		if info.Root != root && (info.ID == "" || info.ID != root) {
			continue
		}
		if err := resolveWorkspaceRecord(&info); err != nil {
			return fmt.Errorf("原文件夹已不可用，请重新添加：%w", err)
		}
		full, err := filepath.Abs(info.Root)
		if err != nil {
			return err
		}
		stat, err := os.Stat(full)
		if err != nil {
			return fmt.Errorf("无法打开文件夹：%w", err)
		}
		if !stat.IsDir() {
			return fmt.Errorf("该路径已不是文件夹")
		}
		return exec.Command("open", "-a", "Finder", full).Run()
	}
	return fmt.Errorf("该文件夹不在快捷列表中，请重新添加")
}

func (a *App) openWorkspace(root string) (*WorkspaceInfo, error) {
	return a.openWorkspaceWithHistory(root, true)
}

func (a *App) openWorkspaceWithHistory(root string, remember bool) (*WorkspaceInfo, error) {
	info, _, err := a.openWorkspaceTarget(root, remember, "")
	return info, err
}

func (a *App) openWorkspaceTarget(root string, remember bool, path string) (*WorkspaceInfo, *document.Snapshot, error) {
	w, err := workspace.Open(root)
	if err != nil {
		return nil, nil, err
	}
	watch, err := watcher.Start(w.Root, func() {
		select {
		case a.changed <- struct{}{}:
		default:
		}
	})
	if err != nil {
		return nil, nil, fmt.Errorf("启动 FSEvents 失败：%w", err)
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	info := &WorkspaceInfo{Root: w.Root, Name: filepath.Base(w.Root)}
	saved, err := a.readWorkspaceState()
	if err == nil {
		if saved.Root == info.Root && !saved.Unavailable {
			info.ID = saved.ID
			info.Bookmark = saved.Bookmark
		}
		for _, previous := range saved.Recent {
			if previous.Root == info.Root && !previous.Unavailable {
				info.ID = previous.ID
				info.Bookmark = previous.Bookmark
				break
			}
		}
		err = trackWorkspace(info)
	}
	commit := func() error {
		if err != nil {
			return err
		}
		saved.WorkspaceInfo = *info
		if remember {
			saved.Recent = recentWorkspaces(*info, saved.Recent)
		}
		return a.writeWorkspaceState(saved)
	}
	var snapshot *document.Snapshot
	if path != "" {
		snapshot, err = a.service.OpenWorkspace(w, path, commit)
	} else {
		err = commit()
		if err == nil {
			a.service.SetWorkspace(w)
		}
	}
	if err != nil {
		watch.Close()
		return nil, nil, fmt.Errorf("未切换工作区：%w", err)
	}
	if a.watcher != nil {
		a.watcher.Close()
	}
	a.watcher = watch
	a.workspace = w
	info.Bookmark = ""
	return info, snapshot, nil
}
func (a *App) ListDirectory(path string) ([]workspace.Entry, error)     { return a.service.List(path) }
func (a *App) OpenDocument(path string) (*document.Snapshot, error)     { return a.service.Open(path) }
func (a *App) ApplyEdit(edit document.Edit) (*document.Snapshot, error) { return a.service.Apply(edit) }
func (a *App) ImportImage(session, encoded string) (string, error) {
	return a.service.ImportImage(session, encoded)
}
func (a *App) DiscardImages(session string, references []string) error {
	return a.service.DiscardImages(session, references)
}
func (a *App) CopyNodeText(session, nodeID string, label *string) error {
	text, err := a.service.NodeText(session, nodeID, label)
	if err != nil {
		return err
	}
	return runtime.ClipboardSetText(a.ctx, text)
}
func (a *App) CopyNodeMarkdown(session, nodeID string, label *string) error {
	text, err := a.service.NodeMarkdown(session, nodeID, label)
	if err != nil {
		return err
	}
	return runtime.ClipboardSetText(a.ctx, text)
}
func (a *App) CheckDocument() (*document.Snapshot, error) { return a.service.Check() }
func (a *App) ReparseDocument(session string) (*document.Snapshot, error) {
	return a.service.Reparse(session)
}
func (a *App) PreserveDraft(session, kind, nodeID, value string) (string, error) {
	return a.service.PreserveDraft(session, kind, nodeID, value)
}
func (a *App) CreateEntry(parent, name string, directory bool) (string, error) {
	return a.service.Create(parent, name, directory)
}
func (a *App) RenameDocument(path, name string) (*document.RenameResult, error) {
	return a.service.Rename(path, name)
}
func (a *App) MoveEntry(path, parent string) (*document.MoveResult, error) {
	return a.service.MoveEntry(path, parent)
}
func (a *App) DeleteDocument(path string) error { return a.service.Delete(path) }
func (a *App) RevealDocument(path string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.workspace == nil {
		return fmt.Errorf("请先选择工作区")
	}
	full, err := a.workspace.Resolve(path, false)
	if err != nil {
		return err
	}
	return exec.Command("open", "-R", full).Run()
}
func (a *App) OpenRecoveryFolder() error {
	path := filepath.Join(a.stateDir, "recovery")
	if err := os.MkdirAll(path, 0700); err != nil {
		return err
	}
	return exec.Command("open", path).Run()
}
func (a *App) OpenExternalEditor(path string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.workspace == nil {
		return fmt.Errorf("请先选择工作区")
	}
	full, err := a.workspace.Resolve(path, false)
	if err != nil {
		return err
	}
	if !strings.HasSuffix(strings.ToLower(full), ".md") && !strings.HasSuffix(strings.ToLower(full), ".markdown") {
		return fmt.Errorf("只支持 Markdown")
	}
	return exec.Command("open", "-t", full).Run()
}
