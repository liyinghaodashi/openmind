package markdown

import (
	"bytes"
	"net/url"
	"path"
	"regexp"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/text"
	"golang.org/x/net/html"
)

func assetTree(source []byte) ([]byte, ast.Node) {
	parsed := bytes.Clone(source)
	if bytes.HasPrefix(parsed, []byte{0xef, 0xbb, 0xbf}) {
		copy(parsed[:3], "   ")
	}
	maskFrontMatter(parsed)
	return parsed, goldmark.New(goldmark.WithExtensions(extension.GFM)).Parser().Parse(text.NewReader(parsed))
}

func LocalAssetPath(destination string) string {
	u, err := url.Parse(destination)
	if err != nil || u.IsAbs() || u.Host != "" || strings.HasPrefix(u.Path, "/") || strings.Contains(u.Path, "\\") {
		return ""
	}
	return path.Clean(u.Path)
}

func AssetReferences(source []byte) map[string]bool {
	parsed, tree := assetTree(source)
	refs := map[string]bool{}
	add := func(value string) {
		if p := LocalAssetPath(value); p != "" {
			refs[p] = true
		}
	}
	ast.Walk(tree, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		switch v := n.(type) {
		case *ast.Image:
			add(string(v.Destination))
		case *ast.Link:
			add(string(v.Destination))
		case *ast.RawHTML:
			collectHTMLAssets(v.Segments.Value(parsed), add)
		case *ast.HTMLBlock:
			body := v.Lines().Value(parsed)
			if v.HasClosure() {
				body = append(bytes.Clone(body), v.ClosureLine.Value(parsed)...)
			}
			collectHTMLAssets(body, add)
		}
		return ast.WalkContinue, nil
	})
	return refs
}

func collectHTMLAssets(body []byte, add func(string)) {
	tokens := html.NewTokenizer(bytes.NewReader(body))
	for {
		kind := tokens.Next()
		if kind == html.ErrorToken {
			return
		}
		if kind != html.StartTagToken && kind != html.SelfClosingTagToken {
			continue
		}
		for _, attr := range tokens.Token().Attr {
			if attr.Key == "src" || attr.Key == "href" {
				add(attr.Val)
			}
		}
	}
}

var assetDestination = regexp.MustCompile(`(?m)(\]\(\s*<?|^\s{0,3}\[[^\]\r\n]+\]:\s*<?|(?:src|href)\s*=\s*["'])(?:\./)?([^\s<>"')]+)`)

func RenameAssetReferences(source []byte, oldFolder, newFolder string) []byte {
	masked, tree := assetTree(source)
	mask := func(start, end int) {
		for i := start; i < end; i++ {
			if masked[i] != '\n' && masked[i] != '\r' {
				masked[i] = ' '
			}
		}
	}
	ast.Walk(tree, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		switch n.(type) {
		case *ast.FencedCodeBlock, *ast.CodeBlock:
			for i := 0; i < n.Lines().Len(); i++ {
				line := n.Lines().At(i)
				mask(line.Start, line.Stop)
			}
			return ast.WalkSkipChildren, nil
		case *ast.CodeSpan:
			for c := n.FirstChild(); c != nil; c = c.NextSibling() {
				if t, ok := c.(*ast.Text); ok {
					mask(t.Segment.Start, t.Segment.Stop)
				}
			}
		}
		return ast.WalkContinue, nil
	})
	for offset := 0; offset < len(masked); {
		start := bytes.Index(masked[offset:], []byte("<!--"))
		if start < 0 {
			break
		}
		start += offset
		end := bytes.Index(masked[start:], []byte("-->"))
		if end < 0 {
			mask(start, len(masked))
			break
		}
		end += start + 3
		mask(start, end)
		offset = end
	}
	var out bytes.Buffer
	last := 0
	for _, match := range assetDestination.FindAllSubmatchIndex(masked, -1) {
		start, end := match[4], match[5]
		raw := string(source[start:end])
		u, err := url.Parse(raw)
		if err != nil || u.IsAbs() || u.Host != "" || !strings.HasPrefix(u.Path, oldFolder+"/") {
			continue
		}
		out.Write(source[last:start])
		parts := strings.Split(newFolder+strings.TrimPrefix(u.Path, oldFolder), "/")
		for i := range parts {
			parts[i] = url.PathEscape(parts[i])
		}
		out.WriteString(strings.Join(parts, "/"))
		if u.RawQuery != "" {
			out.WriteByte('?')
			out.WriteString(u.RawQuery)
		}
		if u.Fragment != "" {
			out.WriteByte('#')
			out.WriteString(u.EscapedFragment())
		}
		last = end
	}
	out.Write(source[last:])
	return out.Bytes()
}
