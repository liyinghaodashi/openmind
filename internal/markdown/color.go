package markdown

import (
	"fmt"
	"regexp"
	"strings"
)

var mindColorSuffix = regexp.MustCompile(`[ \t]*\[color:(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\][ \t]*$`)

func mindLabelColor(label string) (string, string) {
	match := mindColorSuffix.FindStringSubmatchIndex(label)
	if match == nil {
		return label, ""
	}
	color := strings.ToUpper(label[match[2]:match[3]])
	if len(color) == 4 {
		color = "#" + strings.Repeat(color[1:2], 2) + strings.Repeat(color[2:3], 2) + strings.Repeat(color[3:4], 2)
	}
	return label[:match[0]], color
}

func (d *Document) WithColor(id, color string) (*Document, error) {
	node := d.Nodes[id]
	if !d.mind || node == nil || !node.Editable {
		return nil, fmt.Errorf("仅思维导图节点支持设置颜色")
	}
	label := node.Label
	first, rest, multiline := strings.Cut(label, "\n")
	if color != "" {
		prefix, valid := mindLabelColor("[color:" + color + "]")
		if prefix != "" || valid == "" {
			return nil, fmt.Errorf("颜色必须是 #RGB 或 #RRGGBB 格式")
		}
		if first != "" {
			first += " "
		}
		first += "[color:" + valid + "]"
	}
	label = first
	if multiline {
		label += "\n" + rest
	}
	return d.withLabel(id, label, false)
}
