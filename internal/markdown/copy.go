package markdown

import (
	"fmt"
	"sort"
	"strings"
)

func (d *Document) BranchMarkdown(id string, label *string) (string, error) {
	node := d.Nodes[id]
	if node == nil {
		return "", fmt.Errorf("节点已变化，请重新选择后复制")
	}
	start, end := 0, len(d.Source)
	if node != d.Root {
		boundaries := d
		if label != nil && node.Editable {
			var err error
			boundaries, err = d.WithLabel(id, "x")
			if err != nil {
				return "", err
			}
		}
		ranges, err := boundaries.moveRanges()
		if err != nil {
			return "", err
		}
		r, ok := ranges[id]
		if !ok {
			return "", fmt.Errorf("无法定位节点原文，请在 Markdown 原文中复制")
		}
		start, end = r.start, r.end+len(d.Source)-len(boundaries.Source)
	}
	source := d.Source
	exported := d
	if label != nil && *label != node.Label {
		draft, err := d.WithLabel(id, *label)
		if err != nil {
			return "", err
		}
		source = draft.Source
		exported = draft
		end += len(source) - len(d.Source)
	}
	result := string(source[start:end])
	if d.mind {
		var colored []*Node
		for _, n := range exported.Nodes {
			if (n.Color != "" || n.Fold) && n.Start >= start && n.End <= end {
				colored = append(colored, n)
			}
		}
		sort.Slice(colored, func(i, j int) bool { return colored[i].Start > colored[j].Start })
		for _, n := range colored {
			raw, folded := mindLabelFold(string(source[n.Start:n.End]))
			if folded {
				result = result[:n.Start-start+len(raw)] + result[n.End-start:]
			}
			first, _, _ := strings.Cut(raw, "\n")
			first = strings.TrimSuffix(first, "\r")
			_, headerEnd := mindLabelSpan([]byte(first), 0, n.Kind == "heading")
			label, _ := mindLabelColor(first[:headerEnd])
			result = result[:n.Start-start+len(label)] + result[n.Start-start+headerEnd:]
		}
	}
	return result, nil
}
