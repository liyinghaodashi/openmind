package markdown

import "testing"

func TestBranchMarkdown(t *testing.T) {
	for _, tc := range []struct{ name, source, node, want string }{
		{"heading", "# Root\n\n## A **bold** ##\n正文\n\n```md\n## fake\n```\n### Child\n- [x] Item\n  - Deep\n\n## B\n", "A **bold**", "## A **bold** ##\n正文\n\n```md\n## fake\n```\n### Child\n- [x] Item\n  - Deep\n\n"},
		{"nested list", "# Root\n- Parent\n  - Child\n    - Deep\n  - Sibling\n", "Child", "  - Child\n    - Deep\n"},
		{"ordered task", "# Root\n10. [x] Task\n    continuation\n    - Child\n11. Other\n", "[x] Task\ncontinuation", "10. [x] Task\n    continuation\n    - Child\n"},
		{"list before code", "# Root\n- Item\n\n```go\nkeep\n```\n", "Item", "- Item\n\n"},
		{"setext", "Root\n====\n\nBranch\n---\nbody\n\n## Next\n", "Branch", "Branch\n---\nbody\n\n"},
		{"CRLF unicode", "\ufeff# 根\r\n## 分支🐱\r\n- 子项\r\n## 其他\r\n", "分支🐱", "## 分支🐱\r\n- 子项\r\n"},
		{"no final newline", "# Root\n- A\n- B", "B", "- B"},
		{"empty list", "# Root\n-\n- B\n", "", "-\n"},
		{"root", "\ufeff# Root\r\n\r\n- Child\r\n", "Root", "\ufeff# Root\r\n\r\n- Child\r\n"},
		{"file root", "---\ntitle: metadata\n---\n# One\n# Two\n", "file", "---\ntitle: metadata\n---\n# One\n# Two\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			doc, err := Parse([]byte(tc.source), "file.md")
			if err != nil {
				t.Fatal(err)
			}
			node := moveNodeByLabel(t, doc, tc.node)
			got, err := doc.BranchMarkdown(node.ID, nil)
			if err != nil || got != tc.want {
				t.Fatalf("got %q, error %v; want %q", got, err, tc.want)
			}
			if string(doc.Source) != tc.source {
				t.Fatal("copy changed the source")
			}
		})
	}
}

func TestBranchMarkdownDraft(t *testing.T) {
	for _, source := range []string{"# Root\n## Old\n- Child\n## Other\n", "# Root\n- Old\n  - Child\n- Other\n"} {
		doc, _ := Parse([]byte(source), "file.md")
		node := moveNodeByLabel(t, doc, "Old")
		for _, draft := range []string{"最新🐱", "", "- nested syntax", "# heading syntax"} {
			updated, err := doc.WithLabel(node.ID, draft)
			if err != nil {
				t.Fatal(err)
			}
			start, end := len("# Root\n"), len(updated.Source)
			if node.Kind == "heading" {
				end -= len("## Other\n")
			} else {
				end -= len("- Other\n")
			}
			got, err := doc.BranchMarkdown(node.ID, &draft)
			if err != nil || got != string(updated.Source[start:end]) {
				t.Fatalf("draft %q: got %q, error %v", draft, got, err)
			}
			if string(doc.Source) != source || doc.Nodes[node.ID].Label != "Old" {
				t.Fatal("copy changed the document")
			}
			got, err = updated.BranchMarkdown(node.ID, &draft)
			if err != nil || got != string(updated.Source[start:end]) {
				t.Fatalf("already saved draft %q: got %q, error %v", draft, got, err)
			}
		}
		if _, err := doc.BranchMarkdown("missing", nil); err == nil {
			t.Fatal("accepted missing node")
		}
	}
}
