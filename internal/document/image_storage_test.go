package document

import (
	"bytes"
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"openmind/internal/markdown"
)

const testImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII="

func imageEdit(t *testing.T, s *Service, snapshot *Snapshot, source string) *Snapshot {
	t.Helper()
	next, err := s.Apply(Edit{Session: snapshot.Session, Version: snapshot.Version, OpID: randomID(), Kind: "source", Text: source})
	if err != nil {
		t.Fatal(err)
	}
	if next.ImageWarning != "" {
		t.Fatal(next.ImageWarning)
	}
	return next
}

func TestImageImportDeletionUndoAndRestart(t *testing.T) {
	s, snapshot, doc := setup(t)
	link, err := s.ImportImage(snapshot.Session, testImage)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(link, ".assets/a/") {
		t.Fatal(link)
	}
	full := filepath.Join(filepath.Dir(doc), markdown.LocalAssetPath(link))
	source := "![一](" + link + ")\n![二](" + link + ")\n"
	snapshot = imageEdit(t, s, snapshot, source)
	snapshot = imageEdit(t, s, snapshot, "![二]("+link+")\n")
	if _, err = os.Stat(full); err != nil {
		t.Fatal("remaining reference deleted", err)
	}
	snapshot = imageEdit(t, s, snapshot, "正文\n")
	if _, err = os.Stat(full); !os.IsNotExist(err) {
		t.Fatal("removed image remains", err)
	}
	body, mime, err := s.ReadImage(snapshot.Session, markdown.LocalAssetPath(link))
	if err != nil || len(body) == 0 || mime != "image/png" {
		t.Fatal("undo preview missing", mime, err)
	}
	reopened := New(s.recovery)
	reopened.SetWorkspace(s.workspace)
	snapshot, err = reopened.Open("a.md")
	if err != nil {
		t.Fatal(err)
	}
	snapshot = imageEdit(t, reopened, snapshot, source)
	actual, err := os.ReadFile(full)
	expected, _ := base64.StdEncoding.DecodeString(testImage)
	if err != nil || !bytes.Equal(actual, expected) {
		t.Fatal("undo bytes lost", err)
	}
	imageEdit(t, reopened, snapshot, "正文\n")
	if _, err = os.Stat(full); !os.IsNotExist(err) {
		t.Fatal("redo failed")
	}
}

func TestCleanupDoesNotDeleteManualExternalOrModifiedImages(t *testing.T) {
	s, snapshot, doc := setup(t)
	link, err := s.ImportImage(snapshot.Session, testImage)
	if err != nil {
		t.Fatal(err)
	}
	folder := filepath.Join(filepath.Dir(doc), ".assets/a")
	manual := filepath.Join(folder, "manual.png")
	os.WriteFile(manual, []byte("manual"), 0600)
	external := filepath.Join(filepath.Dir(doc), "external.png")
	os.WriteFile(external, []byte("external"), 0600)
	snapshot = imageEdit(t, s, snapshot, "![x]("+link+")\n![x](.assets/a/manual.png)\n![x](external.png)\n")
	managed := filepath.Join(filepath.Dir(doc), markdown.LocalAssetPath(link))
	os.WriteFile(managed, []byte("externally changed"), 0600)
	imageEdit(t, s, snapshot, "正文\n")
	for _, path := range []string{manual, external, managed} {
		if _, err := os.Stat(path); err != nil {
			t.Fatal("unowned or modified image deleted", path, err)
		}
	}
}

func TestFailedSaveDoesNotDeleteImages(t *testing.T) {
	s, snapshot, doc := setup(t)
	link, err := s.ImportImage(snapshot.Session, testImage)
	if err != nil {
		t.Fatal(err)
	}
	snapshot = imageEdit(t, s, snapshot, "![x]("+link+")\n")
	os.WriteFile(doc, []byte("外部修改\n"), 0600)
	if _, err = s.Apply(Edit{Session: snapshot.Session, Version: snapshot.Version, OpID: "conflict", Kind: "source", Text: "正文\n"}); err == nil {
		t.Fatal("conflict ignored")
	}
	if _, err = os.Stat(filepath.Join(filepath.Dir(doc), markdown.LocalAssetPath(link))); err != nil {
		t.Fatal("conflict deleted image", err)
	}
}

func TestImportValidationAndCancellation(t *testing.T) {
	s, snapshot, doc := setup(t)
	for _, input := range []string{"", "%%%", base64.StdEncoding.EncodeToString([]byte("not an image"))} {
		if _, err := s.ImportImage(snapshot.Session, input); err == nil {
			t.Fatal("invalid image accepted")
		}
	}
	if _, err := s.ImportImage("stale", testImage); err == nil {
		t.Fatal("stale session accepted")
	}
	one, err := s.ImportImage(snapshot.Session, testImage)
	if err != nil {
		t.Fatal(err)
	}
	two, err := s.ImportImage(snapshot.Session, testImage)
	if err != nil {
		t.Fatal(err)
	}
	if one == two {
		t.Fatal("names collide")
	}
	snapshot = imageEdit(t, s, snapshot, "![x]("+one+")\n")
	if err = s.DiscardImages(snapshot.Session, []string{one, two, "../outside.png"}); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(filepath.Join(filepath.Dir(doc), markdown.LocalAssetPath(one))); err != nil {
		t.Fatal("referenced image discarded")
	}
	if _, err = os.Stat(filepath.Join(filepath.Dir(doc), markdown.LocalAssetPath(two))); !os.IsNotExist(err) {
		t.Fatal("cancelled image retained")
	}
}

