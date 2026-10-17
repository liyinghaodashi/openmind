package document

import (
	"os"
	"path/filepath"
	"testing"

	"openmind/internal/workspace"
)

func TestMoveOpenDocumentKeepsSessionAndSavesAtNewPath(t *testing.T) {
	s, before, oldPath := setup(t)
	root := filepath.Dir(oldPath)
	if err := os.Mkdir(filepath.Join(root, "目标"), 0755); err != nil {
		t.Fatal(err)
	}
	result, err := s.MoveEntry("a.md", "目标")
	if err != nil {
		t.Fatal(err)
	}
	next := result.Snapshot
	if result.Path != "目标/a.md" || next == nil || next.Path != result.Path || next.Session != before.Session || next.Source != before.Source || next.Version <= before.Version {
		t.Fatalf("invalid move: %#v", result)
	}
	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Fatalf("old file remains: %v", err)
	}
	if checked, err := s.Check(); err != nil || checked != nil {
		t.Fatalf("check used old path: %v", err)
	}
	if _, err := s.Apply(Edit{Session: before.Session, Version: before.Version, OpID: "stale", Kind: "source", Text: "# Stale\n"}); err == nil {
		t.Fatal("accepted stale edit")
	}
	if _, err := s.Apply(Edit{Session: next.Session, Version: next.Version, OpID: "after", Kind: "source", Text: "# Saved\n"}); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, result.Path))
	if err != nil || string(data) != "# Saved\n" {
		t.Fatalf("save missed moved file: %q, %v", data, err)
	}
	result, err = s.MoveEntry(result.Path, "")
	if err != nil || result.Path != "a.md" || result.Snapshot.Path != "a.md" {
		t.Fatalf("move to root failed: %#v, %v", result, err)
	}
}

func TestMoveFolderIncludesAllContentsAndUpdatesOpenDescendant(t *testing.T) {
	s, _, oldPath := setup(t)
	root := filepath.Dir(oldPath)
	for _, dir := range []string{"源/子目录", "目标", "源/assets"} {
		if err := os.MkdirAll(filepath.Join(root, dir), 0755); err != nil {
			t.Fatal(err)
		}
	}
	files := map[string]string{"源/子目录/笔记.mind.md": "# Root\n## Child\n", "源/assets/image.png": "image bytes", "源/.hidden": "hidden", "源/data.txt": "data"}
	for path, contents := range files {
		if err := os.WriteFile(filepath.Join(root, path), []byte(contents), 0644); err != nil {
			t.Fatal(err)
		}
	}
	before, err := s.Open("源/子目录/笔记.mind.md")
	if err != nil {
		t.Fatal(err)
	}
	result, err := s.MoveEntry("源", "目标")
	if err != nil {
		t.Fatal(err)
	}
	if result.Path != "目标/源" || result.Snapshot == nil || result.Snapshot.Path != "目标/源/子目录/笔记.mind.md" || result.Snapshot.Session != before.Session || result.Snapshot.Root.Children[0].ID != before.Root.Children[0].ID {
		t.Fatalf("descendant not updated: %#v", result)
	}
	for path, contents := range files {
		data, err := os.ReadFile(filepath.Join(root, "目标", path))
		if err != nil || string(data) != contents {
			t.Fatalf("folder lost %s: %q, %v", path, data, err)
		}
	}
	if _, err := os.Stat(filepath.Join(root, "源")); !os.IsNotExist(err) {
		t.Fatal("old folder remains")
	}
	if checked, err := s.Check(); err != nil || checked != nil {
		t.Fatalf("descendant check failed: %v", err)
	}
	next := result.Snapshot
	if _, err := s.Apply(Edit{Session: next.Session, Version: next.Version, OpID: "folder-save", Kind: "source", Text: "# After\n"}); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, next.Path))
	if err != nil || string(data) != "# After\n" {
		t.Fatalf("descendant save failed: %q, %v", data, err)
	}
}

