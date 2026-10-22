package markdown

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/yuin/goldmark/ast"
)

type moveRange struct{ start, end int }

func (d *Document) WithMovedNode(id, targetID, placement string) (*Document, map[string]string, string, error) {
	node, target := d.Nodes[id], d.Nodes[targetID]
	if node == nil || target == nil || node == d.Root || node.Start < 0 {
		return nil, nil, "", fmt.Errorf("根节点或无法定位的节点不能移动")
	}
	if placement != "before" && placement != "after" && placement != "child" {
		return nil, nil, "", fmt.Errorf("无效的节点放置方式")
	}
	parents := map[string]*Node{}
	var visit func(*Node)
	visit = func(n *Node) {
		for _, child := range n.Children {
			parents[child.ID] = n
			visit(child)
		}
	}
	visit(d.Root)
	for n := target; n != nil; n = parents[n.ID] {
		if n == node {
			return nil, nil, "", fmt.Errorf("不能移动到自己或自己的后代节点")
		}
	}
	owner := target
	if placement != "child" {
		owner = parents[target.ID]
		if owner == nil {
			return nil, nil, "", fmt.Errorf("根节点不能放置同级节点")
		}
	}
	ranges, err := d.moveRanges()
	if err != nil {
		return nil, nil, "", err
	}
	r, located := ranges[id]
	_, targetLocated := ranges[targetID]
	if !located || !targetLocated {
		return nil, nil, "", fmt.Errorf("无法安全定位节点，请在 Markdown 原文中编辑")
	}
	position := ranges[targetID].start
	if placement == "after" || placement == "child" {
		position = ranges[targetID].end
	}
	if target.Kind == "file" {
		position = len(d.Source)
	}
	if d.mind && placement == "child" {
		position = d.mindChildPosition(target)
	}
	peers := parents[id].Children
	for i, peer := range peers {
		unchanged := placement == "child" && owner == parents[id] && i == len(peers)-1
		unchanged = unchanged || placement == "before" && i+1 < len(peers) && peers[i+1] == target
		unchanged = unchanged || placement == "after" && i > 0 && peers[i-1] == target
		if peer == node && unchanged {
			ids := map[string]string{}
			for oldID := range d.Nodes {
				ids[oldID] = oldID
			}
			return d, ids, id, nil
		}
	}
	if position > r.start && position < r.end {
		return nil, nil, "", fmt.Errorf("不能将节点放入自己的分支")
	}
	kind, level, indent := node.Kind, node.Level, 0
	if d.mind {
		if placement == "child" {
			kind, level, indent = mindChildShape(owner.Kind, owner.Level, d.listIndent(owner))
		} else {
			kind, level = target.Kind, target.Level
			if kind == "list" {
				indent = d.listIndent(target)
			}
		}
	} else if placement != "child" {
		kind, level = target.Kind, target.Level
		if kind == "list" {
			indent = d.listIndent(target)
		}
	} else if owner.Kind == "list" {
		kind, level = "list", 0
		indent = owner.Start - d.moveLineStart(owner.Start)
		if len(owner.Children) > 0 {
			indent = d.listIndent(owner.Children[0])
		}
	} else if owner.Kind == "file" {
		for _, child := range owner.Children {
			if child.Kind == "heading" {
				kind, level = "heading", 1
				break
			}
		}
	} else if node.Kind == "heading" {
		level = 1
		if owner.Kind == "heading" {
			level = owner.Level + 1
		}
	} else if owner.Kind == "heading" {
		for _, child := range owner.Children {
			if child.Kind == "heading" {
				kind, level = "heading", owner.Level+1
				break
			}
		}
	}
	if level > 6 {
		kind, level = "list", 0
	}
	part, offsets, err := d.moveBranch(node, kind, level, indent, ranges)
	if err != nil {
		return nil, nil, "", err
	}
	remaining := append(bytes.Clone(d.Source[:r.start]), d.Source[r.end:]...)
	if position >= r.end {
		position -= r.end - r.start
	}
	ending := []byte("\n")
	if bytes.Contains(d.Source, []byte("\r\n")) {
		ending = []byte("\r\n")
	}
	var prefix, suffix []byte
	if position > 0 && remaining[position-1] != '\n' {
		prefix = append(prefix, ending...)
	}
	if kind == "heading" && position > 0 && !bytes.HasSuffix(remaining[:position], append(bytes.Clone(ending), ending...)) {
		prefix = append(prefix, ending...)
	}
	if kind == "list" && node.Kind == "list" && indent > 0 {
		marker := bytes.TrimSpace(d.Source[r.start+d.listIndent(node) : node.Start])
		if len(marker) > 1 && marker[0] >= '0' && marker[0] <= '9' && !bytes.HasSuffix(remaining[:position], append(bytes.Clone(ending), ending...)) {
			prefix = append(prefix, ending...)
		}
	}
	if len(part) > 0 && part[len(part)-1] != '\n' && position < len(remaining) {
		suffix = append(suffix, ending...)
	}
	if position < len(remaining) && (kind == "heading" || target.Kind == "heading") && !bytes.HasSuffix(part, append(bytes.Clone(ending), ending...)) {
		suffix = append(suffix, ending...)
	}
	result := append(bytes.Clone(remaining[:position]), prefix...)
	result = append(result, part...)
	result = append(result, suffix...)
	result = append(result, remaining[position:]...)
	next, err := d.reparse(result)
	if err != nil {
		return nil, nil, "", err
	}
	byStart := map[int]*Node{}
	for _, n := range next.Nodes {
		byStart[n.Start] = n
	}
	ids := map[string]string{}
	for oldID, old := range d.Nodes {
		pos := old.Start
		if offset, moved := offsets[oldID]; moved {
			pos = position + len(prefix) + offset
		} else if pos >= 0 {
			if pos >= r.end {
				pos -= r.end - r.start
			}
			if pos >= position {
				pos += len(prefix) + len(part) + len(suffix)
			}
		}
		n := byStart[pos]
		if n == nil || n.Label != old.Label {
			return nil, nil, "", fmt.Errorf("移动会改变节点内容，请在 Markdown 原文中编辑")
		}
		if _, moved := offsets[oldID]; !moved && (n.Kind != old.Kind || n.Level != old.Level) {
			return nil, nil, "", fmt.Errorf("移动会改变其他节点，请在 Markdown 原文中编辑")
		}
		ids[oldID] = n.ID
	}
	if len(next.Nodes) != len(d.Nodes) || next.Root.ID != ids[d.Root.ID] {
		return nil, nil, "", fmt.Errorf("移动会改变根节点或其他内容，请在 Markdown 原文中编辑")
	}
	for oldID, old := range d.Nodes {
		expected := []*Node{}
		for _, child := range old.Children {
			if child != node {
				expected = append(expected, child)
			}
		}
		if old == owner {
			index := len(expected)
			if placement != "child" {
				for i, child := range expected {
					if child == target {
						index = i
						if placement == "after" {
							index++
						}
						break
					}
				}
			}
			expected = append(expected, nil)
			copy(expected[index+1:], expected[index:])
			expected[index] = node
		}
		actual := next.Nodes[ids[oldID]].Children
		if len(actual) != len(expected) {
			return nil, nil, "", fmt.Errorf("移动会改变其他层级，请在 Markdown 原文中编辑")
		}
		for i, child := range expected {
			if actual[i].ID != ids[child.ID] {
				return nil, nil, "", fmt.Errorf("移动未处于预期位置，请在 Markdown 原文中编辑")
			}
		}
	}
	return next, ids, ids[id], nil
}

