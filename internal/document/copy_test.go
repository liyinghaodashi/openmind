package document

import (
	"openmind/internal/markdown"
	"os"
	"strings"
	"testing"
)

func TestNodeMarkdownDoesNotSaveDraft(t *testing.T) {
	s, snap, path := setup(t)
	original, _ := os.ReadFile(path)
	nodeID := snap.Root.Children[0].ID
	for _, blocked := range []bool{false, true} {
		s.blocked = blocked
		draft := "尚未保存🐱"
		got, err := s.NodeMarkdown(snap.Session, nodeID, &draft)
		if err != nil || got != "## 尚未保存🐱\n" {
			t.Fatalf("got %q, error %v", got, err)
		}
		got, err = s.NodeMarkdown(snap.Session, nodeID, nil)
		if err != nil || got != "## Item\n" {
			t.Fatalf("saved source changed: %q, %v", got, err)
		}
		onDisk, _ := os.ReadFile(path)
		if string(onDisk) != string(original) || s.commits != 0 || s.version != snap.Version {
			t.Fatal("copy wrote or changed the document version")
		}
	}
	if _, err := s.NodeMarkdown("stale-session", nodeID, nil); err == nil {
		t.Fatal("accepted stale session")
	}
	if _, err := s.NodeMarkdown(snap.Session, "missing", nil); err == nil {
		t.Fatal("accepted missing node")
	}
}

func TestNodeTextCopiesWholeLabelWithoutChildrenOrMetadata(t *testing.T) {
	s, snap, path := setup(t)
	original, _ := os.ReadFile(path)
	label := strings.Repeat("完整文本🐱 **bold** ", 100)
	source := "# " + label + "[color:#DC6A5E]\n## 子节点 [color:#5EAA80]\n"
	doc, err := markdown.Parse([]byte(source), "a.mind.md")
	if err != nil {
		t.Fatal(err)
	}
	s.doc = doc
	id := doc.Root.Children[0].ID
	want := strings.TrimSpace(label)
	for _, blocked := range []bool{false, true} {
		s.blocked = blocked
		got, err := s.NodeText(snap.Session, id, nil)
		if err != nil || got != want {
			t.Fatalf("got %q, error %v; want entire label", got, err)
		}
		for _, draft := range []string{"尚未保存🐱\n全部文本", ""} {
			got, err = s.NodeText(snap.Session, id, &draft)
			if err != nil || got != draft {
				t.Fatalf("draft got %q, error %v; want %q", got, err, draft)
			}
		}
		tree, err := s.NodeMarkdown(snap.Session, id, nil)
		if err != nil || tree != "# "+want+"\n## 子节点\n" {
			t.Fatalf("tree got %q, error %v", tree, err)
		}
		disk, _ := os.ReadFile(path)
		if string(disk) != string(original) || string(s.doc.Source) != source || s.commits != 0 || s.version != snap.Version {
			t.Fatal("copy changed document or disk")
		}
	}
	if _, err := s.NodeText("stale-session", id, nil); err == nil {
		t.Fatal("accepted stale session")
	}
	if _, err := s.NodeText(snap.Session, "missing", nil); err == nil {
		t.Fatal("accepted missing node")
	}
	s.doc = nil
	if _, err := s.NodeText(snap.Session, id, nil); err == nil {
		t.Fatal("accepted closed document")
	}
}
