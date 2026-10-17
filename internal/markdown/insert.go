package markdown

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/yuin/goldmark/ast"
)

func (d *Document) WithChild(id string) (*Document, string, error) {
	return d.withInsertedNode(id, false)
}

func (d *Document) WithSibling(id string) (*Document, string, error) {
	return d.withInsertedNode(id, true)
}

func (d *Document) withInsertedNode(id string, sibling bool) (*Document, string, error) {
	parent := d.Nodes[id]
	if parent == nil || (parent.Kind != "file" && !parent.Editable) {
		return nil, "", fmt.Errorf("该节点暂不支持新增子节点，请在 Markdown 原文中编辑")
	}
	owner := parent
	insertIndex := len(parent.Children)
	if sibling {
		owner = nil
		for _, node := range d.Nodes {
			for i, child := range node.Children {
				if child.ID == id {
					owner = node
					insertIndex = i + 1
				}
			}
		}
		if owner == nil {
			return nil, "", fmt.Errorf("根节点不能新增同级节点")
		}
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
	lineStart := func(pos int) int {
		return bytes.LastIndexByte(d.Source[:pos], '\n') + 1
	}
	var startOf func(ast.Node) int
	startOf = func(n ast.Node) int {
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
	position, prefix := len(d.Source), "- "
	if d.mind {
		kind, level, indent := mindChildShape(parent.Kind, parent.Level, parent.indent)
		if sibling {
			kind, level, indent = parent.Kind, parent.Level, parent.indent
		}
		prefix = strings.Repeat(" ", indent) + "- "
		if kind == "heading" {
			prefix = strings.Repeat("#", level) + " "
		}
		position = parent.branchEnd
		if !sibling {
			position = d.mindChildPosition(parent)
		}
	} else {
		switch parent.Kind {
		case "heading":
			if parent.Level < 6 {
				prefix = strings.Repeat("#", parent.Level+1) + " "
			}
			if sibling {
				prefix = strings.Repeat("#", parent.Level) + " "
			}
			for block := tree.FirstChild(); block != nil; block = block.NextSibling() {
				if h, ok := block.(*ast.Heading); ok && h.Level <= parent.Level && startOf(h) > parent.Start {
					position = startOf(h)
					break
				}
			}
		case "list":
			var item ast.Node
			ast.Walk(tree, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
				if entering && n.Kind() == ast.KindListItem {
					first := listLabelBlock(n)
					if first.Lines().Len() > 0 && first.Lines().At(0).Start == parent.Start {
						item = n
						return ast.WalkStop, nil
					}
				}
				return ast.WalkContinue, nil
			})
			if item == nil {
				return nil, "", fmt.Errorf("无法定位列表节点")
			}
			for block := item; block != nil; block = block.Parent() {
				if sibling := block.NextSibling(); sibling != nil {
					position = startOf(sibling)
					if position < 0 {
						return nil, "", fmt.Errorf("无法安全定位插入位置，请在 Markdown 原文中编辑")
					}
					break
				}
			}
			indent := parent.Start - lineStart(parent.Start)
			if parent.Start > 0 && d.Source[parent.Start-1] != ' ' && d.Source[parent.Start-1] != '\t' {
				indent++
			}
			if len(parent.Children) > 0 && parent.Children[0].Start >= 0 {
				child := parent.Children[0]
				line := d.Source[lineStart(child.Start):child.Start]
				indent = len(line) - len(bytes.TrimLeft(line, " "))
			}
			if sibling {
				line := d.Source[lineStart(parent.Start):parent.Start]
				indent = len(line) - len(bytes.TrimLeft(line, " "))
				prefix = string(line)
				if !strings.HasSuffix(prefix, " ") && !strings.HasSuffix(prefix, "\t") {
					prefix += " "
				}
			} else {
				prefix = strings.Repeat(" ", indent) + "- "
			}
		case "file":
			for block := tree.FirstChild(); block != nil; block = block.NextSibling() {
				if block.Kind() == ast.KindHeading {
					prefix = "# "
					break
				}
			}
		default:
			return nil, "", fmt.Errorf("该节点暂不支持新增子节点")
		}
	}
	ending := "\n"
	if bytes.Contains(d.Source, []byte("\r\n")) {
		ending = "\r\n"
	}
	insert := ""
	if position > 0 && d.Source[position-1] != '\n' {
		insert += ending
	}
	if parent.Kind != "list" {
		insert += ending
	}
	label := "新节点"
	if d.mind {
		label = ""
	}
	insert += prefix + label + ending
	if parent.Kind != "list" {
		insert += ending
	}
	nextSource := append(bytes.Clone(d.Source[:position]), []byte(insert)...)
	nextSource = append(nextSource, d.Source[position:]...)
	next, err := d.reparse(nextSource)
	if err != nil {
		return nil, "", err
	}
	if len(next.Nodes) != len(d.Nodes)+1 {
		return nil, "", fmt.Errorf("新增会改变原文结构，请在 Markdown 原文中编辑")
	}
	oldByStart := map[int]*Node{}
	for _, n := range d.Nodes {
		start := n.Start
		if start >= position {
			start += len(insert)
		}
		oldByStart[start] = n
	}
	var created *Node
	remapped := map[string]*Node{}
	for _, n := range next.Nodes {
		if old := oldByStart[n.Start]; old != nil {
			if old.Kind != n.Kind || old.Label != n.Label {
				return nil, "", fmt.Errorf("新增会改变已有节点，请在 Markdown 原文中编辑")
			}
		} else {
			if created != nil {
				return nil, "", fmt.Errorf("无法确定新增节点")
			}
			created = n
		}
		if old := oldByStart[n.Start]; old != nil {
			remapped[old.ID] = n
		}
	}
	if created == nil || next.Root != remapped[d.Root.ID] {
		return nil, "", fmt.Errorf("无法确定新增节点的位置")
	}
	for id, old := range d.Nodes {
		n := remapped[id]
		expected := len(old.Children)
		if id == owner.ID {
			expected++
		}
		if n == nil || len(n.Children) != expected {
			return nil, "", fmt.Errorf("新增会改变已有层级，请在 Markdown 原文中编辑")
		}
		for i, child := range old.Children {
			index := i
			if id == owner.ID && i >= insertIndex {
				index++
			}
			if n.Children[index] != remapped[child.ID] {
				return nil, "", fmt.Errorf("新增会改变已有层级，请在 Markdown 原文中编辑")
			}
		}
	}
	children := remapped[owner.ID].Children
	if len(children) == 0 || children[insertIndex] != created {
		return nil, "", fmt.Errorf("新增节点未处于预期层级")
	}
	return next, created.ID, nil
}