func (d *Document) moveLineStart(pos int) int {
	start := bytes.LastIndexByte(d.Source[:pos], '\n') + 1
	if start == 0 && bytes.HasPrefix(d.Source, []byte{0xef, 0xbb, 0xbf}) {
		return 3
	}
	return start
}

func (d *Document) listIndent(n *Node) int {
	if d.mind {
		return n.indent
	}
	line := d.Source[d.moveLineStart(n.Start):n.Start]
	return len(line) - len(bytes.TrimLeft(line, " "))
}

func (d *Document) moveRanges() (map[string]moveRange, error) {
	if d.mind {
		return d.mindRanges(), nil
	}
	source := bytes.Clone(d.Source)
	if bytes.HasPrefix(source, []byte{0xef, 0xbb, 0xbf}) {
		copy(source[:3], "   ")
	}
	maskFrontMatter(source)
	tree := parseTree(source)
	var startOf func(ast.Node) int
	startOf = func(n ast.Node) int {
		if fence, ok := n.(*ast.FencedCodeBlock); ok {
			if fence.Info != nil {
				return d.moveLineStart(fence.Info.Segment.Start)
			}
			if fence.Lines().Len() > 0 {
				first := d.moveLineStart(fence.Lines().At(0).Start)
				if first > 0 {
					return d.moveLineStart(first - 1)
				}
			}
			return -1
		}
		if n.Lines().Len() > 0 {
			return d.moveLineStart(n.Lines().At(0).Start)
		}
		for c := n.FirstChild(); c != nil; c = c.NextSibling() {
			if pos := startOf(c); pos >= 0 {
				return pos
			}
		}
		return -1
	}
	items := map[int]ast.Node{}
	ast.Walk(tree, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if entering && n.Kind() == ast.KindListItem {
			first := listLabelBlock(n)
			if first.Lines().Len() > 0 {
				items[first.Lines().At(0).Start] = n
			}
		}
		return ast.WalkContinue, nil
	})
	ranges := map[string]moveRange{}
	for id, n := range d.Nodes {
		if n.Kind == "file" {
			ranges[id] = moveRange{0, len(source)}
			continue
		}
		if n.Start < 0 {
			continue
		}
		r := moveRange{d.moveLineStart(n.Start), len(source)}
		if n.Kind == "heading" {
			for b := tree.FirstChild(); b != nil; b = b.NextSibling() {
				if h, ok := b.(*ast.Heading); ok && h.Level <= n.Level && startOf(h) > n.Start {
					r.end = startOf(h)
					break
				}
			}
		} else {
			item := items[n.Start]
			if item == nil {
				continue
			}
			for b := item; b != nil; b = b.Parent() {
				if sibling := b.NextSibling(); sibling != nil {
					r.end = startOf(sibling)
					break
				}
			}
		}
		if r.end < r.start {
			return nil, fmt.Errorf("无法安全定位分支边界，请在 Markdown 原文中编辑")
		}
		ranges[id] = r
	}
	return ranges, nil
}

