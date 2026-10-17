package markdown

import (
	"bytes"
	"fmt"

	"github.com/yuin/goldmark/ast"
)

func (d *Document) WithoutNode(id string) (*Document, map[string]string, string, error) {
	node := d.Nodes[id]
	if node == nil || node == d.Root || node.Start < 0 {
		return nil, nil, "", fmt.Errorf("根节点或无法定位的节点不能删除")
	}
	source := bytes.Clone(d.Source)
	if bytes.HasPrefix(source, []byte{0xef, 0xbb, 0xbf}) {
		copy(source[:3], "   ")
	}
	maskFrontMatter(source)
	var tree ast.Node
	if !d.mind {
		tree = parseTree(source)
	}
	lineStart := func(pos int) int { return bytes.LastIndexByte(d.Source[:pos], '\n') + 1 }
	var startOf func(ast.Node) int
	startOf = func(n ast.Node) int {
		if fence, ok := n.(*ast.FencedCodeBlock); ok {
			if fence.Info != nil {
				return lineStart(fence.Info.Segment.Start)
			}
			if fence.Lines().Len() > 0 {
				first := lineStart(fence.Lines().At(0).Start)
				if first > 0 {
					return lineStart(first - 1)
				}
			}
			return -1
		}
		if n.Lines().Len() > 0 {
			return lineStart(n.Lines().At(0).Start)
		}
		for child := n.FirstChild(); child != nil; child = child.NextSibling() {
			if pos := startOf(child); pos >= 0 {
				return pos
			}
		}
		return -1
	}
	start, end := lineStart(node.Start), len(d.Source)
	if start == 0 && bytes.HasPrefix(d.Source, []byte{0xef, 0xbb, 0xbf}) {
		start = 3
	}
	if d.mind {
		start, end = node.lineStart, node.branchEnd
	} else if node.Kind == "heading" {
		for block := tree.FirstChild(); block != nil; block = block.NextSibling() {
			if h, ok := block.(*ast.Heading); ok && h.Level <= node.Level && startOf(h) > node.Start {
				end = startOf(h)
				break
			}
		}
	} else if node.Kind == "list" {
		var item ast.Node
		ast.Walk(tree, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
			if entering && n.Kind() == ast.KindListItem {
				first := listLabelBlock(n)
				if first.Lines().Len() > 0 && first.Lines().At(0).Start == node.Start {
					item = n
					return ast.WalkStop, nil
				}
			}
			return ast.WalkContinue, nil
		})
		if item == nil {
			return nil, nil, "", fmt.Errorf("无法安全定位列表节点")
		}
		for block := item; block != nil; block = block.Parent() {
			if sibling := block.NextSibling(); sibling != nil {
				end = startOf(sibling)
				break
			}
		}
	} else {
		return nil, nil, "", fmt.Errorf("该节点请在 Markdown 原文中删除")
	}
	if end < start {
		return nil, nil, "", fmt.Errorf("无法安全定位删除范围")
	}
	next, err := d.reparse(append(bytes.Clone(d.Source[:start]), d.Source[end:]...))
	if err != nil {
		return nil, nil, "", err
	}
	removed := map[string]bool{}
	var remove func(*Node)
	remove = func(n *Node) {
		removed[n.ID] = true
		for _, child := range n.Children {
			remove(child)
		}
	}
	remove(node)
	byStart := map[int]*Node{}
	for _, n := range next.Nodes {
		byStart[n.Start] = n
	}
	ids := map[string]string{}
	parentID := ""
	for oldID, old := range d.Nodes {
		for _, child := range old.Children {
			if child.ID == id {
				parentID = oldID
			}
		}
		if removed[oldID] {
			continue
		}
		pos := old.Start
		if pos >= end {
			pos -= end - start
		}
		n := byStart[pos]
		if old.Kind == "file" && next.Root.Kind != "file" {
			n = next.Root
		} else if n == nil || n.Label != old.Label || n.Kind != old.Kind {
			return nil, nil, "", fmt.Errorf("删除会改变其他节点，请在 Markdown 原文中编辑")
		}
		ids[oldID] = n.ID
	}
	expected := len(d.Nodes) - len(removed)
	if d.Root.Kind == "file" && next.Root.Kind != "file" {
		expected--
	}
	if len(next.Nodes) != expected {
		return nil, nil, "", fmt.Errorf("删除会改变其他节点，请在 Markdown 原文中编辑")
	}
	for oldID, old := range d.Nodes {
		if removed[oldID] || (old.Kind == "file" && next.Root.Kind != "file") {
			continue
		}
		var children []string
		for _, child := range old.Children {
			if !removed[child.ID] {
				children = append(children, ids[child.ID])
			}
		}
		n := next.Nodes[ids[oldID]]
		if len(n.Children) != len(children) {
			return nil, nil, "", fmt.Errorf("删除会改变其他层级，请在 Markdown 原文中编辑")
		}
		for i, child := range n.Children {
			if child.ID != children[i] {
				return nil, nil, "", fmt.Errorf("删除会改变其他层级，请在 Markdown 原文中编辑")
			}
		}
	}
	focus := ids[parentID]
	if d.mind && parentID == d.Root.ID {
		focus = ""
		if len(next.Root.Children) > 0 {
			focus = next.Root.Children[0].ID
		}
	}
	return next, ids, focus, nil
}
