package document

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func setupDirectoryOperation(t *testing.T) (*Service, *Snapshot, string) {
	t.Helper()
	s, _, path := setup(t)
	root, err := filepath.EvalSymlinks(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "folder", "nested"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(path, filepath.Join(root, "folder", "nested", "a.md")); err != nil {
		t.Fatal(err)
	}
	snap, err := s.Open("folder/nested/a.md")
	if err != nil {
		t.Fatal(err)
	}
	return s, snap, root
}

func TestRenameDirectoryUpdatesOpenDescendantAndSaves(t *testing.T) {
	s, snap, root := setupDirectoryOperation(t)
	result, err := s.Rename("folder", "renamed.md")
	if err != nil {
		t.Fatal(err)
	}
	next := result.Snapshot
	if result.Path != "renamed.md" || next == nil || next.Path != "renamed.md/nested/a.md" || next.Session != snap.Session || next.Version <= snap.Version || next.Source != snap.Source {
		t.Fatalf("unexpected result: %#v", result)
	}
	if checked, err := s.Check(); err != nil || checked != nil {
		t.Fatalf("renamed descendant check failed: %v", err)
	}
	if _, err := s.Apply(Edit{Session: next.Session, Version: next.Version, OpID: "after", Kind: "source", Text: "# After\n"}); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, next.Path))
	if err != nil || string(data) != "# After\n" {
		t.Fatalf("wrong save path: %q, %v", data, err)
	}
}

func TestDirectoryOperationsProtectConflictRootAndExistingTarget(t *testing.T) {
	for _, action := range []string{"rename", "delete"} {
		t.Run(action, func(t *testing.T) {
			s, _, root := setupDirectoryOperation(t)
			s.trash = func(string) error { t.Fatal("trash called for rejected operation"); return nil }
			operate := func(path string) error {
				if action == "rename" {
					_, err := s.Rename(path, "next")
					return err
				}
				return s.Delete(path)
			}
			for _, path := range []string{"", ".", "folder/../..", root} {
				if err := operate(path); err == nil {
					t.Fatalf("accepted unsafe path %q", path)
				}
			}
			if err := os.Mkdir(filepath.Join(root, "next"), 0755); err != nil {
				t.Fatal(err)
			}
			if _, err := s.Rename("folder", "next"); err == nil {
				t.Fatal("overwrote existing directory")
			}
			if err := os.WriteFile(filepath.Join(root, "folder/nested/a.md"), []byte("# External\n"), 0644); err != nil {
				t.Fatal(err)
			}
			if err := operate("folder"); err == nil {
				t.Fatal("accepted conflict in open descendant")
			}
		})
	}
}

func TestDeleteDirectoryTrashesAllContentsAndClosesDescendant(t *testing.T) {
	s, _, root := setupDirectoryOperation(t)
	if err := os.WriteFile(filepath.Join(root, "folder/asset.bin"), []byte("asset"), 0644); err != nil {
		t.Fatal(err)
	}
	trashPath := filepath.Join(t.TempDir(), "folder")
	s.trash = func(full string) error {
		if full != filepath.Join(root, "folder") {
			t.Fatalf("unexpected trash target: %s", full)
		}
		return os.Rename(full, trashPath)
	}
	if err := s.Delete("folder"); err != nil {
		t.Fatal(err)
	}
	if s.doc != nil || s.path != "" || s.session != "" {
		t.Fatal("open descendant was not closed")
	}
	for _, path := range []string{"nested/a.md", "asset.bin"} {
		if _, err := os.Stat(filepath.Join(trashPath, path)); err != nil {
			t.Fatalf("missing trashed content: %v", err)
		}
	}
}

func TestDirectoryTrashFailurePreservesOpenDocument(t *testing.T) {
	s, snap, root := setupDirectoryOperation(t)
	s.trash = func(string) error { return errors.New("denied") }
	if err := s.Delete("folder"); err == nil {
		t.Fatal("accepted trash failure")
	}
	if s.path != snap.Path || s.session != snap.Session {
		t.Fatal("failed delete closed document")
	}
	if _, err := os.Stat(filepath.Join(root, snap.Path)); err != nil {
		t.Fatal(err)
	}
}
