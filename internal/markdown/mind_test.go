package markdown

import (
	"bytes"
	"testing"
)

func TestMindStrictHierarchy(t *testing.T) {
	source := "# 主节点 A\n## 二级\n### 三级\n- 1. 配置数据库\n- 2. 访问网页\n  - 默认地址\n    - 127.0.0.1:8080\n# 主节点 B\n## 第二分支\n### 第二主题\n- 细分\n"
	doc, err := Parse([]byte(source), "strict.mind.md")
	if err != nil {
		t.Fatal(err)
	}
	if doc.Root.Kind != "file" || len(doc.Root.Children) != 2 {
		t.Fatalf("expected two main nodes under a hidden file root: %+v", doc.Root)
	}
	a := doc.Root.Children[0]
	if a.Label != "主节点 A" || a.Level != 1 || a.Children[0].Level != 2 || a.Children[0].Children[0].Level != 3 {
		t.Fatalf("incorrect heading hierarchy: %+v", a)
	}
	steps := a.Children[0].Children[0].Children
	if len(steps) != 2 || steps[0].Label != "1. 配置数据库" || steps[1].Label != "2. 访问网页" || steps[1].Children[0].Children[0].Label != "127.0.0.1:8080" {
		t.Fatalf("incorrect list hierarchy: %+v", steps)
	}
	for _, node := range doc.Nodes {
		if node.Kind != "file" && (!node.Editable || string(doc.Source[node.Start:node.End]) != node.Label) {
			t.Fatalf("node source span is not editable: %+v", node)
		}
	}
	if !bytes.Equal(doc.Source, []byte(source)) {
		t.Fatal("opening a mind document rewrote its source")
	}
}

func TestMindRejectsUnsupportedStructures(t *testing.T) {
	for _, tc := range []struct{ name, source string }{
		{"orphan headings", "## Orphan\n### Orphan\n- Orphan\n# Keep\n"},
		{"skipped secondary", "# Keep\n### Orphan\n- Orphan\n"},
		{"skipped third", "# Keep\n- Orphan\n## Secondary\n- Orphan\n"},
		{"deep headings", "# Keep\n## Secondary\n### Third\n#### Orphan\n- Orphan\n##### Orphan\n###### Orphan\n"},
		{"other lists", "# Keep\n## Secondary\n### Third\n1. Orphan\n   - Orphan\n+ Orphan\n* Orphan\n"},
		{"indented orphan", "# Keep\n## Secondary\n### Third\n  - Orphan\n    - Orphan\n"},
		{"setext", "Orphan\n====\n\nOrphan\n----\n# Keep\n"},
		{"fenced code", "# Keep\n## Secondary\n### Third\n```md\n# Orphan\n- Orphan\n```\n~~~\n## Orphan\n~~~\n"},
		{"frontmatter", "---\n# Orphan\n- Orphan\n---\n# Keep\n"},
		{"html comment", "<!--\n# Orphan\n-->\n# Keep\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			doc, err := Parse([]byte(tc.source), "strict.mind.md")
			if err != nil {
				t.Fatal(err)
			}
			for _, node := range doc.Nodes {
				if node.Label == "Orphan" || node.Level > 3 || node.Kind == "list" {
					t.Fatalf("unsupported syntax became a mind node: %+v", node)
				}
			}
			if len(doc.Root.Children) != 1 || doc.Root.Children[0].Label != "Keep" || string(doc.Source) != tc.source {
				t.Fatal("invalid structure changed supported main node or source")
			}
		})
	}
}

func TestMindEmptyAndLiteralLabels(t *testing.T) {
	source := "\ufeff#\r\n##\r\n### ###  \r\n-\r\n  - 1. 步骤\r\n- # 标题文字\r\n- - 列表文字\r\n"
	doc, err := Parse([]byte(source), "empty.MIND.MD")
	if err != nil {
		t.Fatal(err)
	}
	main := doc.Root.Children[0]
	third := main.Children[0].Children[0]
	if main.Label != "" || third.Label != "" || len(third.Children) != 3 || third.Children[0].Children[0].Label != "1. 步骤" || third.Children[1].Label != "# 标题文字" || third.Children[2].Label != "- 列表文字" {
		t.Fatalf("empty or literal labels changed: %+v", third)
	}
	for _, node := range []*Node{main, main.Children[0], third, third.Children[0]} {
		next, err := doc.WithLabel(node.ID, "新内容🐱")
		if err != nil {
			t.Fatal(err)
		}
		parsed, err := Parse(next.Source, "empty.MIND.MD")
		if err != nil || parsed.Nodes[node.ID] == nil || parsed.Nodes[node.ID].Label != "新内容🐱" || len(parsed.Nodes) != len(doc.Nodes) {
			t.Fatalf("empty node edit changed structure: %v", err)
		}
	}
}
