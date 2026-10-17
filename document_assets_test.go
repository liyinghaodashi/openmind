package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"openmind/internal/document"
	"openmind/internal/workspace"
)

func TestDocumentAssetHandler(t *testing.T) {
	root := t.TempDir()
	for name, content := range map[string]string{"a.md": "# A\n", "图片.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\"/>"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
	w, err := workspace.Open(root)
	if err != nil {
		t.Fatal(err)
	}
	s := document.New(t.TempDir())
	s.SetWorkspace(w)
	snapshot, err := s.Open("a.md")
	if err != nil {
		t.Fatal(err)
	}
	app := &App{service: s}
	for _, tc := range []struct {
		method, path string
		status       int
	}{
		{http.MethodGet, "/document-assets/" + snapshot.Session + "/%E5%9B%BE%E7%89%87.svg", 200},
		{http.MethodGet, "/document-assets/old/%E5%9B%BE%E7%89%87.svg", 404},
		{http.MethodGet, "/document-assets/" + snapshot.Session + "/a.md", 404},
		{http.MethodGet, "/document-assets/" + snapshot.Session + "/../private.png", 404},
		{http.MethodPost, "/document-assets/" + snapshot.Session + "/%E5%9B%BE%E7%89%87.svg", 404},
	} {
		response := httptest.NewRecorder()
		app.documentAssetHandler().ServeHTTP(response, httptest.NewRequest(tc.method, tc.path, nil))
		if response.Code != tc.status {
			t.Fatalf("%s: want %d got %d", tc.path, tc.status, response.Code)
		}
		if tc.status == 200 && (response.Header().Get("Content-Type") != "image/svg+xml" || response.Body.Len() == 0) {
			t.Fatal("image content or type missing")
		}
	}
}
