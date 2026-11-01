package main

import (
	"embed"
	"io/fs"
	"log"

	"openmind/internal/desktop"
)

//go:embed all:frontend/index.html all:frontend/src all:frontend/styles
var assets embed.FS

func main() {
	frontend, err := fs.Sub(assets, "frontend")
	if err != nil {
		log.Fatal(err)
	}
	if err := desktop.Run(frontend); err != nil {
		log.Fatal(err)
	}
}
