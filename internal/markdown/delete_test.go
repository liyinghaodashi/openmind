package markdown

import (
	"bytes"
	"testing"
)

func TestDeleteNodePreservesOtherContent(t *testing.T) {
	for _, tc := range []struct{ name, source, label, want string }{
		{"leaf heading", "# Root\n\n## Delete\n\n## Keep\n", "Delete", "# Root\n\n## Keep\n"},
		{"heading subtree", "# Root\n\n## Delete\nbody\n### Child\n- nested\n\n## Keep\ntext\n", "Delete", "# Root\n\n## Keep\ntext\n"},
		{"list subtree", "# Root\n\n- Delete\n  - Child\n    - Deep\n- Keep\n", "Delete", "# Root\n\n- Keep\n"},
		{"nested last", "# Root\n\n- Parent\n  - Keep\n  - Delete\n- Next\n", "Delete", "# Root\n\n- Parent\n  - Keep\n- Next\n"},
		{"only child", "# Root\n\n- Parent\n  - Delete", "Delete", "# Root\n\n- Parent\n"},
		{"ordered", "# Root\n\n1. Delete\n   - Child\n2. Keep\n", "Delete", "# Root\n\n2. Keep\n"},
		{"crlf", "# Root\r\n\r\n## Delete\r\n\r\n## Keep\r\n", "Delete", "# Root\r\n\r\n## Keep\r\n"},
		{"promotion", "# Delete\n\n# Keep\n", "Delete", "# Keep\n"},
		{"BOM", "\xef\xbb\xbf# Delete\n\n# Keep\n", "Delete", "\xef\xbb\xbf# Keep\n"},
		{"setext", "Root\n====\n\nDelete\n------\nbody\n\n## Keep\n", "Delete", "Root\n====\n\n## Keep\n"},
		{"next code block", "# Root\n\n- Delete\n\n```\nkeep code\n```\n", "Delete", "# Root\n\n```\nkeep code\n```\n"},
		{"next named code block", "# Root\n\n- Delete\n\n```java\nkeep code\n```\n", "Delete", "# Root\n\n```java\nkeep code\n```\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d, err := Parse([]byte(tc.source), "file.md")
			if err != nil {
				t.Fatal(err)
			}
			var id string
			for _, n := range d.Nodes {
				if n.Label == tc.label {
					id = n.ID
				}
			}
			next, ids, focus, err := d.WithoutNode(id)
			if err != nil {
				t.Fatal(err)
			}
			if string(next.Source) != tc.want {
				t.Fatalf("got %q want %q", next.Source, tc.want)
			}
			if ids[id] != "" || next.Nodes[focus] == nil {
				t.Fatal("invalid selection mapping")
			}
			if !bytes.Equal(d.Source, []byte(tc.source)) {
				t.Fatal("mutated original")
			}
		})
	}
}

func TestDeleteRootRejected(t *testing.T) {
	d, _ := Parse([]byte("# Root\n\n## Child\n"), "file.md")
	if _, _, _, err := d.WithoutNode(d.Root.ID); err == nil {
		t.Fatal("root deletion allowed")
	}
}
