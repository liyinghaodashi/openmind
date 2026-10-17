package document

import (
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"openmind/internal/filestore"
	"openmind/internal/markdown"
)

const maxImageBytes = 20 * 1024 * 1024

func imageFolder(documentPath string) string {
	name := strings.TrimSuffix(filepath.Base(documentPath), filepath.Ext(documentPath))
	return filepath.ToSlash(filepath.Join(filepath.Dir(documentPath), ".assets", name))
}

func imageLink(documentPath, filename string) string {
	parts := strings.Split(filepath.ToSlash(filepath.Join(".assets", strings.TrimSuffix(filepath.Base(documentPath), filepath.Ext(documentPath)), filename)), "/")
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	return strings.Join(parts, "/")
}

func (s *Service) imageBackup(filename string) string {
	return filepath.Join(s.recovery, "images", filestore.Hash([]byte(s.workspace.Root))[:24], filename)
}

func (s *Service) ensureImageFolder(documentPath string) (string, error) {
	rel := imageFolder(documentPath)
	for _, directory := range []string{filepath.Dir(rel), rel} {
		full, err := s.workspace.Resolve(directory, true)
		if err != nil {
			return "", err
		}
		if err = os.Mkdir(full, 0755); err != nil && !os.IsExist(err) {
			return "", err
		}
		info, err := os.Lstat(full)
		if err != nil || !info.IsDir() {
			return "", fmt.Errorf("图片目录不可用：%s", directory)
		}
	}
	return s.workspace.Resolve(rel, false)
}

func writeImage(path string, data []byte) error {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscallNoFollow(), 0600)
	if err != nil {
		return err
	}
	ok := false
	defer func() {
		f.Close()
		if !ok {
			os.Remove(path)
		}
	}()
	if _, err = f.Write(data); err != nil {
		return err
	}
	if err = f.Sync(); err != nil {
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	ok = true
	return nil
}

func imageExtension(data []byte) string {
	switch http.DetectContentType(data) {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/bmp":
		return ".bmp"
	case "image/x-icon", "image/vnd.microsoft.icon":
		return ".ico"
	}
	if len(data) >= 16 && string(data[4:8]) == "ftyp" && (string(data[8:12]) == "avif" || string(data[8:12]) == "avis") {
		return ".avif"
	}
	decoder := xml.NewDecoder(bytes.NewReader(data))
	for {
		token, err := decoder.Token()
		if err != nil {
			break
		}
		if element, ok := token.(xml.StartElement); ok {
			if element.Name.Local == "svg" {
				return ".svg"
			}
			break
		}
	}
	return ""
}

func (s *Service) ImportImage(session, encoded string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.doc == nil || session != s.session || s.blocked || strings.HasSuffix(strings.ToLower(s.path), ".mind.md") {
		return "", fmt.Errorf("当前文档不能导入图片")
	}
	if len(encoded) > base64.StdEncoding.EncodedLen(maxImageBytes) {
		return "", fmt.Errorf("图片不能超过 20MB")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(data) == 0 || len(data) > maxImageBytes {
		return "", fmt.Errorf("图片内容无效或超过 20MB")
	}
	extension := imageExtension(data)
	if extension == "" {
		return "", fmt.Errorf("不支持此图片格式")
	}
	folder, err := s.ensureImageFolder(s.path)
	if err != nil {
		return "", err
	}
	filename := randomID() + extension
	if err = os.MkdirAll(filepath.Dir(s.imageBackup(filename)), 0700); err != nil {
		return "", err
	}
	if err = writeImage(s.imageBackup(filename), data); err != nil {
		return "", err
	}
	if err = writeImage(filepath.Join(folder, filename), data); err != nil {
		os.Remove(s.imageBackup(filename))
		return "", err
	}
	return imageLink(s.path, filename), nil
}

func ownedAsset(documentPath, reference string) string {
	rel := markdown.LocalAssetPath(reference)
	folder := ".assets/" + strings.TrimSuffix(filepath.Base(documentPath), filepath.Ext(documentPath)) + "/"
	if !strings.HasPrefix(rel, folder) || strings.Contains(strings.TrimPrefix(rel, folder), "/") {
		return ""
	}
	return filepath.ToSlash(filepath.Join(filepath.Dir(documentPath), rel))
}

func (s *Service) restoreImages(source []byte) error {
	if strings.HasSuffix(strings.ToLower(s.path), ".mind.md") {
		return nil
	}
	for reference := range markdown.AssetReferences(source) {
		rel := ownedAsset(s.path, reference)
		if rel == "" {
			continue
		}
		full, resolveErr := s.workspace.Resolve(rel, false)
		if resolveErr == nil {
			continue
		}
		if !os.IsNotExist(resolveErr) {
			return resolveErr
		}
		backup, _, err := filestore.Read(s.imageBackup(filepath.Base(rel)), maxImageBytes)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return err
		}
		if _, err = s.ensureImageFolder(s.path); err != nil {
			return err
		}
		full, err = s.workspace.Resolve(rel, true)
		if err != nil {
			return err
		}
		if _, err = os.Lstat(full); err == nil {
			continue
		}
		if !os.IsNotExist(err) {
			return err
		}
		if err = writeImage(full, backup); err != nil && !os.IsExist(err) {
			return err
		}
	}
	return nil
}

func (s *Service) removeImage(reference string) error {
	rel := ownedAsset(s.path, reference)
	if rel == "" {
		return nil
	}
	backup, _, err := filestore.Read(s.imageBackup(filepath.Base(rel)), maxImageBytes)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	full, err := s.workspace.Resolve(rel, true)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	actual, _, err := filestore.Read(full, maxImageBytes)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if !bytes.Equal(backup, actual) {
		return nil
	}
	return os.Remove(full)
}

func (s *Service) cleanupImages(previous, next []byte) error {
	if strings.HasSuffix(strings.ToLower(s.path), ".mind.md") {
		return nil
	}
	refs := markdown.AssetReferences(next)
	for reference := range markdown.AssetReferences(previous) {
		if !refs[reference] {
			if err := s.removeImage(reference); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Service) DiscardImages(session string, references []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.doc == nil || session != s.session {
		return fmt.Errorf("文档会话已变化")
	}
	refs := markdown.AssetReferences(s.doc.Source)
	for _, reference := range references {
		if !refs[markdown.LocalAssetPath(reference)] {
			if err := s.removeImage(reference); err != nil {
				return err
			}
		}
	}
	return nil
}
