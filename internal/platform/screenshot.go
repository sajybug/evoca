package platform

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/png"
)

func CropPNG(data []byte, x, y, w, h, viewportW, viewportH int) (string, error) {
	if w <= 0 || h <= 0 || viewportW <= 0 || viewportH <= 0 {
		return "", fmt.Errorf("invalid screenshot selection")
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("decode screenshot: %w", err)
	}
	bounds := src.Bounds()
	sx := float64(bounds.Dx()) / float64(viewportW)
	sy := float64(bounds.Dy()) / float64(viewportH)
	left := int(float64(x) * sx)
	top := int(float64(y) * sy)
	right := int(float64(x+w) * sx)
	bottom := int(float64(y+h) * sy)
	if left < 0 {
		left = 0
	}
	if top < 0 {
		top = 0
	}
	if right > bounds.Dx() {
		right = bounds.Dx()
	}
	if bottom > bounds.Dy() {
		bottom = bounds.Dy()
	}
	if right <= left || bottom <= top {
		return "", fmt.Errorf("selection is outside captured screen")
	}

	dst := image.NewRGBA(image.Rect(0, 0, right-left, bottom-top))
	for dy := 0; dy < dst.Bounds().Dy(); dy++ {
		for dx := 0; dx < dst.Bounds().Dx(); dx++ {
			dst.Set(dx, dy, src.At(left+dx, top+dy))
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, dst); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}
