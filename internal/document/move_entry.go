package document

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"openmind/internal/markdown"
)

type MoveResult struct {
	Path     string    `json:"path"`
	Snapshot *Snapshot `json:"snapshot,omitempty"`
}

func (s *Service) MoveEntry(path, parent string) (*MoveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.workspace == nil {
		return nil, fmt.Errorf("请先选择文件夹")
	}
	rel := filepath.ToSlash(filepath.Clean(path))
	if rel == "." {
		return nil, fmt.Errorf("不能移动工作区根目录")
	}
	full, err := s.workspace.Resolve(path, false)
	if err != nil {
		return nil, err
	}
	info, err := os.Lstat(full)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		if _, _, err := s.fileOperationPath(rel); err != nil {
			return nil, err
		}
	}
	directory := filepath.ToSlash(filepath.Clean(parent))
	if directory == "." {
		directory = ""
	}
	if info.IsDir() && (directory == rel || strings.HasPrefix(directory, rel+"/")) {
		return nil, fmt.Errorf("不能把文件夹移入自身或子文件夹")
	}
	targetDir, err := s.workspace.Resolve(parent, false)
	if err != nil {
		return nil, err
	}
	targetInfo, err := os.Stat(targetDir)
	if err != nil {
		return nil, err
	}
	if !targetInfo.IsDir() {
		return nil, fmt.Errorf("目标必须是文件夹")
	}
	if os.SameFile(info, targetInfo) {
		return nil, fmt.Errorf("不能把文件夹移入自身")
	}
	oldParent, err := os.Stat(filepath.Dir(full))
	if err != nil {
		return nil, err
	}
	if os.SameFile(oldParent, targetInfo) {
		result := &MoveResult{Path: rel}
		if s.doc != nil && s.path == rel {
			result.Snapshot = s.snapshot()
		}
		return result, nil
	}
	next := filepath.ToSlash(filepath.Join(directory, filepath.Base(rel)))
	currentPath := ""
	var moved *markdown.Document
	if s.doc != nil && (s.path == rel || info.IsDir() && strings.HasPrefix(s.path, rel+"/")) {
		if _, _, err := s.fileOperationPath(s.path); err != nil {
			return nil, err
		}
		currentPath = next + strings.TrimPrefix(s.path, rel)
		moved, err = markdown.Parse(s.doc.Source, currentPath)
		if err != nil {
			return nil, err
		}
	}
	target, err := s.workspace.Resolve(next, true)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		var source []byte
		source, err = s.relocateMarkdown(full, target, rel, next)
		if err == nil && moved != nil {
			moved, err = markdown.Parse(source, currentPath)
		}
	} else {
		err = renameFile(full, target)
	}
	if err != nil {
		if os.IsExist(err) {
			return nil, fmt.Errorf("目标文件夹已有同名文件或文件夹，未移动")
		}
		return nil, fmt.Errorf("移动失败：%w", err)
	}
	result := &MoveResult{Path: next}
	if moved != nil {
		s.path = currentPath
		s.doc = moved
		s.version++
		s.lastOp = ""
		s.lastReply = nil
		result.Snapshot = s.snapshot()
	}
	return result, nil
}
