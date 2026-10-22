package markdown

import (
	"bytes"
	"fmt"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/yuin/goldmark/ast"
)

const MaxBytes = 2 * 1024 * 1024

type Node struct {
	ID        string  `json:"id"`
	Label     string  `json:"label"`
	Color     string  `json:"color,omitempty"`
	Kind      string  `json:"kind"`
	Level     int     `json:"level"`
	Editable  bool    `json:"editable"`
	Children  []*Node `json:"children"`
	Start     int     `json:"-"`
	End       int     `json:"-"`
	lineStart int
	lineEnd   int
	branchEnd int
	indent    int
}

type Document struct {
	Source []byte
	Root   *Node
	Nodes  map[string]*Node
	name   string
	mind   bool
}

func PreserveLineEndings(original []byte, input string) []byte {
	old := strings.Split(string(original), "\n")
	next := strings.Split(strings.ReplaceAll(input, "\r\n", "\n"), "\n")
	defaultEnding := "\n"
	if bytes.Contains(original, []byte("\r\n")) {
		defaultEnding = "\r\n"
	}
	ending := func(i int) string {
		if strings.HasSuffix(old[i], "\r") {
			return "\r\n"
		}
		return "\n"
	}
	prefix := 0
	for prefix < len(old) && prefix < len(next) && strings.TrimSuffix(old[prefix], "\r") == next[prefix] {
		prefix++
	}
	suffix := 0
	for suffix < len(old)-prefix && suffix < len(next)-prefix && strings.TrimSuffix(old[len(old)-1-suffix], "\r") == next[len(next)-1-suffix] {
		suffix++
	}
	var out strings.Builder
	for i, line := range next {
		out.WriteString(line)
		if i == len(next)-1 {
			break
		}
		switch {
		case i < prefix:
			out.WriteString(ending(i))
		case i >= len(next)-suffix:
			out.WriteString(ending(len(old) - (len(next) - i)))
		default:
			out.WriteString(defaultEnding)
		}
	}
	return []byte(out.String())
}

func Parse(source []byte, name string) (*Document, error) {
	if len(source) > MaxBytes {
		return nil, fmt.Errorf("v0.1 支持不超过 2MB 的 Markdown")
	}
	if !utf8.Valid(source) {
		return nil, fmt.Errorf("文件不是有效的 UTF-8，未进行转换")
	}
	if strings.HasSuffix(strings.ToLower(name), ".mind.md") {
		return parseMind(source, name), nil
	}
	d := &Document{Source: bytes.Clone(source), Nodes: map[string]*Node{}, name: name}
	label := strings.TrimSuffix(filepath.Base(name), filepath.Ext(name))
	if strings.HasSuffix(strings.ToLower(name), ".mind.md") {
		label = label[:len(label)-len(".mind")]
	}
	d.Root = &Node{ID: "root", Label: label, Kind: "file", Children: []*Node{}, Start: -1, End: -1}
	d.Nodes[d.Root.ID] = d.Root
	parseSource := bytes.Clone(source)
	if bytes.HasPrefix(parseSource, []byte{0xef, 0xbb, 0xbf}) {
		copy(parseSource[:3], "   ")
	}
	maskFrontMatter(parseSource)
	tree := parseTree(parseSource)
	first := tree.FirstChild()
	h1Count := 0
	for b := tree.FirstChild(); b != nil; b = b.NextSibling() {
		if h, ok := b.(*ast.Heading); ok && h.Level == 1 {
			h1Count++
		}
	}
	seq := 0
	newNode := func(b ast.Node, kind string, level int) *Node {
		seq++
		n := &Node{ID: fmt.Sprintf("n%d", seq), Kind: kind, Level: level, Children: []*Node{}, Start: -1, End: -1}
		if b.Lines().Len() > 0 {
			s := b.Lines().At(0)
			n.Start, n.End = s.Start, s.Stop
			for n.End > n.Start && (source[n.End-1] == '\n' || source[n.End-1] == '\r' || source[n.End-1] == ' ' || source[n.End-1] == '\t') {
				n.End--
			}
			n.Label = string(source[n.Start:n.End])
			n.Editable = b.Lines().Len() == 1 && s.Padding == 0
			if b.Lines().Len() > 1 {
				n.Label = strings.TrimSpace(string(b.Lines().Value(source)))
			}
		}
		if n.Start < 0 {
			n.Label = "空节点 · 可在原文中编辑"
		}
		d.Nodes[n.ID] = n
		return n
	}
	type headingEntry struct {
		level int
		node  *Node
	}
	stack := []headingEntry{{0, d.Root}}
	var list func(*ast.List, *Node)
	list = func(block *ast.List, parent *Node) {
		for item := block.FirstChild(); item != nil; item = item.NextSibling() {
			n := newNode(listLabelBlock(item), "list", 0)
			parent.Children = append(parent.Children, n)
			for c := item.FirstChild(); c != nil; c = c.NextSibling() {
				if nested, ok := c.(*ast.List); ok {
					list(nested, n)
				}
			}
		}
	}
	for b := tree.FirstChild(); b != nil; b = b.NextSibling() {
		switch v := b.(type) {
		case *ast.Heading:
			n := newNode(b, "heading", v.Level)
			if b == first && v.Level == 1 && h1Count == 1 {
				delete(d.Nodes, "root")
				d.Root = n
				stack = []headingEntry{{1, n}}
				continue
			}
			for len(stack) > 1 && stack[len(stack)-1].level >= v.Level {
				stack = stack[:len(stack)-1]
			}
			parent := stack[len(stack)-1].node
			parent.Children = append(parent.Children, n)
			stack = append(stack, headingEntry{v.Level, n})
		case *ast.List:
			list(v, stack[len(stack)-1].node)
		}
	}
	return d, nil
}

