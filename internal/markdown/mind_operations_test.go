package markdown

import (
	"bytes"
	"strings"
	"testing"
)

func TestMindInsertFollowsStrictLevels(t *testing.T) {
	doc, _ := Parse([]byte("# Main\n"), "insert.mind.md")
	current := doc.Root.Children[0]
	for _, want := range []struct {
		kind          string
		level, indent int
	}{{"heading", 2, 0}, {"heading", 3, 0}, {"list", 0, 0}, {"list", 0, 2}, {"list", 0, 4}} {
		next, id, err := doc.WithChild(current.ID)
		if err != nil {
			t.Fatal(err)
		}
		created := next.Nodes[id]
		if created == nil || created.Label != "" || !created.Editable || created.Kind != want.kind || created.Level != want.level || created.indent != want.indent {
			t.Fatalf("wrong created node: %+v, want %+v", created, want)
		}
		if len(next.Nodes) != len(doc.Nodes)+1 {
			t.Fatal("insertion hid existing nodes")
		}
		doc, current = next, created
	}
	for _, node := range doc.Nodes {
		if node.Kind == "file" {
			continue
		}
		next, id, err := doc.WithSibling(node.ID)
		if err != nil || next.Nodes[id].Label != "" || next.Nodes[id].Kind != node.Kind || next.Nodes[id].Level != node.Level {
			t.Fatalf("cannot insert sibling at %+v: %v", node, err)
		}
	}
	next, id, err := doc.WithChild(doc.Root.ID)
	if err != nil || next.Nodes[id].Label != "" || next.Nodes[id].Level != 1 || len(next.Root.Children) != 2 {
		t.Fatalf("cannot create another main node: %v", err)
	}
}

func TestMindAddingToThirdHeadingBeforeUnsupportedContent(t *testing.T) {
	for _, suffix := range []string{"正文\n#### Hidden\n- hidden detail\n", "- Existing\n\n#### Hidden\n- hidden detail\n"} {
		source := "# Main\n## Secondary\n### Third\n" + suffix + "### Other\n- Move\n"
		doc, _ := Parse([]byte(source), "hidden.mind.md")
		third := moveNodeByLabel(t, doc, "Third")
		next, id, err := doc.WithChild(third.ID)
		if err != nil || next.Nodes[id].Kind != "list" || !bytes.Contains(next.Source, []byte("#### Hidden\n- hidden detail\n")) {
			t.Fatalf("cannot add before hidden content: %v", err)
		}
		moved, _, focus, err := doc.WithMovedNode(moveNodeByLabel(t, doc, "Move").ID, third.ID, "child")
		if err != nil || moved.Nodes[focus].Kind != "list" || !bytes.Contains(moved.Source, []byte("#### Hidden\n- hidden detail\n")) {
			t.Fatalf("cannot move before hidden content: %v", err)
		}
	}
}

func TestMindMoveAcrossLevelsPreservesEveryNode(t *testing.T) {
	source := "# A\n## A2\n### A3\n- A4\n  - A5\n# B\n## B2\n### B3\n- B4\n"
	for _, tc := range []struct {
		node, target, placement, kind string
		level, indent                 int
	}{
		{"A", "B", "after", "heading", 1, 0},
		{"A2", "B2", "child", "heading", 3, 0},
		{"A3", "B3", "child", "list", 0, 0},
		{"A2", "B4", "child", "list", 0, 2},
		{"A4", "B", "child", "heading", 2, 0},
		{"A4", "B2", "child", "heading", 3, 0},
		{"A5", "B3", "child", "list", 0, 0},
		{"A3", "B", "before", "heading", 1, 0},
		{"A", "B4", "child", "list", 0, 2},
	} {
		t.Run(tc.node+"-"+tc.target+"-"+tc.placement, func(t *testing.T) {
			doc, _ := Parse([]byte(source), "move.mind.md")
			node, target := moveNodeByLabel(t, doc, tc.node), moveNodeByLabel(t, doc, tc.target)
			next, ids, focus, err := doc.WithMovedNode(node.ID, target.ID, tc.placement)
			if err != nil {
				t.Fatal(err)
			}
			moved := next.Nodes[focus]
			if moved.Kind != tc.kind || moved.Level != tc.level || moved.indent != tc.indent || len(ids) != len(doc.Nodes) || len(next.Nodes) != len(doc.Nodes) {
				t.Fatalf("move lost nodes or produced wrong hierarchy: %+v", moved)
			}
			for oldID, old := range doc.Nodes {
				if next.Nodes[ids[oldID]] == nil || next.Nodes[ids[oldID]].Label != old.Label {
					t.Fatal("move changed node text")
				}
			}
			if string(doc.Source) != source || strings.Contains(string(next.Source), "####") {
				t.Fatal("move changed input or generated an unsupported heading")
			}
			next, err = next.WithLabel(focus, "移动后🐱")
			if err != nil || !bytes.Contains(next.Source, []byte("移动后🐱")) {
				t.Fatalf("moved node no longer editable: %v", err)
			}
		})
	}
}

