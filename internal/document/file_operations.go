package document

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"

	"openmind/internal/filestore"
	"openmind/internal/markdown"
	"openmind/internal/workspace"
)

type RenameResult struct {
	Path     string    `json:"path"`
	Snapshot *Snapshot `json:"snapshot,omitempty"`
}

func (s *Service) fileOperationPath(path string) (string, string, error) {
	if s.workspace == nil {
		return "", "", fmt.Errorf("请先选择文件夹")
	}
	if !workspace.IsMarkdown(path) {
		return "", "", fmt.Errorf("只支持操作 Markdown 文件")
	}
	full, err := s.workspace.Resolve(path, false)
	if err != nil {
		return "", "", err
	}
	info, err := os.Lstat(full)
	if err != nil {
		return "", "", err
	}
	if !info.Mode().IsRegular() {
		return "", "", fmt.Errorf("只支持普通文件")
	}
	if stat, ok := info.Sys().(*syscall.Stat_t); ok && stat.Nlink > 1 {
		return "", "", fmt.Errorf("不支持操作硬链接文件，请复制为独立文件")
	}
	rel := filepath.ToSlash(filepath.Clean(path))
	if s.doc != nil && rel == s.path {
		if s.blocked {
			return "", "", fmt.Errorf("请先处理当前文档的写入冲突或错误")
		}
		data, _, err := filestore.Read(full, markdown.MaxBytes)
		if err != nil {
			return "", "", err
		}
		if !bytes.Equal(data, s.doc.Source) {
			return "", "", fmt.Errorf("文件已被外部修改，请重新读取后再操作")
		}
	}
	return full, rel, nil
}

func (s *Service) entryOperationPath(path string) (string, string, bool, error) {
	if s.workspace == nil {
		return "", "", false, fmt.Errorf("请先选择文件夹")
	}
	rel := filepath.ToSlash(filepath.Clean(path))
	if rel == "." {
		return "", "", false, fmt.Errorf("不能重命名或删除工作区根目录")
	}
	full, err := s.workspace.Resolve(path, false)
	if err != nil {
		return "", "", false, err
	}
	info, err := os.Lstat(full)
	if err != nil {
		return "", "", false, err
	}
	if !info.IsDir() {
		full, rel, err = s.fileOperationPath(path)
		return full, rel, false, err
	}
	if s.doc != nil && strings.HasPrefix(s.path, rel+"/") {
		if _, _, err := s.fileOperationPath(s.path); err != nil {
			return "", "", false, err
		}
	}
	return full, rel, true, nil
}

func (s *Service) Rename(path, name string) (*RenameResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := workspace.ValidateName(name); err != nil {
		return nil, err
	}
	full, rel, directory, err := s.entryOperationPath(path)
	if err != nil {
		return nil, err
	}
	next := filepath.ToSlash(filepath.Join(filepath.Dir(rel), name))
	result := &RenameResult{Path: next}
	currentPath := ""
	if s.doc != nil && (s.path == rel || directory && strings.HasPrefix(s.path, rel+"/")) {
		currentPath = next + strings.TrimPrefix(s.path, rel)
	}
	if next != rel {
		var renamed *markdown.Document
		if currentPath != "" && workspace.IsMarkdown(currentPath) {
			renamed, err = markdown.Parse(s.doc.Source, currentPath)
			if err != nil {
				return nil, err
			}
		}
		target, err := s.workspace.Resolve(next, true)
		if err != nil {
			return nil, err
		}
		if !directory {
			var source []byte
			source, err = s.relocateMarkdown(full, target, rel, next)
			if err == nil && renamed != nil {
				renamed, err = markdown.Parse(source, currentPath)
			}
		} else {
			err = renameFile(full, target)
		}
		if err != nil {
			if os.IsExist(err) {
				return nil, fmt.Errorf("同名文件或文件夹已存在，请使用其他名称")
			}
			return nil, fmt.Errorf("重命名失败：%w", err)
		}
		if currentPath != "" {
			if workspace.IsMarkdown(currentPath) {
				s.path = currentPath
				s.doc = renamed
				s.version++
				s.lastOp = ""
				s.lastReply = nil
			} else {
				s.closeCurrentDocument()
			}
		}
	}
	if s.doc != nil && s.path == currentPath {
		result.Snapshot = s.snapshot()
	}
	return result, nil
}

func (s *Service) Delete(path string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	full, rel, directory, err := s.entryOperationPath(path)
	if err != nil {
		return err
	}
	if directory {
		err = s.trash(full)
	} else {
		err = s.trashMarkdown(full, rel)
	}
	if err != nil {
		return fmt.Errorf("移到废纸篓失败：%w", err)
	}
	if s.doc != nil && (s.path == rel || directory && strings.HasPrefix(s.path, rel+"/")) {
		s.closeCurrentDocument()
	}
	return nil
}

func (s *Service) closeCurrentDocument() {
	s.archive()
	s.doc = nil
	s.session = ""
	s.path = ""
	s.blocked = false
	s.lastOp = ""
	s.lastReply = nil
}