func TestMoveRejectsCollisionWithoutChangingFilesOrSession(t *testing.T) {
	for _, directory := range []bool{false, true} {
		t.Run(map[bool]string{false: "file", true: "folder"}[directory], func(t *testing.T) {
			s, before, oldPath := setup(t)
			root := filepath.Dir(oldPath)
			if err := os.Mkdir(filepath.Join(root, "target"), 0755); err != nil {
				t.Fatal(err)
			}
			source := "a.md"
			if directory {
				source = "folder"
				for _, dir := range []string{source, "target/folder"} {
					if err := os.Mkdir(filepath.Join(root, dir), 0755); err != nil {
						t.Fatal(err)
					}
				}
			} else if err := os.WriteFile(filepath.Join(root, "target/a.md"), []byte("# Existing\n"), 0644); err != nil {
				t.Fatal(err)
			}
			if _, err := s.MoveEntry(source, "target"); err == nil {
				t.Fatal("accepted collision")
			}
			if _, err := os.Stat(filepath.Join(root, source)); err != nil {
				t.Fatal("source lost")
			}
			if s.path != before.Path || s.session != before.Session || s.version != before.Version {
				t.Fatal("failed move changed session")
			}
			if !directory {
				data, err := os.ReadFile(filepath.Join(root, "target/a.md"))
				if err != nil || string(data) != "# Existing\n" {
					t.Fatal("destination overwritten")
				}
			}
		})
	}
}

func TestMoveRejectsUnsafeSourceAndDestination(t *testing.T) {
	s, before, oldPath := setup(t)
	root := filepath.Dir(oldPath)
	if err := os.MkdirAll(filepath.Join(root, "folder/child"), 0755); err != nil {
		t.Fatal(err)
	}
	outside := t.TempDir()
	for name, target := range map[string]string{"link.md": oldPath, "linkdir": outside} {
		if err := os.Symlink(target, filepath.Join(root, name)); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Link(oldPath, filepath.Join(root, "hard.md")); err != nil {
		t.Fatal(err)
	}
	if _, err := s.MoveEntry("hard.md", "folder"); err == nil {
		t.Fatal("accepted hard link")
	}
	if err := os.Remove(filepath.Join(root, "hard.md")); err != nil {
		t.Fatal(err)
	}
	for _, paths := range [][2]string{
		{"", "folder"}, {".", "folder"}, {"../outside.md", "folder"}, {oldPath, "folder"},
		{"link.md", "folder"}, {"linkdir", "folder"}, {"missing.md", "folder"},
		{"a.md", "a.md"}, {"a.md", "../escape"}, {"a.md", outside}, {"a.md", "linkdir"}, {"a.md", "missing"},
		{"folder", "folder"}, {"folder", "folder/child"},
	} {
		if _, err := s.MoveEntry(paths[0], paths[1]); err == nil {
			t.Fatalf("accepted unsafe move: %v", paths)
		}
	}
	result, err := s.MoveEntry("a.md", "")
	if err != nil || result.Snapshot.Version != before.Version {
		t.Fatal("same-parent move changed session")
	}
	if _, err := os.Stat(oldPath); err != nil {
		t.Fatal("rejected move lost source")
	}
}

func TestMoveFolderRejectsExternalChangeToOpenDescendant(t *testing.T) {
	s, _, oldPath := setup(t)
	root := filepath.Dir(oldPath)
	if err := os.Mkdir(filepath.Join(root, "folder"), 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "folder/note.md")
	if err := os.WriteFile(path, []byte("# Original\n"), 0644); err != nil {
		t.Fatal(err)
	}
	before, err := s.Open("folder/note.md")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("# External\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := s.MoveEntry("folder", "folder/child"); err == nil {
		t.Fatal("accepted child target")
	}
	if _, err := s.MoveEntry("folder/note.md", ""); err == nil {
		t.Fatal("moved externally changed document")
	}
	if err := os.Mkdir(filepath.Join(root, "target"), 0755); err != nil {
		t.Fatal(err)
	}
	if _, err := s.MoveEntry("folder", "target"); err == nil {
		t.Fatal("moved externally changed descendant")
	}
	if s.path != before.Path || s.version != before.Version {
		t.Fatal("conflict changed session")
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "# External\n" {
		t.Fatal("external content lost")
	}
}

func TestMoveUnrelatedFolderKeepsCurrentDocument(t *testing.T) {
	s, before, path := setup(t)
	root := filepath.Dir(path)
	for _, dir := range []string{"folder", "target"} {
		if err := os.Mkdir(filepath.Join(root, dir), 0755); err != nil {
			t.Fatal(err)
		}
	}
	result, err := s.MoveEntry("folder", "target")
	if err != nil || result.Snapshot != nil || s.path != before.Path || s.version != before.Version {
		t.Fatalf("unrelated move changed document: %#v, %v", result, err)
	}
	if _, err := New(t.TempDir()).MoveEntry("a.md", ""); err == nil {
		t.Fatal("moved without workspace")
	}
	w, err := workspace.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	s.SetWorkspace(w)
	if err := os.WriteFile(filepath.Join(w.Root, "data.txt"), []byte("data"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := s.MoveEntry("data.txt", ""); err == nil {
		t.Fatal("accepted unsupported file")
	}
}
