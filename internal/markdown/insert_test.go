package markdown

import (
	"bytes"
	"testing"
)

func TestInsertChild(t *testing.T) {
	for _, tc := range []struct{ name, source, parent string }{
		{"heading", "# Root\n\n## Parent\n\nbody\n\n### Existing\n\n## Sibling\n", "Parent"},
		{"list", "# Root\n\n- Parent\n- Sibling\n", "Parent"},
		{"nested", "# Root\n\n- Parent\n  - Existing\n    - Deep\n- Sibling\n", "Parent"},
		{"ordered", "# Root\n\n10. Parent\n    - Existing\n11. Sibling\n", "Parent"},
		{"end", "# Root\n\n- Parent", "Parent"},
		{"h6", "# Root\n\n###### Parent\n\n- Existing\n", "Parent"},
		{"setext", "Root\n====\n\nParent\n------\n\ntext\n", "Parent"},
		{"empty", "", "file"},
		{"file headings", "# One\n\n# Two\n", "file"},
		{"crlf", "# Root\r\n\r\n## Parent\r\n", "Parent"},
		{"frontmatter", "---\ntitle: demo\n---\n\n# Root\n\n## Parent\n", "Parent"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d, err := Parse([]byte(tc.source), "file.md")
			if err != nil {
				t.Fatal(err)
			}
			var parent *Node
			for _, n := range d.Nodes {
				if n.Label == tc.parent {
					parent = n
					break
				}
			}
			if parent == nil {
				t.Fatal("missing fixture parent")
			}
			next, id, err := d.WithChild(parent.ID)
			if err != nil {
				t.Fatal(err)
			}
			created := next.Nodes[id]
			if created == nil || created.Label != "新节点" || !created.Editable {
				t.Fatal("new node not editable")
			}
			var nextParent *Node
			for _, n := range next.Nodes {
				if n.Label == tc.parent {
					nextParent = n
					break
				}
			}
			if nextParent == nil || nextParent.Children[len(nextParent.Children)-1] != created {
				t.Fatal("wrong parent")
			}
			if len(next.Nodes) != len(d.Nodes)+1 {
				t.Fatal("existing nodes changed")
			}
			if !bytes.Equal(d.Source, []byte(tc.source)) {
				t.Fatal("mutated original")
			}
			if tc.name == "crlf" && bytes.Contains(bytes.ReplaceAll(next.Source, []byte("\r\n"), nil), []byte("\n")) {
				t.Fatal("mixed line endings")
			}
			if _, _, err = next.WithChild(id); err != nil {
				t.Fatalf("cannot add next generation: %v", err)
			}
		})
	}
}
