package markdown

import (
	"strings"
	"testing"
)

func TestAssetReferencesRespectMarkdownSyntax(t *testing.T) {
	source := []byte("---\nexample: '![x](.assets/a/front.png)'\n---\n![一](.assets/%E7%AC%94%E8%AE%B0/a.png)\n![二][image]\n\n[image]: <.assets/笔记/b.png>\n\n[下载](./.assets/笔记/a.png)\n<img src=\".assets/笔记/c.png\">\n\n```md\n![x](.assets/a/code.png)\n```\n`![x](.assets/a/inline.png)`\n<!-- <img src=\".assets/a/comment.png\"> -->\n![网络](https://example.com/a.png)\n")
	refs := AssetReferences(source)
	for _, value := range []string{".assets/笔记/a.png", ".assets/笔记/b.png", ".assets/笔记/c.png"} {
		if !refs[value] {
			t.Errorf("missing %s: %v", value, refs)
		}
	}
	if len(refs) != 3 {
		t.Fatalf("unexpected references: %v", refs)
	}
}

func TestRenameAssetReferencesPreservesExamplesAndComments(t *testing.T) {
	source := "\uFEFF# 笔记\r\n![图](.assets/%E7%AC%94%E8%AE%B0/a.png)\r\n![图][image]\r\n\r\n[image]: .assets/笔记/b.png\r\n\r\n<img src=\".assets/笔记/c.png\">\r\n\r\n```md\r\n![图](.assets/笔记/code.png)\r\n```\r\n`![图](.assets/笔记/inline.png)`\r\n<!-- <img src=\".assets/笔记/comment.png\"> -->\r\n"
	next := string(RenameAssetReferences([]byte(source), ".assets/笔记", ".assets/新 笔记"))
	for _, suffix := range []string{"a.png", "b.png", "c.png"} {
		if !strings.Contains(next, ".assets/%E6%96%B0%20%E7%AC%94%E8%AE%B0/"+suffix) {
			t.Errorf("not renamed: %s", suffix)
		}
	}
	for _, suffix := range []string{"code.png", "inline.png", "comment.png"} {
		if !strings.Contains(next, ".assets/笔记/"+suffix) {
			t.Errorf("example rewritten: %s", suffix)
		}
	}
	if !strings.HasPrefix(next, "\uFEFF") || strings.Count(next, "\r\n") != strings.Count(source, "\r\n") {
		t.Fatal("BOM or line endings changed")
	}
}
