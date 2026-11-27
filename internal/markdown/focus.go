package markdown

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
)

var focusSuffixToken = regexp.MustCompile(`[ \t]*\[isFocus\]`)

func (d *Document) FocusedID() string {
	var first *Node
	if d.mind {
		for _, n := range d.Nodes {
			if n.focusMarks > 0 && (first == nil || n.Start < first.Start) {
				first = n
			}
		}
	}
	if first == nil {
		return ""
	}
	return first.ID
}

func (d *Document) WithFocus(id string, active bool) (*Document, error) {
	n := d.Nodes[id]
	if !d.mind || n == nil || !n.Editable {
		return nil, fmt.Errorf("仅思维导图节点支持聚焦")
	}
	if !active {
		id = ""
	}
	return d.NormalizeFocus(id), nil
}

func (d *Document) NormalizeFocus(id string) *Document {
	if !d.mind {
		return d
	}
	var changed []*Node
	for _, n := range d.Nodes {
		if (n.ID == id) != (n.focusMarks > 0) || n.focusMarks > 1 {
			changed = append(changed, n)
		}
	}
	if len(changed) == 0 {
		return d
	}
	sort.Slice(changed, func(i, j int) bool { return changed[i].Start < changed[j].Start })
	var out strings.Builder
	start := 0
	for _, n := range changed {
		out.Write(d.Source[start:n.Start])
		raw := string(d.Source[n.Start:n.End])
		plain, _, _, _ := mindLabelFlags(raw)
		out.WriteString(plain)
		out.WriteString(focusSuffixToken.ReplaceAllString(raw[len(plain):], ""))
		if n.ID == id {
			if n.Start != n.End || n.Start == 0 || (d.Source[n.Start-1] != ' ' && d.Source[n.Start-1] != '\t') {
				out.WriteByte(' ')
			}
			out.WriteString("[isFocus]")
			if n.End < len(d.Source) && d.Source[n.End] == '#' {
				out.WriteByte(' ')
			}
		}
		start = n.End
	}
	out.Write(d.Source[start:])
	return parseMind([]byte(out.String()), d.name)
}
