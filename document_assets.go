package main

import (
	"net/http"
	"strings"
)

func (a *App) documentAssetHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || !strings.HasPrefix(r.URL.Path, "/document-assets/") {
			http.NotFound(w, r)
			return
		}
		parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/document-assets/"), "/", 2)
		if len(parts) != 2 {
			http.NotFound(w, r)
			return
		}
		body, mime, err := a.service.ReadImage(parts[0], parts[1])
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", mime)
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Write(body)
	})
}
