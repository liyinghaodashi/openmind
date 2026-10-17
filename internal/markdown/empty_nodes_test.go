package markdown

import (
	"strings"
	"testing"
)

func TestEmptyNodesRemainEditableAfterReparse(t *testing.T) {
	for _, prefix := range []string{"### ", "- "} {
		t.Run(prefix, func(t *testing.T) {
			source := "# Root\n\n" + prefix + "原节点\n"
			doc, err := Parse([]byte(source), "test.md")
			if err != nil {
				t.Fatal(err)
			}
			doc, err = doc.WithLabel(doc.Root.Children[0].ID, "")
			if err != nil {
				t.Fatal(err)
			}
			doc, err = Parse(doc.Source, "test.md")
			if err != nil {
				t.Fatal(err)
			}
			node := doc.Root.Children[0]
			if !node.Editable || node.Label != "" {
				t.Fatalf("empty node cannot be edited after reparse: %+v", node)
			}
			doc, err = doc.WithLabel(node.ID, "恢复节点")
			if err != nil {
				t.Fatal(err)
			}
			if got, want := string(doc.Source), strings.Replace(source, "原节点", "恢复节点", 1); got != want {
				t.Fatalf("source = %q, want %q", got, want)
			}
		})
	}
}

func TestEmptyNodeSourcePositions(t *testing.T) {
	for _, tc := range []struct {
		name, source, want string
	}{
		{"heading", "# Root\n\n###\n\n## Keep\n", "# Root\n\n### 新内容\n\n## Keep\n"},
		{"heading-spaces", "# Root\n\n  ###   \n", "# Root\n\n  ###   新内容\n"},
		{"heading-closing", "# Root\n\n### ###  \n", "# Root\n\n### 新内容 ###  \n"},
		{"heading-eof", "# Root\n\n###", "# Root\n\n### 新内容"},
		{"empty-root", "#", "# 新内容"},
		{"bom-crlf", "\xef\xbb\xbf#\r\n\r\n## Keep\r\n", "\xef\xbb\xbf# 新内容\r\n\r\n## Keep\r\n"},
		{"list", "# Root\n\n-\n- Keep\n", "# Root\n\n- 新内容\n- Keep\n"},
		{"list-spaces", "# Root\n\n-   \n- Keep\n", "# Root\n\n-   新内容\n- Keep\n"},
		{"list-long-padding", "# Root\n\n-     \n- Keep\n", "# Root\n\n- 新内容    \n- Keep\n"},
		{"list-tab", "# Root\n\n-\t\n- Keep\n", "# Root\n\n-\t新内容\n- Keep\n"},
		{"list-plus", "# Root\n\n+\n", "# Root\n\n+ 新内容\n"},
		{"list-star", "# Root\n\n*\n", "# Root\n\n* 新内容\n"},
		{"ordered", "# Root\n\n12.\n13. Keep\n", "# Root\n\n12. 新内容\n13. Keep\n"},
		{"ordered-paren", "# Root\n\n1) \n2) Keep\n", "# Root\n\n1) 新内容\n2) Keep\n"},
		{"nested", "# Root\n\n- Parent\n  - Before\n  -\n  - Keep\n", "# Root\n\n- Parent\n  - Before\n  - 新内容\n  - Keep\n"},
		{"empty-parent", "# Root\n\n-\n  - Keep\n", "# Root\n\n- 新内容\n  - Keep\n"},
		{"list-eof", "# Root\n\n-", "# Root\n\n- 新内容"},
		{"frontmatter", "---\ntitle: keep\n---\n# Root\n\n###\n", "---\ntitle: keep\n---\n# Root\n\n### 新内容\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			doc, err := Parse([]byte(tc.source), "test.md")
			if err != nil {
				t.Fatal(err)
			}
			var empty *Node
			for _, node := range doc.Nodes {
				if node.Label == "" {
					empty = node
				}
			}
			if empty == nil || !empty.Editable || empty.Start < 0 || empty.Start != empty.End {
				t.Fatalf("missing editable empty node: %+v", empty)
			}
			if string(doc.Source) != tc.source {
				t.Fatal("parse modified source")
			}
			doc, err = doc.WithLabel(empty.ID, "新内容")
			if err != nil {
				t.Fatal(err)
			}
			if string(doc.Source) != tc.want {
				t.Fatalf("source = %q, want %q", doc.Source, tc.want)
			}
			doc, err = doc.WithLabel(empty.ID, "继续输入")
			if err != nil {
				t.Fatal(err)
			}
			if want := strings.Replace(tc.want, "新内容", "继续输入", 1); string(doc.Source) != want {
				t.Fatalf("second edit = %q, want %q", doc.Source, want)
			}
			parsed, err := Parse(doc.Source, "test.md")
			if err != nil || len(parsed.Nodes) != len(doc.Nodes) {
				t.Fatalf("edit changed structure: %v", err)
			}
			for id, node := range doc.Nodes {
				next := parsed.Nodes[id]
				if next == nil || next.Kind != node.Kind || next.Label != node.Label || next.Start != node.Start || next.End != node.End || len(next.Children) != len(node.Children) {
					t.Fatalf("node drift after edit: before=%+v after=%+v", node, next)
				}
			}
		})
	}
}

func TestComplexListNodesRemainReadOnly(t *testing.T) {
	for _, source := range []string{"- first\n  continuation\n", "- > quote\n", "- ```go\n  code\n  ```\n"} {
		doc, err := Parse([]byte(source), "test.md")
		if err != nil {
			t.Fatal(err)
		}
		node := doc.Root.Children[0]
		if node.Editable {
			t.Fatalf("complex list became editable: %q", source)
		}
		if _, err := doc.WithLabel(node.ID, "overwrite"); err == nil {
			t.Fatalf("complex list accepted replacement: %q", source)
		}
	}
}

func TestEmptyNodeStructuralBoundaries(t *testing.T) {
	for _, prefix := range []string{"## ", "- ", "-"} {
		t.Run(prefix, func(t *testing.T) {
			marker := strings.TrimSpace(prefix) + " "
			source := "# Root\n\n" + marker + "Before\n" + prefix + "\n" + marker + "After\n"
			doc, err := Parse([]byte(source), "test.md")
			if err != nil {
				t.Fatal(err)
			}
			before, empty, after := doc.Root.Children[0], doc.Root.Children[1], doc.Root.Children[2]
			for _, node := range []*Node{before, empty} {
				next, _, _, err := doc.WithoutNode(node.ID)
				if err != nil || len(next.Root.Children) != 2 || next.Root.Children[1].Label != "After" {
					t.Fatalf("delete %q changed adjacent node: %v", node.Label, err)
				}
			}
			for _, sibling := range []bool{false, true} {
				if _, _, err := doc.withInsertedNode(empty.ID, sibling); err != nil {
					t.Fatalf("insert at empty node (sibling=%v): %v", sibling, err)
				}
			}
			next, _, _, err := doc.WithMovedNode(empty.ID, after.ID, "after")
			if err != nil || len(next.Root.Children) != 3 || next.Root.Children[2].Label != "" {
				t.Fatalf("move empty node: %v", err)
			}
		})
	}
}
