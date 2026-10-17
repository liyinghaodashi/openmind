package document

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"openmind/internal/workspace"
)

func TestRenameOpenDocumentKeepsContentAndSavesToNewPath(t *testing.T) {
	s, snap, oldPath := setup(t)
	result, err := s.Rename("a.md", "新名称.md")
	if err != nil {
		t.Fatal(err)
	}
	next := result.Snapshot
	if result.Path != "新名称.md" || next == nil || next.Session != snap.Session || next.Version <= snap.Version || next.Source != snap.Source {
		t.Fatalf("unexpected rename result: %#v", result)
	}
	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Fatalf("old path remains: %v", err)
	}
	if checked, err := s.Check(); err != nil || checked != nil {
		t.Fatalf("renamed document check failed: %v", err)
	}
	if _, err := s.Apply(Edit{Session: snap.Session, Version: snap.Version, OpID: "stale", Kind: "source", Text: "# Stale\n"}); err == nil {
		t.Fatal("accepted edit from before rename")
	}
	if _, err := s.Apply(Edit{Session: next.Session, Version: next.Version, OpID: "after", Kind: "source", Text: "# After\n"}); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(filepath.Dir(oldPath), result.Path))
	if err != nil || string(data) != "# After\n" {
		t.Fatalf("edit not saved to renamed file: %q, %v", data, err)
	}
}

func TestRenameRejectsExistingTargetAndPreservesBothFiles(t *testing.T) {
	s, snap, oldPath := setup(t)
	target := filepath.Join(filepath.Dir(oldPath), "existing.md")
	if err := os.WriteFile(target, []byte("# Existing\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Rename("a.md", "existing.md"); err == nil {
		t.Fatal("overwrote existing file")
	}
	for path, expected := range map[string]string{oldPath: snap.Source, target: "# Existing\n"} {
		data, err := os.ReadFile(path)
		if err != nil || string(data) != expected {
			t.Fatalf("changed %s: %q, %v", path, data, err)
		}
	}
	if s.path != snap.Path || s.version != snap.Version {
		t.Fatal("failed rename changed current session")
	}
}

func TestRenameUpdatesFallbackRootWithoutMutatingPreviousSnapshot(t *testing.T) {
	s, _, path := setup(t)
	if err := os.WriteFile(path, []byte("## Heading\n"), 0644); err != nil {
		t.Fatal(err)
	}
	before, err := s.Open("a.md")
	if err != nil {
		t.Fatal(err)
	}
	result, err := s.Rename("a.md", "新名称.md")
	if err != nil {
		t.Fatal(err)
	}
	if before.Root.Label != "a" || result.Snapshot.Root.Label != "新名称" || before.Root == result.Snapshot.Root {
		t.Fatal("rename mutated a previously returned snapshot")
	}
	if before.Root.Children[0].ID != result.Snapshot.Root.Children[0].ID {
		t.Fatal("rename changed node IDs")
	}
}

func TestRenameUsesFullNestedNameAndDoesNotSwitchCurrentFile(t *testing.T) {
	s, snap, oldPath := setup(t)
	root := filepath.Dir(oldPath)
	if err := os.Mkdir(filepath.Join(root, "后端"), 0755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"改名.md", "改名.markdown", "改名.mind.md", "改名.MIND.MD", "改名.txt", "改名", "改名.md.txt"} {
		path := "后端/文件.md"
		if err := os.WriteFile(filepath.Join(root, path), []byte("# Keep\n"), 0644); err != nil {
			t.Fatal(err)
		}
		result, err := s.Rename(path, name)
		if err != nil || result.Path != "后端/"+name || result.Snapshot != nil {
			t.Fatalf("wrong nested rename: %#v, %v", result, err)
		}
		if err := os.Remove(filepath.Join(root, result.Path)); err != nil {
			t.Fatal(err)
		}
	}
	if s.path != snap.Path || s.session != snap.Session {
		t.Fatal("renaming another file changed current document")
	}
}

func TestRenameSameNameAndCaseOnly(t *testing.T) {
	s, snap, _ := setup(t)
	result, err := s.Rename("a.md", "a.md")
	if err != nil || result.Snapshot.Version != snap.Version {
		t.Fatalf("same-name rename failed: %v", err)
	}
	result, err = s.Rename("a.md", "A.md")
	if err != nil || result.Path != "A.md" {
		t.Fatalf("case-only rename failed: %v", err)
	}
	entries, err := s.List("")
	if err != nil || len(entries) != 1 || entries[0].Name != "A.md" {
		t.Fatalf("case-only rename did not update name: %#v, %v", entries, err)
	}
}

func TestFileOperationsRejectExternalConflictAndUnsafePaths(t *testing.T) {
	for _, action := range []string{"rename", "delete"} {
		t.Run(action, func(t *testing.T) {
			s, _, path := setup(t)
			s.trash = func(string) error { t.Fatal("trash called for rejected path"); return nil }
			root := filepath.Dir(path)
			outside := filepath.Join(t.TempDir(), "outside.md")
			if err := os.WriteFile(outside, []byte("# Outside\n"), 0644); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(outside, filepath.Join(root, "link.md")); err != nil {
				t.Fatal(err)
			}
			if err := os.Link(path, filepath.Join(root, "hard.md")); err != nil {
				t.Fatal(err)
			}
			if err := os.Mkdir(filepath.Join(root, "folder.md"), 0755); err != nil {
				t.Fatal(err)
			}
			for _, invalid := range []string{"../outside.md", outside, "link.md", "hard.md", "", "missing.md"} {
				var err error
				if action == "rename" {
					_, err = s.Rename(invalid, "next.md")
				} else {
					err = s.Delete(invalid)
				}
				if err == nil {
					t.Fatalf("accepted unsafe path %q", invalid)
				}
			}
			if err := os.Remove(filepath.Join(root, "hard.md")); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte("# External\n"), 0644); err != nil {
				t.Fatal(err)
			}
			var err error
			if action == "rename" {
				_, err = s.Rename("a.md", "next.md")
			} else {
				err = s.Delete("a.md")
			}
			if err == nil {
				t.Fatal("operated on externally changed current document")
			}
			data, err := os.ReadFile(path)
			if err != nil || string(data) != "# External\n" {
				t.Fatal("external data changed")
			}
		})
	}
}