func TestImagesFollowRenameMoveAndDocumentDeletion(t *testing.T) {
	s, snapshot, doc := setup(t)
	link, err := s.ImportImage(snapshot.Session, testImage)
	if err != nil {
		t.Fatal(err)
	}
	snapshot = imageEdit(t, s, snapshot, "![x]("+link+")\n")
	renamed, err := s.Rename("a.md", "新 笔记.md")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(renamed.Snapshot.Source, ".assets/%E6%96%B0%20%E7%AC%94%E8%AE%B0/") {
		t.Fatal("source not rewritten", renamed.Snapshot.Source)
	}
	os.Mkdir(filepath.Join(filepath.Dir(doc), "目标"), 0755)
	moved, err := s.MoveEntry(renamed.Path, "目标")
	if err != nil {
		t.Fatal(err)
	}
	var relative string
	for ref := range markdown.AssetReferences([]byte(moved.Snapshot.Source)) {
		relative = filepath.ToSlash(filepath.Join("目标", ref))
	}
	if _, _, err = s.ReadImage(snapshot.Session, relative); err != nil {
		t.Fatal("moved image missing", err)
	}
	moved.Snapshot = imageEdit(t, s, moved.Snapshot, "正文\n")
	imageEdit(t, s, moved.Snapshot, renamed.Snapshot.Source)
	var trashed []string
	s.trash = func(path string) error {
		trashed = append(trashed, path)
		if _, err := os.Stat(filepath.Join(path, "新 笔记.md")); err != nil {
			t.Fatal("document absent from trash bundle", err)
		}
		if _, err := os.Stat(filepath.Join(path, ".assets", "新 笔记")); err != nil {
			t.Fatal("assets absent from trash bundle", err)
		}
		return os.RemoveAll(path)
	}
	if err = s.Delete(moved.Path); err != nil {
		t.Fatal(err)
	}
	if len(trashed) != 1 || !strings.HasPrefix(filepath.Base(trashed[0]), "新 笔记（含图片）-") {
		t.Fatal("image directory not trashed", trashed)
	}
}

func TestAssetCollisionRollsBackAndSymlinksAreRejected(t *testing.T) {
	s, snapshot, doc := setup(t)
	link, err := s.ImportImage(snapshot.Session, testImage)
	if err != nil {
		t.Fatal(err)
	}
	snapshot = imageEdit(t, s, snapshot, "![x]("+link+")\n")
	os.Mkdir(filepath.Join(filepath.Dir(doc), ".assets/b"), 0755)
	if _, err = s.Rename("a.md", "b.md"); err == nil {
		t.Fatal("asset collision ignored")
	}
	if _, err = os.Stat(doc); err != nil {
		t.Fatal("original document lost")
	}
	os.WriteFile(filepath.Join(filepath.Dir(doc), "c.md"), []byte("occupied\n"), 0600)
	if _, err = s.Rename("a.md", "c.md"); err == nil {
		t.Fatal("document collision ignored")
	}
	if _, err = os.Stat(filepath.Join(filepath.Dir(doc), markdown.LocalAssetPath(link))); err != nil {
		t.Fatal("asset move not rolled back", err)
	}
	os.RemoveAll(filepath.Join(filepath.Dir(doc), ".assets/a"))
	os.Symlink(t.TempDir(), filepath.Join(filepath.Dir(doc), ".assets/a"))
	if _, err = s.ImportImage(snapshot.Session, testImage); err == nil {
		t.Fatal("symlink accepted")
	}
}

func TestTrashFailureRestoresDocumentAndAssetsTogether(t *testing.T) {
	s, snapshot, doc := setup(t)
	link, err := s.ImportImage(snapshot.Session, testImage)
	if err != nil {
		t.Fatal(err)
	}
	snapshot = imageEdit(t, s, snapshot, "![x]("+link+")\n")
	s.trash = func(string) error { return errors.New("trash denied") }
	if err = s.Delete("a.md"); err == nil {
		t.Fatal("trash failure ignored")
	}
	if s.doc == nil || s.session != snapshot.Session {
		t.Fatal("failed trash closed document")
	}
	for _, path := range []string{doc, filepath.Join(filepath.Dir(doc), markdown.LocalAssetPath(link))} {
		if _, err = os.Stat(path); err != nil {
			t.Fatal("failed trash lost file", path, err)
		}
	}
	entries, err := os.ReadDir(filepath.Dir(doc))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.Contains(entry.Name(), "（含图片）-") {
			t.Fatal("failed trash left bundle")
		}
	}
}

func TestReferenceImageAndHTMLLinksPreventEarlyCleanup(t *testing.T) {
	s, snapshot, doc := setup(t)
	link, err := s.ImportImage(snapshot.Session, testImage)
	if err != nil {
		t.Fatal(err)
	}
	full := filepath.Join(filepath.Dir(doc), markdown.LocalAssetPath(link))
	for _, source := range []string{"![x][image]\n\n[image]: " + link + "\n", "[下载](" + link + ")\n", "<img src=\"" + link + "\">\n"} {
		snapshot = imageEdit(t, s, snapshot, source)
		if _, err = os.Stat(full); err != nil {
			t.Fatal("live reference lost image", err)
		}
	}
	imageEdit(t, s, snapshot, "```md\n![示例]("+link+")\n```\n")
	if _, err = os.Stat(full); !os.IsNotExist(err) {
		t.Fatal("code example retained image", err)
	}
}