func maskFrontMatter(source []byte) {
	start := 0
	if bytes.HasPrefix(source, []byte("   ")) {
		start = 3
	}
	lines := bytes.SplitAfter(source[start:], []byte("\n"))
	if len(lines) < 2 || strings.TrimSpace(string(lines[0])) != "---" {
		return
	}
	end := start + len(lines[0])
	for _, line := range lines[1:] {
		end += len(line)
		if strings.TrimSpace(string(line)) == "---" || strings.TrimSpace(string(line)) == "..." {
			for i := start; i < end; i++ {
				if source[i] != '\n' && source[i] != '\r' {
					source[i] = ' '
				}
			}
			return
		}
	}
}

func (d *Document) WithLabel(id, label string) (*Document, error) {
	return d.withLabel(id, label, true)
}

func (d *Document) withLabel(id, label string, preserveColor bool) (*Document, error) {
	n, ok := d.Nodes[id]
	if !ok || !n.Editable {
		return nil, fmt.Errorf("该节点请在 Markdown 原文中编辑")
	}
	if strings.ContainsRune(label, '\x00') || !utf8.ValidString(label) {
		return nil, fmt.Errorf("节点文本必须是有效 UTF-8 文本且不能包含空字符")
	}
	if !d.mind && strings.ContainsAny(label, "\r\n") {
		return nil, fmt.Errorf("节点标题只接受单行 UTF-8 文本")
	}
	if len(label) > 32*1024 {
		return nil, fmt.Errorf("节点文本过长")
	}
	end := n.End
	multiline := d.mind && (strings.ContainsAny(label, "\r\n") || bytes.ContainsAny(d.Source[n.Start:n.End], "\r\n"))
	if multiline {
		label, end = d.mindLabelReplacement(n, label, preserveColor)
	} else if d.mind && preserveColor && n.Color != "" {
		if _, color := mindLabelColor(label); color == "" {
			metadata := string(d.Source[n.Start+len(n.Label) : n.End])
			if label == "" {
				metadata = strings.TrimLeft(metadata, " \t")
			} else if metadata[0] == '[' {
				metadata = " " + metadata
			}
			label += metadata
		}
	}
	prefix, suffix := "", ""
	if (n.Start == n.End || multiline) && label != "" {
		if n.Start > 0 && d.Source[n.Start-1] != ' ' && d.Source[n.Start-1] != '\t' {
			prefix = " "
		}
		if !multiline && n.Kind == "heading" && n.End < len(d.Source) && d.Source[n.End] == '#' {
			suffix = " "
		}
	}
	replacement := prefix + label + suffix
	if len(d.Source)-end+n.Start+len(replacement) > MaxBytes {
		return nil, fmt.Errorf("文档超过 2MB")
	}
	newSource := make([]byte, 0, len(d.Source)+len(replacement)-(end-n.Start))
	newSource = append(newSource, d.Source[:n.Start]...)
	newSource = append(newSource, []byte(replacement)...)
	newSource = append(newSource, d.Source[end:]...)
	next := &Document{Source: newSource, Nodes: map[string]*Node{}, name: d.name, mind: d.mind}
	delta := len(replacement) - (end - n.Start)
	var clone func(*Node) *Node
	clone = func(old *Node) *Node {
		c := *old
		c.Children = make([]*Node, 0, len(old.Children))
		if d.mind {
			for _, position := range []*int{&c.lineStart, &c.lineEnd, &c.branchEnd} {
				if *position >= end {
					*position += delta
				}
			}
		}
		if c.ID == id {
			c.Label = label
			c.Start += len(prefix)
			c.End = c.Start + len(label)
			if d.mind {
				if multiline {
					c.Label, c.Color = mindMultilineLabel(label, n.Kind == "heading")
					if !strings.ContainsAny(label, "\r\n") {
						_, headerEnd := mindLabelSpan([]byte(label), 0, n.Kind == "heading")
						c.End = c.Start + headerEnd
					}
				} else {
					c.Label, c.Color = mindLabelColor(label)
				}
			}
		} else if c.Start >= end && c.Start >= 0 {
			c.Start += delta
			c.End += delta
		}
		next.Nodes[c.ID] = &c
		for _, child := range old.Children {
			c.Children = append(c.Children, clone(child))
		}
		return &c
	}
	next.Root = clone(d.Root)
	return next, nil
}
