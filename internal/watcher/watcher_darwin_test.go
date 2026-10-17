package watcher

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNestedAtomicReplacementKeepsWatching(t *testing.T) {
	root := t.TempDir()
	events := make(chan struct{}, 32)
	w, err := Start(root, func() {
		select {
		case events <- struct{}{}:
		default:
		}
	})
	if err != nil {
		t.Fatal(err)
	}
	defer w.Close()
	check := func(action func()) {
		t.Helper()
		for len(events) > 0 {
			<-events
		}
		action()
		select {
		case <-events:
		case <-time.After(3 * time.Second):
			t.Fatal("FSEvents did not arrive")
		}
	}
	dir := filepath.Join(root, "nested")
	check(func() {
		if err := os.Mkdir(dir, 0755); err != nil {
			t.Fatal(err)
		}
	})
	path := filepath.Join(dir, "a.md")
	check(func() { os.WriteFile(path, []byte("# A"), 0644) })
	check(func() {
		temp := filepath.Join(dir, "temp")
		os.WriteFile(temp, []byte("# B"), 0644)
		os.Rename(temp, path)
	})
	check(func() { os.WriteFile(path, []byte("# C"), 0644) })
}
