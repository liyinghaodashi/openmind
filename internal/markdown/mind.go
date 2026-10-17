package markdown

import (
	"bytes"
	"fmt"
	"path/filepath"
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
			closeLists(lineStart)
			for len(headings) > 0 && headings[len(headings)-1].Level >= level {
				headings[len(headings)-1].branchEnd = lineStart
				headings = headings[:len(headings)-1]
			}
			active = nil
			if level > 3 || level > 1 && (len(headings) == 0 || headings[len(headings)-1].Level != level-1) {
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
			continue
		}
		if line[leading] != '-' || !mindMarkerEnd(line, leading+1) {
			closeLists(lineStart)
			continue
		}
		for len(lists) > 0 && lists[len(lists)-1].indent >= indent {
			lists[len(lists)-1].branchEnd = lineStart
			lists = lists[:len(lists)-1]
		}
		if active == nil || active.Level != 3 || len(lists) == 0 && indent != 0 {
			continue
		}
		parent := active
		if len(lists) > 0 {
			parent = lists[len(lists)-1]
		}
		start, end := mindLabelSpan(line, leading+1, false)
		node := newNode("list", 0, base+start, base+end, lineStart, stop, indent)
		parent.Children = append(parent.Children, node)
		lists = append(lists, node)
	}
	return d
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
	if node.Kind == "heading" && node.Level == 3 {
		if len(node.Children) > 0 {
			return node.Children[len(node.Children)-1].branchEnd
		}
		return node.lineEnd
	}
	return node.branchEnd
}
