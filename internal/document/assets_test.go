package document

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadImageIsBoundToSessionAndWorkspace(t *testing.T) {
	s, snapshot, path := setup(t)
	image := filepath.Join(filepath.Dir(path), "中文.png")
	if err := os.WriteFile(image, []byte("image content"), 0644); err != nil {
		t.Fatal(err)
	}
	body, mime, err := s.ReadImage(snapshot.Session, "中文.png")
	if err != nil || string(body) != "image content" || mime != "image/png" {
		t.Fatalf("image not served: %s %s %v", body, mime, err)
	}
	outside := filepath.Join(t.TempDir(), "secret.png")
	if err := os.WriteFile(outside, []byte("private"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(filepath.Dir(path), "linked.png")); err != nil {
		t.Fatal(err)
	}
	for _, requested := range []string{"../secret.png", outside, "linked.png", "a.md", "missing.png"} {
		if _, _, err := s.ReadImage(snapshot.Session, requested); err == nil {
			t.Fatalf("invalid resource accepted: %s", requested)
		}
	}
	if _, _, err := s.ReadImage("previous-session", "中文.png"); err == nil {
		t.Fatal("stale session accepted")
	}
}

func TestCreateBothDocumentKinds(t *testing.T) {
	s, _, _ := setup(t)
	for _, name := range []string{"笔记", "想法.mind.md", "其他.MIND.MD"} {
		path, err := s.Create("", name, false)
		if err != nil {
			t.Fatal(err)
		}
		snapshot, err := s.Open(path)
		if err != nil {
			t.Fatal(err)
		}
		mind := strings.HasSuffix(strings.ToLower(path), ".mind.md")
		if strings.Contains(snapshot.Source, "## 新想法") != mind {
			t.Fatal("incorrect initial document content")
		}
		if strings.Contains(strings.ToLower(snapshot.Source), ".mind") {
			t.Fatal("rendering suffix leaked into document title")
		}
		if mind {
			main := snapshot.Root.Children[0]
			third := main.Children[0].Children[0]
			if main.Level != 1 || third.Level != 3 || len(third.Children) != 1 || third.Children[0].Kind != "list" {
				t.Fatal("new mind document does not follow the strict hierarchy")
			}
		}
	}
}
