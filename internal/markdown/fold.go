package markdown

import (
	"fmt"
	"strings"
)

func mindLabelFold(raw string) (string, bool) {
	trimmed := strings.TrimRight(raw, " \t")
	if !strings.HasSuffix(trimmed, "[isFold]") {
		return raw, false
	}
	return strings.TrimRight(strings.TrimSuffix(trimmed, "[isFold]"), " \t"), true
}

func (d *Document) WithFold(id string, folded bool) (*Document, error) {
	n := d.Nodes[id]
	if !d.mind || n == nil || !n.Editable {
		return nil, fmt.Errorf("仅思维导图节点支持折叠文本")
	}
	if n.Fold == folded {
		return d, nil
	}
	raw, _ := mindLabelFold(string(d.Source[n.Start:n.End]))
	if folded {
		raw += " [isFold]"
	}
	source := string(d.Source[:n.Start]) + raw + string(d.Source[n.End:])
	if len(source) > MaxBytes {
		return nil, fmt.Errorf("文档超过 2MB")
	}
	next := &Document{Source: []byte(source), Nodes: map[string]*Node{}, name: d.name, mind: d.mind}
	delta := len(raw) - (n.End - n.Start)
	var clone func(*Node) *Node
	clone = func(old *Node) *Node {
		c := *old
		c.Children = make([]*Node, 0, len(old.Children))
		for _, position := range []*int{&c.lineStart, &c.lineEnd, &c.branchEnd} {
			if *position >= n.End {
				*position += delta
			}
		}
		if c.ID == id {
			c.End += delta
			c.Fold = folded
		} else if c.Start >= n.End && c.Start >= 0 {
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