func (d *Document) moveBranch(n *Node, kind string, level, indent int, ranges map[string]moveRange) ([]byte, map[string]int, error) {
	r, ok := ranges[n.ID]
	if !ok || (kind != "heading" && kind != "list") || (kind == "heading" && (level < 1 || level > 6)) {
		return nil, nil, fmt.Errorf("该层级无法用 Markdown 安全表示，请在原文中编辑")
	}
	if bytes.Contains(d.Source[r.start:n.Start], []byte("\t")) {
		return nil, nil, fmt.Errorf("含 Tab 缩进的分支请在 Markdown 原文中移动")
	}
	lineEnd := n.End
	if pos := bytes.IndexByte(d.Source[n.Start:], '\n'); pos >= 0 {
		lineEnd = n.Start + pos + 1
	} else {
		lineEnd = len(d.Source)
	}
	if d.mind {
		lineEnd = n.lineEnd
	}
	if !n.Editable && (kind != n.Kind || level != n.Level || kind == "list" && indent != d.listIndent(n)) {
		return nil, nil, fmt.Errorf("复杂节点改变层级请在 Markdown 原文中编辑")
	}
	ending := []byte{}
	if d.Source[lineEnd-1] == '\n' {
		ending = []byte("\n")
		if lineEnd > 1 && d.Source[lineEnd-2] == '\r' {
			ending = []byte("\r\n")
		}
	}
	var out []byte
	labelOffset := n.Start - r.start
	oldBodyIndent, newBodyIndent := 0, 0
	if n.Kind == "list" {
		oldBodyIndent = n.Start - r.start
	}
	if kind == n.Kind && (kind == "heading" && level == n.Level || kind == "list" && indent == d.listIndent(n)) {
		out = bytes.Clone(d.Source[r.start:lineEnd])
	} else {
		prefix := strings.Repeat("#", level) + " "
		if kind == "list" {
			marker := "- "
			if n.Kind == "list" && !d.mind {
				marker = string(d.Source[r.start+d.listIndent(n) : n.Start])
			}
			prefix = strings.Repeat(" ", indent) + marker
		}
		out = append([]byte(prefix), d.Source[n.Start:n.End]...)
		out = append(out, ending...)
		labelOffset = len(prefix)
		if n.Kind == "heading" && !bytes.HasPrefix(bytes.TrimLeft(d.Source[r.start:n.Start], " "), []byte("#")) {
			if pos := bytes.IndexByte(d.Source[lineEnd:], '\n'); pos >= 0 {
				lineEnd += pos + 1
			} else {
				lineEnd = len(d.Source)
			}
		}
	}
	if kind == "list" {
		newBodyIndent = labelOffset
	}
	ids := map[string]int{n.ID: labelOffset}
	cursor := lineEnd
	for _, child := range n.Children {
		cr, exists := ranges[child.ID]
		if !exists || cr.start < cursor || cr.end > r.end {
			return nil, nil, fmt.Errorf("无法安全定位子分支，请在 Markdown 原文中编辑")
		}
		body, err := moveIndent(d.Source[cursor:cr.start], newBodyIndent-oldBodyIndent)
		if err != nil {
			return nil, nil, err
		}
		if kind == "list" && n.Kind == "heading" && len(bytes.TrimSpace(body)) > 0 && len(body) > 0 && body[0] != '\n' && body[0] != '\r' {
			out = append(out, ending...)
		}
		out = append(out, body...)
		childKind, childLevel, childIndent := child.Kind, child.Level, 0
		if d.mind {
			childKind, childLevel, childIndent = mindChildShape(kind, level, indent)
			if kind == "list" && n.Kind == "list" {
				childIndent = d.listIndent(child) + indent - d.listIndent(n)
			}
		} else if kind == "list" {
			childKind, childLevel = "list", 0
			childIndent = newBodyIndent
			if n.Kind == "list" {
				childIndent = d.listIndent(child) + indent - d.listIndent(n)
			}
		} else if n.Kind == "list" {
			childKind, childLevel = "heading", level+1
		} else if child.Kind == "heading" {
			childLevel += level - n.Level
		}
		part, offsets, err := d.moveBranch(child, childKind, childLevel, childIndent, ranges)
		if err != nil {
			return nil, nil, err
		}
		for id, offset := range offsets {
			ids[id] = len(out) + offset
		}
		out = append(out, part...)
		cursor = cr.end
	}
	body, err := moveIndent(d.Source[cursor:r.end], newBodyIndent-oldBodyIndent)
	if err != nil {
		return nil, nil, err
	}
	if kind == "list" && n.Kind == "heading" && len(bytes.TrimSpace(body)) > 0 && len(body) > 0 && body[0] != '\n' && body[0] != '\r' {
		out = append(out, ending...)
	}
	return append(out, body...), ids, nil
}

func moveIndent(source []byte, delta int) ([]byte, error) {
	if delta == 0 {
		return bytes.Clone(source), nil
	}
	var out []byte
	for _, line := range bytes.SplitAfter(source, []byte("\n")) {
		if len(bytes.TrimSpace(line)) == 0 {
			out = append(out, line...)
			continue
		}
		if delta > 0 {
			out = append(out, bytes.Repeat([]byte(" "), delta)...)
		} else {
			if len(line)-len(bytes.TrimLeft(line, " ")) < -delta {
				return nil, fmt.Errorf("分支正文的缩进无法安全调整，请在 Markdown 原文中编辑")
			}
			line = line[-delta:]
		}
		out = append(out, line...)
	}
	return out, nil
}
