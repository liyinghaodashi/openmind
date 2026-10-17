package markdown

import (
	"bytes"
	"testing"
)

func moveNodeByLabel(t *testing.T, d *Document, label string) *Node {
	t.Helper()
	for _, n := range d.Nodes {
		if n.Label == label {
			return n
		}
	}
	t.Fatalf("missing node %q", label)
	return nil
}

func TestMoveBranch(t *testing.T) {
	for _, tc := range []struct{ name, source, node, target, placement, want string }{
		{"heading after", "# Root\n\n## A\nbody A\n### Child\n- Item\n\n## B\nbody B\n", "A", "B", "after", "# Root\n\n## B\nbody B\n\n## A\nbody A\n### Child\n- Item\n\n"},
		{"heading before", "# Root\n\n## A\n\n## B\n\n## C\n", "C", "A", "before", "# Root\n\n## C\n\n## A\n\n## B\n\n"},
		{"heading child", "# Root\n\n## A\n### Child\n\n## B\n", "A", "B", "child", "# Root\n\n## B\n\n### A\n#### Child\n\n"},
		{"heading promote", "# Root\n\n## A\n### Child\n#### Deep\n\n## B\n", "Child", "B", "after", "# Root\n\n## A\n## B\n\n## Child\n### Deep\n\n"},
		{"list after", "# Root\n\n- A\n  - Child\n- B\n", "A", "B", "after", "# Root\n\n- B\n- A\n  - Child\n"},
		{"list before", "# Root\n\n- A\n- B\n  - Child\n", "B", "A", "before", "# Root\n\n- B\n  - Child\n- A\n"},
		{"list child", "# Root\n\n- A\n  - Child\n- B\n", "A", "B", "child", "# Root\n\n- B\n  - A\n    - Child\n"},
		{"list promote", "# Root\n\n- A\n  - Child\n    - Deep\n- B\n", "Child", "B", "after", "# Root\n\n- A\n- B\n- Child\n  - Deep\n"},
		{"list cross heading", "# Root\n\n## A\n- Item\n  - Child\n\n## B\nbody\n", "Item", "B", "child", "# Root\n\n## A\n## B\nbody\n- Item\n  - Child\n\n"},
		{"heading to list", "# Root\n\n## A\nbody\n### Child\n- Item\n\n## B\n- Target\n", "A", "Target", "child", "# Root\n\n## B\n- Target\n  - A\n\n    body\n    - Child\n      - Item\n\n"},
		{"list to heading", "# Root\n\n- Item\n  - Child\n\n## B\n", "Item", "B", "after", "# Root\n\n## B\n\n## Item\n### Child\n\n"},
		{"list appended after heading children", "# Root\n\n## A\n- Item\n  - Child\n\n## B\n### Existing\n", "Item", "B", "child", "# Root\n\n## A\n## B\n### Existing\n\n### Item\n#### Child\n\n"},
		{"synthetic root", "# One\n- Item\n\n# Two\n", "Item", "file", "child", "# One\n# Two\n\n# Item\n\n"},
		{"frontmatter", "---\ntitle: preserve\n---\n\n# Root\n\n## A\n\n## B\n", "A", "B", "after", "---\ntitle: preserve\n---\n\n# Root\n\n## B\n\n## A\n\n"},
		{"ordered child", "# Root\n\n10. A\n    - Child\n11. B\n", "A", "B", "child", "# Root\n\n11. B\n\n    10. A\n        - Child\n"},
		{"setext child", "Root\n====\n\nA\n---\nbody\n\n## B\n", "A", "B", "child", "Root\n====\n\n## B\n\n### A\nbody\n\n"},
		{"BOM CRLF", "\xef\xbb\xbf# Root\r\n\r\n## A\r\n\r\n## B\r\n", "A", "B", "child", "\xef\xbb\xbf# Root\r\n\r\n## B\r\n\r\n### A\r\n\r\n"},
		{"no final newline", "# Root\n\n- A\n- B", "B", "A", "before", "# Root\n\n- B\n- A\n"},
		{"code stays", "# Root\n\n## A\n```java\n# fake\n- fake\n```\n\n## B\n", "A", "B", "child", "# Root\n\n## B\n\n### A\n```java\n# fake\n- fake\n```\n\n"},
		{"list following code", "# Root\n\n- A\n- B\n\n```java\nkeep\n```\n", "A", "B", "after", "# Root\n\n- B\n\n- A\n```java\nkeep\n```\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d, err := Parse([]byte(tc.source), "file.md")
			if err != nil {
				t.Fatal(err)
			}
			node, target := moveNodeByLabel(t, d, tc.node), moveNodeByLabel(t, d, tc.target)
			next, ids, focus, err := d.WithMovedNode(node.ID, target.ID, tc.placement)
			if err != nil {
				t.Fatal(err)
			}
			if string(next.Source) != tc.want {
				t.Fatalf("got %q\nwant %q", next.Source, tc.want)
			}
			if len(ids) != len(d.Nodes) || next.Nodes[focus].Label != tc.node {
				t.Fatal("invalid node mapping")
			}
			if !bytes.Equal(d.Source, []byte(tc.source)) {
				t.Fatal("mutated original source")
			}
		})
	}
}

func TestMoveRejectsUnsafeTargets(t *testing.T) {
	d, _ := Parse([]byte("# Root\n\n## A\n### Child\n\n###### Deep\n\n## B\n"), "test.md")
	a, child, b := moveNodeByLabel(t, d, "A"), moveNodeByLabel(t, d, "Child"), moveNodeByLabel(t, d, "B")
	for _, tc := range []struct{ node, target, placement string }{
		{d.Root.ID, b.ID, "child"}, {a.ID, a.ID, "after"}, {a.ID, child.ID, "child"}, {b.ID, d.Root.ID, "after"}, {a.ID, b.ID, "invalid"}, {"missing", b.ID, "child"}, {a.ID, "missing", "child"}, {a.ID, b.ID, "child"},
	} {
		if _, _, _, err := d.WithMovedNode(tc.node, tc.target, tc.placement); err == nil {
			t.Fatalf("unsafe move accepted: %#v", tc)
		}
	}
}

func TestMoveRepeatedLabelsAndFurtherEditing(t *testing.T) {
	d, _ := Parse([]byte("# Root\n\n## Same\n\n## Same\n\n## B\n"), "test.md")
	first, second := d.Root.Children[0], d.Root.Children[1]
	next, ids, _, err := d.WithMovedNode(first.ID, d.Root.Children[2].ID, "after")
	if err != nil {
		t.Fatal(err)
	}
	if next.Root.Children[0].ID != ids[second.ID] || next.Root.Children[2].ID != ids[first.ID] {
		t.Fatal("duplicate labels confused")
	}
	next, err = next.WithLabel(ids[first.ID], "Moved")
	if err != nil || !bytes.HasSuffix(next.Source, []byte("## Moved\n\n")) {
		t.Fatal("moved node offsets invalid")
	}
}
