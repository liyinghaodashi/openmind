package markdown

import (
	"fmt"
	"strings"
)

func mindLabelFlags(raw string) (string, bool, bool, int) {
	fold, foldKid := false, false
	focus := 0
	for {
		trimmed := strings.TrimRight(raw, " \t")
		switch {
		case strings.HasSuffix(trimmed, "[isFold]"):
			raw = strings.TrimRight(strings.TrimSuffix(trimmed, "[isFold]"), " \t")
			fold = true
		case strings.HasSuffix(trimmed, "[isFoldKid]"):
			raw = strings.TrimRight(strings.TrimSuffix(trimmed, "[isFoldKid]"), " \t")
			foldKid = true
		case strings.HasSuffix(trimmed, "[isFocus]"):
			raw = strings.TrimRight(strings.TrimSuffix(trimmed, "[isFocus]"), " \t")
			focus++
		default:
			return raw, fold, foldKid, focus
		}
	}
}

func (d *Document) WithFold(id string, folded bool) (*Document, error) {
	return d.withFold(id, folded, false)
}

func (d *Document) WithFoldKid(id string, folded bool) (*Document, error) {
	return d.withFold(id, folded, true)
}

func (d *Document) withFold(id string, folded, children bool) (*Document, error) {
	n := d.Nodes[id]
	if !d.mind || n == nil || !n.Editable {
		return nil, fmt.Errorf("仅思维导图节点支持折叠")
	}
	fold, foldKid := n.Fold, n.FoldKid
	if children {
		foldKid = folded
	} else {
		fold = folded
	}
	if n.Fold == fold && n.FoldKid == foldKid {
		return d, nil
	}

	return d.withNodeFlags(n, fold, foldKid, n.focusMarks), nil
}

func renderNodeFlags(raw string, fold, foldKid bool, focus int) string {
	raw, _, _, _ = mindLabelFlags(raw)
	if fold {
		raw += " [isFold]"
	}
	if foldKid {
		raw += " [isFoldKid]"
	}
	if focus > 0 {
		raw += " [isFocus]"
	}
	return raw
}

func (d *Document) withNodeFlags(n *Node, fold, foldKid bool, focus int) *Document {
	raw := renderNodeFlags(string(d.Source[n.Start:n.End]), fold, foldKid, focus)
	source := string(d.Source[:n.Start]) + raw + string(d.Source[n.End:])
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
		if c.ID == n.ID {
			c.End += delta
			c.focusMarks = min(focus, 1)
			c.Fold = fold
			c.FoldKid = foldKid
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
	return next
}
