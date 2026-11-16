package markdown

import (
	"reflect"
	"testing"
)

func TestMindMissingAncestors(t *testing.T) {
	for _, tc := range []struct {
		name, source string
		paths        []string
	}{
		{"no main heading", "## A\n### B\n- C\n  - D\n## E\n", []string{"A", "A/B", "A/B/C", "A/B/C/D", "E"}},
		{"skipped levels", "# A\n### B\n- C\n## D\n- E\n", []string{"A", "A/B", "A/B/C", "A/D", "A/D/E"}},
		{"list only", "  - A\n      - B\n- C\n  - D\n", []string{"A", "A/B", "C", "C/D"}},
		{"deep headings", "#### A\n###### B\n- C\n##### D\n## E\n", []string{"A", "A/B", "A/B/C", "A/D", "E"}},
		{"mixed roots", "- A\n  - B\n## C\n- D\n# E\n- F\n", []string{"A", "A/B", "C", "C/D", "E", "E/F"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			doc, err := Parse([]byte(tc.source), "relaxed.mind.md")
			if err != nil {
				t.Fatal(err)
			}
			var paths []string
			var visit func(*Node, string)
			visit = func(n *Node, prefix string) {
				for _, c := range n.Children {
					p := prefix + c.Label
					paths = append(paths, p)
					visit(c, p+"/")
				}
			}
			visit(doc.Root, "")
			if !reflect.DeepEqual(paths, tc.paths) {
				t.Fatalf("visible paths = %v, want %v", paths, tc.paths)
			}
			if string(doc.Source) != tc.source {
				t.Fatal("opening changed source")
			}
			for _, n := range doc.Nodes {
				if n.Kind != "file" {
					next, err := doc.WithLabel(n.ID, "Edited")
					if err != nil || next.Nodes[n.ID].Label != "Edited" {
						t.Fatalf("editing %s: %v", n.Label, err)
					}
				}
			}
		})
	}
}
