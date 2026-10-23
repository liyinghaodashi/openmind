package markdown

import (
	"bytes"
	"fmt"
	"path/filepath"
	"strings"
)

func parseMind(source []byte, name string) *Document {
	d := &Document{Source: bytes.Clone(source), Nodes: map[string]*Node{}, name: name, mind: true}
	label := filepath.Base(name)
	label = label[:len(label)-len(".mind.md")]
	d.Root = &Node{ID: "root", Label: label, Kind: "file", Start: -1, End: -1, Children: []*Node{}, branchEnd: len(source)}
	d.Nodes[d.Root.ID] = d.Root
	masked := bytes.Clone(source)
	if bytes.HasPrefix(masked, []byte{0xef, 0xbb, 0xbf}) {
		copy(masked[:3], "   ")
	}
	maskFrontMatter(masked)
	var headings, lists []*Node
	var active *Node
	var current *Node
	closeLists := func(position int) {
		for _, node := range lists {
			node.branchEnd = position
		}
		lists = nil
	}
	newNode := func(kind string, level, start, end, lineStart, lineEnd, indent int) *Node {
		node := &Node{ID: fmt.Sprintf("n%d", len(d.Nodes)), Label: string(source[start:end]), Kind: kind, Level: level, Editable: true, Start: start, End: end, Children: []*Node{}, lineStart: lineStart, lineEnd: lineEnd, branchEnd: len(source), indent: indent}
		d.Nodes[node.ID] = node
		node.Label, node.Color = mindLabelColor(node.Label)
		return node
	}
	var fence byte
	fenceLength := 0
	comment := false
	for offset := 0; offset < len(masked); {
		base := offset
		stop := len(masked)
		if end := bytes.IndexByte(masked[offset:], '\n'); end >= 0 {
			stop = offset + end + 1
		}
		line := bytes.TrimRight(masked[offset:stop], "\r\n")
		trimmed := bytes.TrimSpace(line)
		lineStart := offset
		if offset == 0 && bytes.HasPrefix(source, []byte{0xef, 0xbb, 0xbf}) {
			lineStart = 3
		}
		offset = stop
		if fence != 0 {
			count := 0
			for count < len(trimmed) && trimmed[count] == fence {
				count++
			}
			if count >= fenceLength && len(bytes.TrimSpace(trimmed[count:])) == 0 {
				fence = 0
			}
			continue
		}
		if comment {
			comment = !bytes.Contains(line, []byte("-->"))
			continue
		}
		if bytes.HasPrefix(trimmed, []byte("<!--")) {
			current = nil
			closeLists(lineStart)
			comment = !bytes.Contains(trimmed, []byte("-->"))
			continue
		}
		if len(trimmed) >= 3 && (trimmed[0] == '`' || trimmed[0] == '~') {
			count := 0
			for count < len(trimmed) && trimmed[count] == trimmed[0] {
				count++
			}
			if count >= 3 {
				current = nil
				closeLists(lineStart)
				fence, fenceLength = trimmed[0], count
				continue
			}
		}
		if len(trimmed) == 0 {
			continue
		}
		leading, indent := 0, 0
		for leading < len(line) && (line[leading] == ' ' || line[leading] == '\t') {
			if line[leading] == '\t' {
				indent += 4 - indent%4
			} else {
				indent++
			}
			leading++
		}
		level := 0
		for leading+level < len(line) && line[leading+level] == '#' {
			level++
		}
		if indent <= 3 && level > 0 && mindMarkerEnd(line, leading+level) {
			current = nil
			closeLists(lineStart)
			for len(headings) > 0 && headings[len(headings)-1].Level >= level {
				headings[len(headings)-1].branchEnd = lineStart
				headings = headings[:len(headings)-1]
			}
			active = nil
			if level > 6 {
				continue
			}
			start, end := mindLabelSpan(line, leading+level, true)
			node := newNode("heading", level, base+start, base+end, lineStart, stop, 0)
			parent := d.Root
			if len(headings) > 0 {
				parent = headings[len(headings)-1]
			}
			parent.Children = append(parent.Children, node)
			headings = append(headings, node)
			active = node
			current = node
			continue
		}
		if line[leading] != '-' || !mindMarkerEnd(line, leading+1) {
			if current != nil {
				current.End = base + len(bytes.TrimRight(line, " \t"))
				current.lineEnd = stop
			}
			continue
		}
		current = nil
		for len(lists) > 0 && lists[len(lists)-1].indent >= indent {
			lists[len(lists)-1].branchEnd = lineStart
			lists = lists[:len(lists)-1]
		}
		parent := d.Root
		if active != nil {
			parent = active
		}
		if len(lists) > 0 {
			parent = lists[len(lists)-1]
		}
		start, end := mindLabelSpan(line, leading+1, false)
		node := newNode("list", 0, base+start, base+end, lineStart, stop, indent)
		parent.Children = append(parent.Children, node)
		lists = append(lists, node)
		current = node
	}
	for _, node := range d.Nodes {
		if node.Kind == "file" {
			continue
		}
		raw := string(source[node.Start:node.End])
		raw, node.Fold = mindLabelFold(raw)
		node.Label, node.Color = mindMultilineLabel(raw, node.Kind == "heading")
	}
	return d
}