func TestMindSourceSpansSurviveEditsCopyInsertAndDelete(t *testing.T) {
	source := "\ufeff# 主节点\r\n## 二级\r\n### 三级\r\n- 1. 原步骤\r\n  - 备注\r\n- 2. 保留\r\n\r\n```md\r\n# fake\r\n```\r\n# 第二主节点"
	doc, _ := Parse([]byte(source), "spans.mind.md")
	step := moveNodeByLabel(t, doc, "1. 原步骤")
	doc, err := doc.WithLabel(step.ID, "1. 新步骤🐱")
	if err != nil {
		t.Fatal(err)
	}
	got, err := doc.BranchMarkdown(step.ID, nil)
	if err != nil || got != "- 1. 新步骤🐱\r\n  - 备注\r\n" {
		t.Fatalf("incorrect branch copy: %q, %v", got, err)
	}
	next, id, err := doc.WithSibling(step.ID)
	if err != nil || next.Nodes[id].Kind != "list" || len(next.Nodes) != len(doc.Nodes)+1 {
		t.Fatalf("cannot insert after label edit: %v", err)
	}
	next, ids, _, err := next.WithoutNode(moveNodeByLabel(t, next, "1. 新步骤🐱").ID)
	if err != nil || next.Nodes[ids[id]] == nil || bytes.Contains(next.Source, []byte("备注")) || !bytes.Contains(next.Source, []byte("# fake\r\n")) || !bytes.HasPrefix(next.Source, []byte("\ufeff")) {
		t.Fatalf("deletion damaged source boundaries: %q, %v", next.Source, err)
	}
	if bytes.Contains(bytes.ReplaceAll(next.Source, []byte("\r\n"), nil), []byte("\n")) {
		t.Fatal("structural operations changed CRLF")
	}
}

func TestMindDeleteMainNodesAndRejectCycles(t *testing.T) {
	doc, _ := Parse([]byte("# A\n## A2\n### A3\n- Detail\n# B\n"), "main.mind.md")
	a, b := doc.Root.Children[0], doc.Root.Children[1]
	if _, _, _, err := doc.WithMovedNode(a.ID, a.Children[0].ID, "child"); err == nil {
		t.Fatal("moving a main node into its descendant succeeded")
	}
	next, ids, focus, err := doc.WithoutNode(a.ID)
	if err != nil || len(next.Root.Children) != 1 || focus != ids[b.ID] || string(next.Source) != "# B\n" {
		t.Fatalf("cannot delete a main branch: %v", err)
	}
	next, _, focus, err = next.WithoutNode(focus)
	if err != nil || len(next.Root.Children) != 0 || len(next.Nodes) != 1 || focus != "" || len(next.Source) != 0 {
		t.Fatalf("cannot delete the last main node: %v", err)
	}
	if _, _, _, err := doc.WithoutNode(doc.Root.ID); err == nil {
		t.Fatal("hidden root deletion allowed")
	}
}

func TestMindMovesAtEveryDepthAndPlacement(t *testing.T) {
	source := "# A\n## A2\n### A3\n- A4\n  - A5\n# B\n## B2\n### B3\n- B4\n"
	fixture, _ := Parse([]byte(source), "matrix.mind.md")
	var labels []string
	for _, node := range fixture.Nodes {
		if node.Kind != "file" {
			labels = append(labels, node.Label)
		}
	}
	for _, from := range labels {
		for _, to := range labels {
			for _, placement := range []string{"before", "after", "child"} {
				doc, _ := Parse([]byte(source), "matrix.mind.md")
				node, target := moveNodeByLabel(t, doc, from), moveNodeByLabel(t, doc, to)
				containsTarget := false
				var visit func(*Node)
				visit = func(n *Node) {
					if n == target {
						containsTarget = true
					}
					for _, child := range n.Children {
						visit(child)
					}
				}
				visit(node)
				next, ids, _, err := doc.WithMovedNode(node.ID, target.ID, placement)
				if containsTarget {
					if err == nil {
						t.Fatalf("accepted cycle: %s %s %s", from, placement, to)
					}
					continue
				}
				if err != nil {
					t.Fatalf("valid move failed: %s %s %s: %v", from, placement, to, err)
				}
				if len(next.Nodes) != len(doc.Nodes) {
					t.Fatal("move changed node count")
				}
				for id, old := range doc.Nodes {
					if next.Nodes[ids[id]] == nil || next.Nodes[ids[id]].Label != old.Label {
						t.Fatalf("move lost %s", old.Label)
					}
				}
			}
		}
	}
}
