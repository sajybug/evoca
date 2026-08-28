package main

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func TestCropPNGScalesViewportAndClipsBounds(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 50))
	for y := 0; y < 50; y++ {
		for x := 0; x < 100; x++ {
			img.SetRGBA(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: 0, A: 255})
		}
	}
	var src bytes.Buffer
	if err := png.Encode(&src, img); err != nil {
		t.Fatal(err)
	}

	encoded, err := cropPNG(src.Bytes(), 40, 10, 30, 30, 200, 100)
	if err != nil {
		t.Fatal(err)
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatal(err)
	}
	cropped, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if got := cropped.Bounds().Size(); got.X != 15 || got.Y != 15 {
		t.Fatalf("cropped size = %v, want 15x15", got)
	}
}

func TestCropPNGRejectsInvalidSelection(t *testing.T) {
	if _, err := cropPNG([]byte("not png"), 0, 0, 0, 10, 100, 100); err == nil {
		t.Fatal("expected invalid selection error")
	}
	if _, err := cropPNG([]byte("not png"), 0, 0, 10, 10, 100, 100); err == nil {
		t.Fatal("expected decode error")
	}
}
