package workspace

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestListNumberedNames(t *testing.T) {
	root := t.TempDir()
	want := []string{
		"1.原料.mind.md", "2.炼钢.mind.md", "3.成材.mind.md",
		"4.数据采集.mind.md", "4.1.数据采集-成材.mind.md",
		"4.1.1.明细.md", "4.2.其他.md", "4.10.归档.md",
		"5.其他.mind.md", "6.lims环境.mind.md", "10.总结.md",
		"权限标识.md", "说明.md", "README.md",
	}
	for _, name := range want {
		if err := os.WriteFile(filepath.Join(root, name), nil, 0644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(filepath.Join(root, "文件夹"), 0755); err != nil {
		t.Fatal(err)
	}
	w, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	entries, err := w.List("")
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, entry := range entries {
		got = append(got, entry.Name)
	}
	want = append([]string{"文件夹"}, want...)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("List order = %v, want %v", got, want)
	}
}
