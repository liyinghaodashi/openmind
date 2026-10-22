package markdown

import (
	"strings"
	"testing"
)

func TestMindMultilineContinuation(t *testing.T) {
	source := "# 主节点\n## 二级\n### 三级\n- 第一行\n第二行\n\n第三行\n  - 子节点\n    续行\n- 同级\n# 另一主节点\n"
	doc, err := Parse([]byte(source), "multi.mind.md")
	if err != nil {
		t.Fatal(err)
	}
	third := doc.Root.Children[0].Children[0].Children[0]
	if len(third.Children) != 2 || third.Children[0].Label != "第一行\n第二行\n\n第三行" || len(third.Children[0].Children) != 1 || third.Children[0].Children[0].Label != "子节点\n    续行" {
		t.Fatalf("ordinary continuation must stay in the same node: %+v", third.Children[0])
	}
	if string(doc.Source) != source {
		t.Fatal("parsing rewrote source")
	}
}

func TestMindMultilineEditsRoundTrip(t *testing.T) {
	for _, ending := range []string{"\n", "\r\n"} {
		for _, source := range []string{"# 标题 [color:#abc] ##\n## 下级\n", "# 主\n## 二\n### 三\n- 标题 [color:#abc]\n- 同级\n", "#\n", "# ###\n"} {
			doc, _ := Parse([]byte(strings.ReplaceAll(source, "\n", ending)), "multi.mind.md")
			var target *Node
			for _, n := range doc.Nodes {
				if n.Label == "标题" || n.Kind == "heading" && n.Label == "" {
					target = n
				}
			}
			for _, label := range []string{"第一行\n第二行\n\n第三行🐱", "改第一行\n续行", "恢复单行", ""} {
				next, err := doc.WithLabel(target.ID, label)
				if err != nil {
					t.Fatalf("multiline save rejected: %v", err)
				}
				parsed, err := Parse(next.Source, "multi.mind.md")
				if err != nil {
					t.Fatal(err)
				}
				got := parsed.Nodes[target.ID]
				if got == nil || got.Label != label || got.Color != target.Color || len(parsed.Nodes) != len(doc.Nodes) {
					t.Fatalf("round trip: want %q, got %+v; source %q", label, got, next.Source)
				}
				copy, err := next.BranchMarkdown(target.ID, nil)
				if err != nil || strings.Contains(copy, "[color:") {
					t.Fatalf("copy: %q, %v", copy, err)
				}
				doc = next
			}
		}
	}
}

func TestMindMultilineMarkdownCreatesNodes(t *testing.T) {
	doc, _ := Parse([]byte("# 主\n## 二\n### 三\n- 原节点\n- 后续\n"), "multi.mind.md")
	target := moveNodeByLabel(t, doc, "原节点")
	next, err := doc.WithLabel(target.ID, "第一行\n续行\n- 新节点\n新节点续行\n# 新主节点")
	if err != nil {
		t.Fatal(err)
	}
	parsed, _ := Parse(next.Source, "multi.mind.md")
	moveNodeByLabel(t, parsed, "第一行\n续行")
	moveNodeByLabel(t, parsed, "新节点\n新节点续行")
	moveNodeByLabel(t, parsed, "新主节点")
}

func TestMindMultilineOperations(t *testing.T) {
	source := "# 主\n## 二\n### 三\n- 第一行 [color:#abc]\n续行\n  - 子项\n子项续行\n- 同级\n## 目标\n"
	doc, _ := Parse([]byte(source), "multi.mind.md")
	target := moveNodeByLabel(t, doc, "第一行\n续行")
	for _, color := range []string{"#123456", ""} {
		next, err := doc.WithColor(target.ID, color)
		if err != nil {
			t.Fatal(err)
		}
		parsed, _ := Parse(next.Source, "multi.mind.md")
		if parsed.Nodes[target.ID].Label != target.Label || parsed.Nodes[target.ID].Color != color {
			t.Fatalf("color changed multiline label: %+v", parsed.Nodes[target.ID])
		}
	}
	draft := "复制草稿\n复制续行"
	copy, err := doc.BranchMarkdown(target.ID, &draft)
	if err != nil || !strings.HasPrefix(copy, "- 复制草稿\n复制续行\n  - 子项\n子项续行\n") {
		t.Fatalf("draft branch copy %q: %v", copy, err)
	}
	if _, _, err := doc.WithChild(target.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := doc.WithSibling(target.ID); err != nil {
		t.Fatal(err)
	}
	deleted, _, _, err := doc.WithoutNode(target.ID)
	if err != nil || strings.Contains(string(deleted.Source), "续行") {
		t.Fatalf("delete retained continuation: %v", err)
	}
	for _, destination := range []string{"同级", "目标"} {
		next, ids, focus, err := doc.WithMovedNode(target.ID, moveNodeByLabel(t, doc, destination).ID, "child")
		if err != nil {
			t.Fatalf("moving multiline node to %s: %v", destination, err)
		}
		if next.Nodes[focus].Label != target.Label || len(ids) != len(doc.Nodes) || strings.Count(string(next.Source), "子项续行") != 1 || strings.Count(string(next.Source), "\n续行") != 1 {
			t.Fatal("moving duplicated or lost text")
		}
	}
}

func TestMindMultilineEmptyFirstLine(t *testing.T) {
	for _, source := range []string{"#\n续行\n", "# 主\n## 二\n### 三\n-\n续行\n"} {
		doc, _ := Parse([]byte(source), "empty.mind.md")
		node := moveNodeByLabel(t, doc, "\n续行")
		next, err := doc.WithLabel(node.ID, "补全首行\n续行")
		if err != nil {
			t.Fatal(err)
		}
		parsed, _ := Parse(next.Source, "empty.mind.md")
		moveNodeByLabel(t, parsed, "补全首行\n续行")
	}
}
