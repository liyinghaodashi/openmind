package markdown

import (
	"strings"
	"testing"
)

func TestMindColorSuffix(t *testing.T) {
	for _, tc := range []struct{ text, label, color string }{
		{"产品设计 [color:#3b82f6]", "产品设计", "#3B82F6"},
		{"[color:#abc]", "", "#AABBCC"},
		{"文本\t[color:#92969E]", "文本", "#92969E"},
		{"文本 [color:#oops]", "文本 [color:#oops]", ""},
		{"文本 [color:#123456] 后文", "文本 [color:#123456] 后文", ""},
	} {
		doc, err := Parse([]byte("# "+tc.text+" ##\n"), "colors.mind.md")
		if err != nil {
			t.Fatal(err)
		}
		node := doc.Root.Children[0]
		if node.Label != tc.label || node.Color != tc.color {
			t.Fatalf("%q: %+v", tc.text, node)
		}
	}
	doc, _ := Parse([]byte("# 产品设计 [color:#3B82F6]\n"), "plain.md")
	if doc.Root.Label != "产品设计 [color:#3B82F6]" || doc.Root.Color != "" {
		t.Fatal("ordinary Markdown changed")
	}
	if _, err := doc.WithColor(doc.Root.ID, "#123456"); err == nil {
		t.Fatal("accepted color in ordinary Markdown")
	}
}

func TestMindColorEditCopyAndMove(t *testing.T) {
	source := "\ufeff# 主节点 [color:#D4776A]\r\n## 二级\t[color:#3b82f6] ##\r\n### 三级 [color:#72A58A]\r\n- 子项 [color:#C6A35C]\r\n  - 深层 [color:#92969E]\r\n```md\r\n# 示例 [color:#123456]\r\n```\r\n正文 [color:#123456]\r\n# 第二节点"
	doc, _ := Parse([]byte(source), "colors.mind.md")
	second := moveNodeByLabel(t, doc, "二级")
	for _, label := range []string{"新标题🐱", "", "继续编辑"} {
		var err error
		doc, err = doc.WithLabel(second.ID, label)
		if err != nil {
			t.Fatal(err)
		}
		if doc.Nodes[second.ID].Label != label || doc.Nodes[second.ID].Color != "#3B82F6" || !strings.Contains(string(doc.Source), "[color:#3b82f6] ##\r\n") {
			t.Fatal("editing lost color or closing heading")
		}
	}
	draft := "复制草稿"
	copy, err := doc.BranchMarkdown(second.ID, &draft)
	if err != nil || !strings.HasPrefix(copy, "## 复制草稿 ##\r\n### 三级\r\n- 子项\r\n  - 深层\r\n") || strings.Count(copy, "[color:") != 2 {
		t.Fatalf("copy = %q, err %v", copy, err)
	}
	if doc.Nodes[second.ID].Label != "继续编辑" {
		t.Fatal("copy changed document")
	}
	doc, err = doc.WithColor(second.ID, "#abc")
	if err != nil || doc.Nodes[second.ID].Color != "#AABBCC" || !strings.Contains(string(doc.Source), "继续编辑 [color:#AABBCC] ##\r\n") {
		t.Fatal("cannot replace color")
	}
	for _, color := range []string{"red", "#12345", "#123456] body", "#123456\n", "foo [color:#123456"} {
		if _, err := doc.WithColor(second.ID, color); err == nil {
			t.Fatalf("accepted %q", color)
		}
	}
	third := moveNodeByLabel(t, doc, "三级")
	next, ids, focus, err := doc.WithMovedNode(third.ID, moveNodeByLabel(t, doc, "第二节点").ID, "child")
	if err != nil || next.Nodes[focus].Color != "#72A58A" || next.Nodes[ids[moveNodeByLabel(t, doc, "深层").ID]].Color != "#92969E" {
		t.Fatalf("move lost color: %v", err)
	}
	next, _, err = next.WithChild(focus)
	if err != nil {
		t.Fatal(err)
	}
	doc, err = doc.WithColor(second.ID, "")
	if err != nil || doc.Nodes[second.ID].Color != "" || !strings.Contains(string(doc.Source), "继续编辑 ##\r\n") {
		t.Fatal("cannot remove color")
	}
	if _, err := doc.WithColor(doc.Root.ID, "#123456"); err == nil {
		t.Fatal("colored invisible file root")
	}
}

func TestEmptyMindColorNodeRemainsEditableAndInsertable(t *testing.T) {
	for _, source := range []string{"#", "# Main\n## \n", "# Main\n## Second\n### Third\n-\n"} {
		doc, _ := Parse([]byte(source), "empty.mind.md")
		var node *Node
		for _, candidate := range doc.Nodes {
			if candidate.Editable && candidate.Label == "" {
				node = candidate
			}
		}
		var err error
		doc, err = doc.WithColor(node.ID, "#3B82F6")
		if err != nil {
			t.Fatal(err)
		}
		parsed, _ := Parse(doc.Source, "empty.mind.md")
		if parsed.Nodes[node.ID].Start != doc.Nodes[node.ID].Start {
			t.Fatal("empty colored node source span drifted")
		}
		if _, _, err := doc.WithChild(node.ID); err != nil {
			t.Fatal(err)
		}
		for _, label := range []string{"恢复", "", "再次恢复"} {
			doc, err = doc.WithLabel(node.ID, label)
			if err != nil || doc.Nodes[node.ID].Label != label || doc.Nodes[node.ID].Color != "#3B82F6" {
				t.Fatalf("edit %q: %v", label, err)
			}
			parsed, _ = Parse(doc.Source, "empty.mind.md")
			if parsed.Nodes[node.ID].Start != doc.Nodes[node.ID].Start || parsed.Nodes[node.ID].End != doc.Nodes[node.ID].End {
				t.Fatal("colored label span drifted")
			}
		}
	}
}
