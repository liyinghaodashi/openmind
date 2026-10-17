package appicon

import (
	"bytes"
	"image/png"
	"testing"
)

func TestEmbeddedAnimeIcon(t *testing.T) {
	image, err := png.Decode(bytes.NewReader(animePNG))
	if err != nil {
		t.Fatal(err)
	}
	if image.Bounds().Dx() != 1024 || image.Bounds().Dy() != 1024 {
		t.Fatalf("unexpected icon dimensions: %v", image.Bounds())
	}
	_, _, _, alpha := image.At(0, 0).RGBA()
	if alpha != 0 {
		t.Fatal("icon outer margin must be transparent")
	}
	_, _, _, alpha = image.At(512, 512).RGBA()
	if alpha < 64000 {
		t.Fatalf("icon center must remain visible: alpha=%d", alpha)
	}
}
