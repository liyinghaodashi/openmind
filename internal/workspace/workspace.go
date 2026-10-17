package workspace

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"openmind/internal/bookmark"
)

type Entry struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	Directory bool   `json:"directory"`
}

type Workspace struct {
	Root      string
	identity  os.FileInfo
	reference string
}

func Open(root string) (*Workspace, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	abs, err = filepath.EvalSymlinks(abs)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(abs)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("请选择文件夹")
	}
	reference, err := bookmark.Create(abs)
	if err != nil {
		return nil, fmt.Errorf("记录文件夹引用失败：%w", err)
	}
	return &Workspace{Root: abs, identity: info, reference: reference}, nil
}

func (w *Workspace) Resolve(rel string, allowMissing bool) (string, error) {
	root := w.Root
	info, err := os.Stat(root)
	if err != nil || !os.SameFile(info, w.identity) {
		root, _, err = bookmark.Resolve(w.reference)
		if err != nil {
			return "", fmt.Errorf("工作区不可用，请重新选择文件夹：%w", err)
		}
		info, err = os.Stat(root)
		if err != nil || !os.SameFile(info, w.identity) {
			return "", fmt.Errorf("工作区身份已变化，请重新选择文件夹")
		}
	}
	if filepath.IsAbs(rel) {
		return "", fmt.Errorf("不接受绝对路径")
	}
	clean := filepath.Clean(filepath.FromSlash(rel))
	if clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("路径超出工作区")
	}
	current := root
	if clean == "." {
		return current, nil
	}
	parts := strings.Split(clean, string(filepath.Separator))
	for i, part := range parts {
		current = filepath.Join(current, part)
		fi, e := os.Lstat(current)
		if e != nil {
			if allowMissing && i == len(parts)-1 && os.IsNotExist(e) {
				return current, nil
			}
			return "", e
		}
		if fi.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("v0.1 不跟随符号链接")
		}
		if i < len(parts)-1 && !fi.IsDir() {
			return "", fmt.Errorf("父路径不是目录")
		}
	}
	return current, nil
}

func (w *Workspace) List(rel string) ([]Entry, error) {
	p, err := w.Resolve(rel, false)
	if err != nil {
		return nil, err
	}
	items, err := os.ReadDir(p)
	if err != nil {
		return nil, err
	}
	result := []Entry{}
	for _, item := range items {
		if strings.HasPrefix(item.Name(), ".") || item.Type()&os.ModeSymlink != 0 {
			continue
		}
		if !item.IsDir() && !IsMarkdown(item.Name()) {
			continue
		}
		result = append(result, Entry{Path: filepath.ToSlash(filepath.Join(rel, item.Name())), Name: item.Name(), Directory: item.IsDir()})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Directory != result[j].Directory {
			return result[i].Directory
		}
		return result[i].Name < result[j].Name
	})
	return result, nil
}

func IsMarkdown(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".md" || ext == ".markdown"
}

func ValidateName(name string) error {
	if strings.TrimSpace(name) == "" || name == "." || name == ".." || strings.ContainsAny(name, "/\\\x00\r\n:") || strings.HasPrefix(name, ".") {
		return fmt.Errorf("请输入有效名称，不含路径分隔符且不以点开头")
	}
	if len(name) > 200 {
		return fmt.Errorf("名称过长")
	}
	return nil
}