func mindMultilineLabel(raw string, heading bool) (string, string) {
	first, rest, multiline := strings.Cut(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")
	_, end := mindLabelSpan([]byte(first), 0, heading)
	label, color := mindLabelColor(first[:end])
	if multiline {
		label += "\n" + rest
	}
	return label, color
}

func (d *Document) mindLabelReplacement(n *Node, label string, preserveColor bool) (string, int) {
	label = strings.ReplaceAll(strings.ReplaceAll(label, "\r\n", "\n"), "\r", "\n")
	first, rest, multiline := strings.Cut(label, "\n")
	lineEnd := n.Start
	for lineEnd < len(d.Source) && d.Source[lineEnd] != '\r' && d.Source[lineEnd] != '\n' {
		lineEnd++
	}
	oldFirst := d.Source[n.Start:lineEnd]
	_, headerEnd := mindLabelSpan(oldFirst, 0, n.Kind == "heading")
	if preserveColor && n.Color != "" {
		if _, color := mindLabelColor(first); color == "" {
			oldLabel, _ := mindLabelColor(string(oldFirst[:headerEnd]))
			metadata := string(oldFirst[len(oldLabel):headerEnd])
			if first == "" {
				metadata = strings.TrimLeft(metadata, " \t")
			} else if strings.HasPrefix(metadata, "[") {
				metadata = " " + metadata
			}
			first += metadata
		}
	}
	end := n.End
	if multiline || n.End > lineEnd {
		suffix := string(oldFirst[headerEnd:])
		if first != "" && strings.HasPrefix(suffix, "#") {
			suffix = " " + suffix
		}
		first += suffix
		end = max(end, lineEnd)
	}
	if multiline {
		ending := "\n"
		if bytes.Contains(d.Source, []byte("\r\n")) {
			ending = "\r\n"
		}
		first += ending + strings.ReplaceAll(rest, "\n", ending)
	}
	return first, end
}

func mindMarkerEnd(line []byte, end int) bool {
	return end == len(line) || line[end] == ' ' || line[end] == '\t'
}

func mindLabelSpan(line []byte, start int, heading bool) (int, int) {
	for start < len(line) && (line[start] == ' ' || line[start] == '\t') {
		start++
	}
	end := len(bytes.TrimRight(line, " \t"))
	if heading {
		closing := end
		for closing > start && line[closing-1] == '#' {
			closing--
		}
		if closing < end && (closing == start || line[closing-1] == ' ' || line[closing-1] == '\t') {
			end = len(bytes.TrimRight(line[:closing], " \t"))
		}
	}
	return start, max(start, end)
}

func (d *Document) reparse(source []byte) (*Document, error) {
	return Parse(source, d.name)
}

func (d *Document) mindRanges() map[string]moveRange {
	ranges := map[string]moveRange{d.Root.ID: {0, len(d.Source)}}
	for id, node := range d.Nodes {
		if node.Kind != "file" {
			ranges[id] = moveRange{node.lineStart, node.branchEnd}
		}
	}
	return ranges
}

func mindChildShape(kind string, level, indent int) (string, int, int) {
	if kind == "file" {
		return "heading", 1, 0
	}
	if kind == "heading" && level < 3 {
		return "heading", level + 1, 0
	}
	if kind == "list" {
		return "list", 0, indent + 2
	}
	return "list", 0, 0
}

func (d *Document) mindChildPosition(node *Node) int {
	if node.Kind == "heading" && node.Level >= 3 {
		for _, child := range node.Children {
			if child.Kind == "heading" {
				return child.lineStart
			}
		}
		if len(node.Children) > 0 {
			return node.Children[len(node.Children)-1].branchEnd
		}
		return node.lineEnd
	}
	return node.branchEnd
}
