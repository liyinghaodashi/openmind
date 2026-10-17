package filestore

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestAtomicReplaceAndConflict(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "a.md")
	recovery := filepath.Join(t.TempDir(), "recovery")
	old := []byte("# 原文\r\n")
	next := []byte("# 新文 🐈\r\n")
	if err := os.WriteFile(path, old, 0600); err != nil {
		t.Fatal(err)
	}
	result, err := Replace(path, old, next, recovery, 1024)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Replaced {
		t.Fatal("not replaced")
	}
	data, info, err := Read(path, 1024)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(data, next) || info.Mode().Perm() != 0600 {
		t.Fatal("content or permissions lost")
	}
	before, _ := os.ReadFile(filepath.Join(recovery, Hash([]byte(path))[:24], "before.md"))
	if !bytes.Equal(before, old) {
		t.Fatal("recovery baseline missing")
	}
	external := []byte("# External\n")
	os.WriteFile(path, external, 0600)
	if _, err = Replace(path, next, []byte("# Local"), recovery, 1024); err == nil {
		t.Fatal("missed external conflict")
	}
	data, _ = os.ReadFile(path)
	if !bytes.Equal(data, external) {
		t.Fatal("overwrote external edit")
	}
}

func TestSymlinksAndHardlinksRejected(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "a.md")
	os.WriteFile(path, []byte("# A"), 0644)
	link := filepath.Join(dir, "b.md")
	os.Symlink(path, link)
	if _, _, err := Read(link, 1024); err == nil {
		t.Fatal("read symlink")
	}
	hard := filepath.Join(dir, "c.md")
	os.Link(path, hard)
	if _, _, err := Read(path, 1024); err == nil {
		t.Fatal("read hardlink")
	}
}
