package document

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"openmind/internal/workspace"
)

func TestEmptyMindNodesCanBeEditedAfterReopen(t *testing.T) {
	source := "# openmind\n\n## 设计思路\n\n###\n\n## 从小处开始\n\n- 双击一个节点\n- 写下新的想法\n\n## 留一点自由\n\n这里的普通段落会原样保留。\n\n### Markdown 就是原稿\n\n-\n- 文件可以被其他编辑器打开\n"
	root := t.TempDir()
	name := "empty.mind.md"
	path := filepath.Join(root, name)
	if err := os.WriteFile(path, []byte(source), 0644); err != nil {
		t.Fatal(err)
	}
	w, err := workspace.Open(root)
	if err != nil {
		t.Fatal(err)
	}
	s := New(t.TempDir())
	s.SetWorkspace(w)
	snap, err := s.Open(name)
	if err != nil {
		t.Fatal(err)
	}
	headingID := snap.Root.Children[0].Children[0].Children[0].ID
	listID := snap.Root.Children[0].Children[2].Children[0].Children[0].ID
	for _, id := range []string{headingID, listID} {
		for i, label := range []string{"第一次输入", "", "重新输入"} {
			snap, err = s.Apply(Edit{Session: snap.Session, Version: snap.Version, OpID: id + string(rune('0'+i)), Kind: "label", NodeID: id, Text: label})
			if err != nil {
				t.Fatal(err)
			}
			snap, err = s.Reparse(snap.Session)
			if err != nil {
				t.Fatal(err)
			}
			snap, err = s.Open(name)
			if err != nil {
				t.Fatal(err)
			}
			node := snap.Root.Children[0].Children[0].Children[0]
			if id == listID {
				node = snap.Root.Children[0].Children[2].Children[0].Children[0]
			}
			if !node.Editable || node.Label != label {
				t.Fatalf("reopened node cannot be edited: %+v", node)
			}
		}
	}
	want := strings.Replace(source, "###\n", "### 重新输入\n", 1)
	want = strings.Replace(want, "\n-\n", "\n- 重新输入\n", 1)
	data, err := os.ReadFile(path)
	if err != nil || string(data) != want || snap.Source != want {
		t.Fatalf("saved source = %q, want %q; error=%v", data, want, err)
	}
}
