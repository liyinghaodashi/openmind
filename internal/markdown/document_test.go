package markdown

import (
	"bytes"
	"strings"
	"testing"
)

func TestLabelPreservesOriginalBytesAndShiftsOtherSpans(t *testing.T) {
	source := []byte("\xef\xbb\xbf# 原稿\r\n\r\n## Go Modules  ##\r\n\r\n- 原文\r\n  - emoji 🐈\r\n\r\n<!-- keep -->\r\n")
	d, err := Parse(source, "test.md")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(d.Source, source) {
		t.Fatal("parser changed bytes")
	}
	var target, other string
	for id, n := range d.Nodes {
		if n.Label == "Go Modules" {
			target = id
		}
		if n.Label == "emoji 🐈" {
			other = id
		}
	}
	if target == "" || other == "" {
		t.Fatalf("missing nodes: %#v", d.Nodes)
	}
	next, err := d.WithLabel(target, "Go 模块 🐈")
	if err != nil {
		t.Fatal(err)
	}
	expect := bytes.Replace(source, []byte("Go Modules"), []byte("Go 模块 🐈"), 1)
	if !bytes.Equal(next.Source, expect) {
		t.Fatalf("unexpected patch %q", next.Source)
	}
	next, err = next.WithLabel(other, "第二次修改")
	if err != nil {
		t.Fatal(err)
	}
	expect = bytes.Replace(expect, []byte("emoji 🐈"), []byte("第二次修改"), 1)
	if !bytes.Equal(next.Source, expect) {
		t.Fatalf("offset drift: %q", next.Source)
	}
	if !bytes.Equal(d.Source, source) {
		t.Fatal("mutated prior revision")
	}
}

func TestEmptyAndPartialLabelsStayEditableDuringTyping(t *testing.T) {
	d, _ := Parse([]byte("# Test\n\n- item\n"), "a.md")
	id := d.Root.Children[0].ID
	for _, value := range []string{"", "[", "[链接", "🐈"} {
		var err error
		d, err = d.WithLabel(id, value)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasSuffix(string(d.Source), "- "+value+"\n") {
			t.Fatalf("lost input: %q", d.Source)
		}
	}
}

func TestCodeAndFrontMatterAreNotMindMapNodes(t *testing.T) {
	source := []byte("---\ntitle: keep\n---\n# Root\n\n```md\n# fake\n- fake\n```\n\n## Real\n\n- First\n  - Second\n")
	d, err := Parse(source, "a.md")
	if err != nil {
		t.Fatal(err)
	}
	if d.Root.Label != "Root" || len(d.Root.Children) != 1 || d.Root.Children[0].Label != "Real" {
		t.Fatalf("bad hierarchy %#v", d.Root)
	}
	if d.Root.Children[0].Children[0].Children[0].Label != "Second" {
		t.Fatal("nested list missing")
	}
}

func TestMultipleRootsAndMultilineSafety(t *testing.T) {
	d, err := Parse([]byte("# A\n\n# B\n\n- first\n  continuation\n"), "example.md")
	if err != nil {
		t.Fatal(err)
	}
	if d.Root.Kind != "file" || len(d.Root.Children) != 2 {
		t.Fatal("expected virtual root")
	}
	list := d.Root.Children[1].Children[0]
	if list.Editable {
		t.Fatal("multiline list unexpectedly editable")
	}
	if _, err = d.WithLabel(list.ID, "overwrite"); err == nil {
		t.Fatal("expected rejection")
	}
}

func TestSourceTextareaDoesNotNormalizeUntouchedLineEndings(t *testing.T) {
	original := []byte("# Root\r\n\r\n## Old\r\n\n- item\n")
	got := PreserveLineEndings(original, "# Root\n\n## New\n\n- item\n")
	want := []byte("# Root\r\n\r\n## New\r\n\n- item\n")
	if !bytes.Equal(got, want) {
		t.Fatalf("line endings changed: %q", got)
	}
}
