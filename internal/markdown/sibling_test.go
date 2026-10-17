package markdown

import "testing"

func TestInsertSibling(t *testing.T) {
	for _, source := range []string{
		"# Root\n\n## Current\n\n### Child\n\n## After\n",
		"# Root\n\n- Current\n  - Child\n- After\n",
		"# Root\n\n1. Current\n   - Child\n2. After\n",
		"# Root\n\n- Parent\n  - Current\n  - After\n",
		"# Root\r\n\r\n## Current\r\n",
		"Root\n====\n\nCurrent\n----\n",
		"# Root\n\n###### Current\n",
	} {
		d, err := Parse([]byte(source), "test.md")
		if err != nil {
			t.Fatal(err)
		}
		var current *Node
		for _, n := range d.Nodes {
			if n.Label == "Current" {
				current = n
			}
		}
		next, id, err := d.WithSibling(current.ID)
		if err != nil {
			t.Fatalf("%q: %v", source, err)
		}
		found := false
		for _, n := range next.Nodes {
			for i, c := range n.Children {
				if c.Label == "Current" {
					if i+1 >= len(n.Children) || n.Children[i+1].ID != id {
						t.Fatal("new sibling not immediately after current")
					}
					found = true
				}
			}
		}
		if !found || next.Nodes[id].Label != "新节点" {
			t.Fatal("missing new sibling")
		}
		if _, _, err = next.WithSibling(id); err != nil {
			t.Fatal(err)
		}
		if _, _, err = d.WithSibling(d.Root.ID); err == nil {
			t.Fatal("root sibling allowed")
		}
	}
}
