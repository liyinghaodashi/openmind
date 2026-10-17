package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"openmind/internal/bookmark"
)

type workspaceState struct {
	WorkspaceInfo
	Recent []WorkspaceInfo `json:"recent"`
}

func recentWorkspaces(current WorkspaceInfo, previous []WorkspaceInfo) []WorkspaceInfo {
	result := make([]WorkspaceInfo, 0, 4)
	seen := make(map[string]bool)
	for _, info := range append([]WorkspaceInfo{current}, previous...) {
		if info.Root == "" || seen[info.Root] {
			continue
		}
		seen[info.Root] = true
		info.Name = filepath.Base(info.Root)
		result = append(result, info)
		if len(result) == 4 {
			break
		}
	}
	return result
}

func (a *App) readWorkspaceState() (workspaceState, error) {
	saved := workspaceState{Recent: []WorkspaceInfo{}}
	data, err := os.ReadFile(filepath.Join(a.stateDir, "workspace.json"))
	if os.IsNotExist(err) {
		return saved, nil
	}
	if err != nil {
		return saved, err
	}
	saved.Recent = nil
	if err = json.Unmarshal(data, &saved); err != nil {
		return saved, err
	}
	if saved.Recent == nil {
		saved.Recent = recentWorkspaces(saved.WorkspaceInfo, nil)
	} else {
		saved.Recent = recentWorkspaces(WorkspaceInfo{}, saved.Recent)
	}
	currentRoot, currentID := saved.Root, saved.ID
	if saved.Root != "" {
		saved.Unavailable = resolveWorkspaceRecord(&saved.WorkspaceInfo) != nil
	}
	for i := range saved.Recent {
		info := &saved.Recent[i]
		oldRoot := info.Root
		info.Unavailable = resolveWorkspaceRecord(info) != nil
		if currentID != "" && info.ID == currentID || currentID == "" && currentRoot == oldRoot {
			saved.WorkspaceInfo = *info
		}
	}
	saved.Recent = recentWorkspaces(WorkspaceInfo{}, saved.Recent)
	updated, err := json.Marshal(saved)
	if err != nil {
		return saved, err
	}
	var original workspaceState
	if err := json.Unmarshal(data, &original); err != nil {
		return saved, err
	}
	before, err := json.Marshal(original)
	if err != nil {
		return saved, err
	}
	if !bytes.Equal(before, updated) {
		if err := a.writeWorkspaceState(saved); err != nil {
			return saved, err
		}
	}
	return saved, nil
}

func resolveWorkspaceRecord(info *WorkspaceInfo) error {
	root := info.Root
	stale := false
	if info.Bookmark != "" {
		var err error
		root, stale, err = bookmark.Resolve(info.Bookmark)
		if err != nil {
			return err
		}
	}
	stat, err := os.Stat(root)
	if err != nil {
		return err
	}
	if !stat.IsDir() {
		return fmt.Errorf("该路径已不是文件夹")
	}
	if stale {
		if refreshed, err := bookmark.Create(root); err == nil {
			info.Bookmark = refreshed
		}
	}
	info.Root = root
	info.Name = filepath.Base(root)
	info.Unavailable = false
	return trackWorkspace(info)
}

func trackWorkspace(info *WorkspaceInfo) error {
	if info.Bookmark == "" {
		data, err := bookmark.Create(info.Root)
		if err != nil {
			return err
		}
		info.Bookmark = data
	}
	if info.ID == "" {
		digest := sha256.Sum256([]byte(info.Bookmark))
		info.ID = hex.EncodeToString(digest[:])
	}
	return nil
}

func (a *App) writeWorkspaceState(saved workspaceState) error {
	data, err := json.Marshal(saved)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(a.stateDir, "workspace-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err = file.Write(data); err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(file.Name(), filepath.Join(a.stateDir, "workspace.json"))
}
