package markdown

import (
	"strings"
	"testing"
)

func TestMindTextFold(t *testing.T) {
	for _, source := range []string{"# 一二三 [color:#abc] ###\r\n## 子\r\n", "- 一 [color:#abc]\n二\n三\n  - 子\n"} {
		doc, err := Parse([]byte(source), "test.mind.md")
		if err != nil {
			t.Fatal(err)
		}
		n := doc.Root.Children[0]
		folded, err := doc.WithFold(n.ID, true)
		if err != nil {
			t.Fatal(err)
		}
		got := folded.Nodes[n.ID]
		if !got.Fold || got.Label != n.Label || got.Color != n.Color || len(got.Children) != len(n.Children) {
			t.Fatalf("fold changed node: %+v", got)
		}
		copy, err := folded.BranchMarkdown(n.ID, nil)
		if err != nil || strings.Contains(copy, "[isFold]") || strings.Contains(copy, "[color:") {
			t.Fatalf("copy: %q %v", copy, err)
		}
		plain, err := folded.WithFold(n.ID, false)
		if err != nil || string(plain.Source) != source {
			t.Fatalf("round trip: %q %v", plain.Source, err)
		}
		edited, err := folded.WithLabel(n.ID, "新内容\n第二行\n第三行")
		if err != nil {
			t.Fatal(err)
		}
		if !edited.Nodes[n.ID].Fold || edited.Nodes[n.ID].Label != "新内容\n第二行\n第三行" || edited.Nodes[n.ID].Color != n.Color {
			t.Fatalf("edit: %+v", edited.Nodes[n.ID])
		}
		colored, err := edited.WithColor(n.ID, "#123456")
		if err != nil || !colored.Nodes[n.ID].Fold || colored.Nodes[n.ID].Color != "#123456" {
			t.Fatalf("color: %v", err)
		}
		reparsed, err := Parse(colored.Source, "test.mind.md")
		if err != nil || !reparsed.Nodes[n.ID].Fold || reparsed.Nodes[n.ID].Label != edited.Nodes[n.ID].Label {
			t.Fatalf("reopen: %v", err)
		}
	}
	doc, _ := Parse([]byte("# 正文 [isFold]\n"), "test.md")
	if doc.Root.Fold || !strings.Contains(doc.Root.Label, "[isFold]") {
		t.Fatal("ordinary Markdown changed")
	}
}

func TestFoldedDraftKeepsNodeIDsUntilReparse(t *testing.T) {
	doc, _ := Parse([]byte("# 原文 [isFold]\n## 后续\n"), "test.mind.md")
	id := doc.Root.Children[0].ID
	next, err := doc.WithLabel(id, "草稿\n## 尚在输入的文字")
	if err != nil {
		t.Fatal(err)
	}
	if len(next.Nodes) != len(doc.Nodes) || next.Nodes[id].Label != "草稿\n## 尚在输入的文字" || !next.Nodes[id].Fold {
		t.Fatal("fold must not reparse an active edit")
	}
}
