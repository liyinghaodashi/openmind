package filestore

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

func Hash(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }

func Read(path string, limit int) ([]byte, os.FileInfo, error) {
	li, err := os.Lstat(path)
	if err != nil {
		return nil, nil, err
	}
	if !li.Mode().IsRegular() {
		return nil, nil, fmt.Errorf("只支持普通文件，不支持链接或设备")
	}
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return nil, nil, err
	}
	defer f.Close()
	before, err := f.Stat()
	if err != nil {
		return nil, nil, err
	}
	if !os.SameFile(li, before) {
		return nil, nil, fmt.Errorf("文件正在替换，请稍后重试")
	}
	if stat, ok := before.Sys().(*syscall.Stat_t); ok && stat.Nlink > 1 {
		return nil, nil, fmt.Errorf("v0.1 不支持编辑硬链接文件，请复制为独立文件")
	}
	b, err := io.ReadAll(io.LimitReader(f, int64(limit)+1))
	if err != nil {
		return nil, nil, err
	}
	if len(b) > limit {
		return nil, nil, fmt.Errorf("文件超过大小限制")
	}
	after, err := f.Stat()
	if err != nil {
		return nil, nil, err
	}
	current, err := os.Lstat(path)
	if err != nil {
		return nil, nil, err
	}
	if !os.SameFile(after, current) || before.Size() != after.Size() || !before.ModTime().Equal(after.ModTime()) {
		return nil, nil, fmt.Errorf("文件正在更新，请稍后重试")
	}
	return b, after, nil
}

type Result struct {
	Replaced bool
	Hash     string
}

func Replace(path string, expected []byte, next []byte, recoveryDir string, limit int) (Result, error) {
	result := Result{}
	actual, info, err := Read(path, limit)
	if err != nil {
		return result, err
	}
	if !bytes.Equal(actual, expected) {
		return result, fmt.Errorf("文件已被外部修改，已停止写入")
	}
	if err = Preserve(recoveryDir, path, "before", actual); err != nil {
		return result, err
	}
	if err = Preserve(recoveryDir, path, "pending", next); err != nil {
		return result, err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".openmind-*")
	if err != nil {
		return result, err
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	defer f.Close()
	if err = f.Chmod(info.Mode().Perm()); err != nil {
		return result, err
	}
	if _, err = f.Write(next); err != nil {
		return result, err
	}
	if err = copyMetadata(path, tmp); err != nil {
		return result, err
	}
	if err = f.Sync(); err != nil {
		return result, err
	}
	if err = f.Close(); err != nil {
		return result, err
	}
	check, checkInfo, err := Read(path, limit)
	if err != nil {
		return result, err
	}
	if !bytes.Equal(check, expected) || !os.SameFile(info, checkInfo) {
		return result, fmt.Errorf("写入前检测到外部变化，已保留本地草稿")
	}
	if err = os.Rename(tmp, path); err != nil {
		return result, err
	}
	result.Replaced = true
	result.Hash = Hash(next)
	dir, err := os.Open(filepath.Dir(path))
	if err != nil {
		return result, err
	}
	err = dir.Sync()
	dir.Close()
	if err != nil {
		return result, fmt.Errorf("文件已替换，但目录同步失败：%w", err)
	}
	confirmed, _, err := Read(path, limit)
	if err != nil {
		return result, err
	}
	if !bytes.Equal(confirmed, next) {
		return result, fmt.Errorf("写入后检测到另一程序修改，已保留恢复副本")
	}
	return result, nil
}

func Preserve(dir, path, kind string, data []byte) error {
	key := Hash([]byte(path))[:24]
	folder := filepath.Join(dir, key)
	if err := os.MkdirAll(folder, 0700); err != nil {
		return err
	}
	target := filepath.Join(folder, kind+".md")
	f, err := os.CreateTemp(folder, ".draft-")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if _, err = f.Write(data); err != nil {
		return err
	}
	if err = f.Sync(); err != nil {
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	if err = os.Rename(f.Name(), target); err != nil {
		return err
	}
	d, err := os.Open(folder)
	if err != nil {
		return err
	}
	defer d.Close()
	return d.Sync()
}

func ConflictCopy(dir, path string, data []byte) (string, error) {
	kind := fmt.Sprintf("conflict-%d", time.Now().UnixNano())
	if err := Preserve(dir, path, kind, data); err != nil {
		return "", err
	}
	return filepath.Join(dir, Hash([]byte(path))[:24], kind+".md"), nil
}
