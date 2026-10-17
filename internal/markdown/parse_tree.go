package markdown

import (
	"bytes"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

const emptyLabelPosition = "openmind-empty-label-position"

type emptyLabelParser struct {
	parser.BlockParser
}

func (p emptyLabelParser) Open(parent ast.Node, reader text.Reader, pc parser.Context) (ast.Node, parser.State) {
	line, segment := reader.PeekLine()
	start := pc.BlockOffset()
	node, state := p.BlockParser.Open(parent, reader, pc)
	if node == nil || start < 0 {
		return node, state
	}
	end := len(bytes.TrimRight(line, "\r\n"))
	switch n := node.(type) {
	case *ast.Heading:
		if n.Lines().Len() != 0 {
			return node, state
		}
		start += n.Level
	case *ast.ListItem:
		for start < end && line[start] >= '0' && line[start] <= '9' {
			start++
		}
		start++
		if start > end || len(bytes.Trim(line[start:end], " \t")) != 0 {
			return node, state
		}
		if end-start > 4 || bytes.IndexByte(line[start:end], '\t') >= 0 {
			end = min(end, start+1)
		}
	default:
		return node, state
	}
	for start < end && (line[start] == ' ' || line[start] == '\t') {
		start++
	}
	node.SetAttributeString(emptyLabelPosition, segment.Start+start-segment.Padding)
	return node, state
}

func parseTree(source []byte) ast.Node {
	tree := goldmark.New(goldmark.WithParserOptions(parser.WithBlockParsers(
		util.Prioritized(emptyLabelParser{parser.NewListItemParser()}, 399),
		util.Prioritized(emptyLabelParser{parser.NewATXHeadingParser()}, 599),
	))).Parser().Parse(text.NewReader(source))
	ast.Walk(tree, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if entering && node.Type() == ast.TypeBlock && node.Lines().Len() == 0 {
			if value, ok := node.AttributeString(emptyLabelPosition); ok {
				position := value.(int)
				node.Lines().Append(text.NewSegment(position, position))
			}
		}
		return ast.WalkContinue, nil
	})
	return tree
}

func listLabelBlock(item ast.Node) ast.Node {
	first := item.FirstChild()
	if first != nil && (first.Kind() == ast.KindParagraph || first.Kind() == ast.KindTextBlock) {
		return first
	}
	return item
}