func TestRenameRejectsInvalidNames(t *testing.T) {
	s, _, _ := setup(t)
	for _, name := range []string{"", " ", ".hidden", "../escape", "a/b", "a\\b", "a:b", "a\x00b", strings.Repeat("a", 201)} {
		if _, err := s.Rename("a.md", name); err == nil {
			t.Fatalf("accepted invalid name %q", name)
		}
	}
}

func TestDeleteOpenDocumentInvalidatesSessionAfterTrashSucceeds(t *testing.T) {
	s, snap, path := setup(t)
	trashPath := filepath.Join(t.TempDir(), "a.md")
	s.trash = func(full string) error { return os.Rename(full, trashPath) }
	if err := s.Delete("a.md"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(trashPath)
	if err != nil || string(data) != snap.Source {
		t.Fatal("trashed content changed")
	}
	if s.doc != nil || s.session != "" || s.path != "" {
		t.Fatal("deleted document still active")
	}
	if checked, err := s.Check(); err != nil || checked != nil {
		t.Fatal("check still uses deleted path")
	}
	if _, err := s.Apply(Edit{Session: snap.Session, Version: snap.Version, OpID: "late", Kind: "source", Text: "# Late\n"}); err == nil {
		t.Fatal("late edit recreated deleted file")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("deleted file remains")
	}
}

func TestDeleteFailureAndDeletingAnotherFileKeepCurrentDocument(t *testing.T) {
	s, snap, path := setup(t)
	s.trash = func(string) error { return errors.New("permission denied") }
	if err := s.Delete("a.md"); err == nil {
		t.Fatal("ignored trash failure")
	}
	if s.doc == nil || s.path != snap.Path || s.session != snap.Session {
		t.Fatal("trash failure cleared current document")
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal(err)
	}
	other := filepath.Join(filepath.Dir(path), "other.md")
	if err := os.WriteFile(other, []byte("# Other\n"), 0644); err != nil {
		t.Fatal(err)
	}
	trashPath := filepath.Join(t.TempDir(), "other.md")
	s.trash = func(full string) error { return os.Rename(full, trashPath) }
	if err := s.Delete("other.md"); err != nil {
		t.Fatal(err)
	}
	if s.path != snap.Path || s.session != snap.Session {
		t.Fatal("deleting another file changed current document")
	}
}

func TestFileOperationsRequireWorkspace(t *testing.T) {
	s := New(t.TempDir())
	if _, err := s.Rename("a.md", "next.md"); err == nil {
		t.Fatal("renamed without workspace")
	}
	if err := s.Delete("a.md"); err == nil {
		t.Fatal("deleted without workspace")
	}
	w, err := workspace.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	s.SetWorkspace(w)
	if err := trashFile(filepath.Join(w.Root, "missing.md")); err == nil {
		t.Fatal("native trash accepted missing file")
	}
}

func TestRenameCanSwitchOpenDocumentTypeWithoutChangingContent(t *testing.T) {
	s, before, oldPath := setup(t)
	current := before
	for _, name := range []string{"想法.mind.md", "想法.markdown", "想法.md"} {
		result, err := s.Rename(current.Path, name)
		if err != nil {
			t.Fatal(err)
		}
		next := result.Snapshot
		if next == nil || next.Path != name || next.Source != before.Source || next.Session != before.Session || next.Version <= current.Version {
			t.Fatalf("invalid type switch result: %#v", result)
		}
		if strings.HasSuffix(name, ".mind.md") {
			if next.Root.Kind != "file" || len(next.Root.Children) != 1 || next.Root.Children[0].Level != 1 {
				t.Fatal("switching to mind mode did not reparse with the new rules")
			}
		} else if next.Root.Kind != "heading" {
			t.Fatal("switching back to Markdown retained the mind projection")
		}
		data, err := os.ReadFile(filepath.Join(filepath.Dir(oldPath), name))
		if err != nil || string(data) != before.Source {
			t.Fatalf("type switch changed source: %q, %v", data, err)
		}
		current = next
	}
}

func TestRenameToNonMarkdownClosesDocumentAndHidesFile(t *testing.T) {
	for _, name := range []string{"笔记.txt", "笔记", "笔记.md.txt"} {
		t.Run(name, func(t *testing.T) {
			s, before, oldPath := setup(t)
			result, err := s.Rename("a.md", name)
			if err != nil {
				t.Fatal(err)
			}
			if result.Path != name || result.Snapshot != nil || s.doc != nil || s.session != "" || s.path != "" {
				t.Fatal("non-Markdown rename left document active")
			}
			data, err := os.ReadFile(filepath.Join(filepath.Dir(oldPath), name))
			if err != nil || string(data) != before.Source {
				t.Fatalf("rename changed or lost file contents: %q, %v", data, err)
			}
			entries, err := s.List("")
			if err != nil || len(entries) != 0 {
				t.Fatalf("non-Markdown file still listed: %#v, %v", entries, err)
			}
			if snapshot, err := s.Check(); err != nil || snapshot != nil {
				t.Fatal("check still uses old path")
			}
			if _, err := s.Apply(Edit{Session: before.Session, Version: before.Version, OpID: "late", Kind: "source", Text: "# Late\n"}); err == nil {
				t.Fatal("late edit accepted after document closed")
			}
			if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
				t.Fatal("old path was recreated")
			}
		})
	}
}
