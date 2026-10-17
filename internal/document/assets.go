package document

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"openmind/internal/filestore"
)

func (s *Service) ReadImage(session, path string) ([]byte, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.workspace == nil || s.doc == nil || session != s.session {
		return nil, "", fmt.Errorf("文档会话已变化")
	}
	types := map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".avif": "image/avif", ".bmp": "image/bmp", ".ico": "image/x-icon"}
	mime := types[strings.ToLower(filepath.Ext(path))]
	if mime == "" {
		return nil, "", fmt.Errorf("只支持图片资源")
	}
	full, err := s.workspace.Resolve(path, false)
	if err != nil {
		if os.IsNotExist(err) {
			reference, relErr := filepath.Rel(filepath.Dir(s.path), path)
			if relErr == nil && ownedAsset(s.path, filepath.ToSlash(reference)) == filepath.ToSlash(filepath.Clean(path)) {
				body, _, backupErr := filestore.Read(s.imageBackup(filepath.Base(path)), maxImageBytes)
				if backupErr == nil {
					return body, mime, nil
				}
			}
		}
		return nil, "", err
	}
	body, _, err := filestore.Read(full, 20*1024*1024)
	return body, mime, err
}
