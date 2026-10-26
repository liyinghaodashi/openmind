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

func TestMindChildrenFold(t *testing.T) {
	for _, source := range []string{
		"# 标题 [color:#abc] ###\r\n## 子\r\n",
		"- 首行 [color:#abc]\n续行\n  - 子 [isFoldKid]\n    - 孙\n",
		"# 空子树\n",
	} {
		doc, err := Parse([]byte(source), "test.mind.md")
		if err != nil {
			t.Fatal(err)
		}
		n := doc.Root.Children[0]
		folded, err := doc.WithFoldKid(n.ID, true)
		if err != nil {
			t.Fatal(err)
		}
		if !folded.Nodes[n.ID].FoldKid || folded.Nodes[n.ID].Label != n.Label {
			t.Fatal("child fold changed label or did not persist")
		}
		plain, err := folded.WithFoldKid(n.ID, false)
		if err != nil || string(plain.Source) != source {
			t.Fatalf("round trip: %v, %q", err, plain.Source)
		}
		folded, err = folded.WithFold(n.ID, true)
		if err != nil {
			t.Fatal(err)
		}
		folded, err = folded.WithLabel(n.ID, "修改\n续行\n末行")
		if err != nil {
			t.Fatal(err)
		}
		folded, err = folded.WithColor(n.ID, "#123456")
		if err != nil {
			t.Fatal(err)
		}
		reopened, err := Parse(folded.Source, "test.mind.md")
		if err != nil {
			t.Fatal(err)
		}
		got := reopened.Nodes[n.ID]
		if !got.FoldKid || !got.Fold || got.Color != "#123456" || got.Label != "修改\n续行\n末行" {
			t.Fatalf("reopen: %+v", got)
		}
		copy, err := reopened.BranchMarkdown(n.ID, nil)
		if err != nil || strings.Contains(copy, "[isFold") || strings.Contains(copy, "[color:") {
			t.Fatalf("copy: %q %v", copy, err)
		}
		unfolded, err := reopened.WithFoldKid(n.ID, false)
		if err != nil || !unfolded.Nodes[n.ID].Fold || unfolded.Nodes[n.ID].FoldKid {
			t.Fatal("unfold children must preserve text fold")
		}
	}
	for _, flags := range []string{"[isFold] [isFoldKid]", "[isFoldKid] [isFold]", "[isFoldKid] [isFoldKid] [isFold]"} {
		doc, _ := Parse([]byte("# 标题 [color:#abc] "+flags+"\n"), "test.mind.md")
		n := doc.Root.Children[0]
		if !n.Fold || !n.FoldKid || n.Label != "标题" || n.Color != "#AABBCC" {
			t.Fatalf("flags: %+v", n)
		}
	}
	doc, _ := Parse([]byte("# 正文 [isFoldKid]\n"), "test.md")
	if doc.Root.FoldKid || !strings.Contains(doc.Root.Label, "[isFoldKid]") {
		t.Fatal("ordinary Markdown changed")
	}
	if _, err := doc.WithFoldKid(doc.Root.ID, true); err == nil {
		t.Fatal("ordinary Markdown accepts child fold")
	}
}
