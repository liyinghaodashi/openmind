package main

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"openmind/internal/document"
	"openmind/internal/workspace"
)

type ExternalDocument struct {
	Workspace *WorkspaceInfo     `json:"workspace"`
	Snapshot  *document.Snapshot `json:"snapshot"`
}

func (a *App) onFileOpen(path string) {
	a.fileOpenMu.Lock()
	a.pendingFiles = append(a.pendingFiles, path)
	ctx, ready := a.ctx, a.frontendReady.Load()
	a.fileOpenMu.Unlock()
	if ready && ctx != nil {
		runtime.WindowUnminimise(ctx)
		runtime.WindowShow(ctx)
		runtime.EventsEmit(ctx, "document:open-requested")
	}
}

func (a *App) TakePendingFileOpens() []string {
	a.fileOpenMu.Lock()
	defer a.fileOpenMu.Unlock()
	paths := a.pendingFiles
	a.pendingFiles = nil
	return paths
}

func (a *App) OpenExternalDocument(path string) (*ExternalDocument, error) {
	if !filepath.IsAbs(path) || !workspace.IsMarkdown(path) {
		return nil, fmt.Errorf("请选择 Markdown 文件的完整路径")
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(path))
	if err != nil {
		return nil, err
	}
	full := filepath.Join(parent, filepath.Base(path))
	a.mu.Lock()
	if a.workspace != nil {
		root, rootErr := a.workspace.Resolve("", false)
		if rootErr == nil {
			rel, relErr := filepath.Rel(root, full)
			if relErr == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
				snapshot, openErr := a.service.Open(filepath.ToSlash(rel))
				a.mu.Unlock()
				if openErr != nil {
					return nil, openErr
				}
				return &ExternalDocument{Workspace: &WorkspaceInfo{Root: root, Name: filepath.Base(root)}, Snapshot: snapshot}, nil
			}
		}
	}
	a.mu.Unlock()
	info, snapshot, err := a.openWorkspaceTarget(parent, false, filepath.Base(full))
	if err != nil {
		return nil, err
	}
	return &ExternalDocument{Workspace: info, Snapshot: snapshot}, nil
}
