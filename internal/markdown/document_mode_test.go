package markdown

import "testing"

func TestMindMapFilenameDoesNotBecomeVisibleRootSuffix(t *testing.T) {
	for _, name := range []string{"笔记.md", "想法.mind.md", "目录/其他.MIND.MD"} {
		doc, err := Parse([]byte("没有标题的正文。\n"), name)
		if err != nil {
			t.Fatal(err)
		}
		want := map[string]string{"笔记.md": "笔记", "想法.mind.md": "想法", "目录/其他.MIND.MD": "其他"}[name]
		if doc.Root.Label != want {
			t.Fatalf("want %s, got %s", want, doc.Root.Label)
		}
	}
}
