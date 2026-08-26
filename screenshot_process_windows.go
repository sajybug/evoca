//go:build windows

package main

import (
	"bytes"
	"fmt"
	"image"
	"image/png"
	"syscall"
	"unsafe"
)

const (
	smCxScreen = 0
	smCyScreen = 1
	srccopy    = 0x00CC0020
	dibRGB     = 0
)

type bitmapInfoHeader struct {
	Size          uint32
	Width         int32
	Height        int32
	Planes        uint16
	BitCount      uint16
	Compression   uint32
	SizeImage     uint32
	XPelsPerMeter int32
	YPelsPerMeter int32
	ClrUsed       uint32
	ClrImportant  uint32
}

type bitmapInfo struct {
	Header bitmapInfoHeader
	Colors [1]uint32
}

var (
	user32                 = syscall.NewLazyDLL("user32.dll")
	gdi32                  = syscall.NewLazyDLL("gdi32.dll")
	getSystemMetrics       = user32.NewProc("GetSystemMetrics")
	getDC                  = user32.NewProc("GetDC")
	releaseDC              = user32.NewProc("ReleaseDC")
	createCompatibleDC     = gdi32.NewProc("CreateCompatibleDC")
	deleteDC               = gdi32.NewProc("DeleteDC")
	createCompatibleBitmap = gdi32.NewProc("CreateCompatibleBitmap")
	selectObject           = gdi32.NewProc("SelectObject")
	bitBlt                 = gdi32.NewProc("BitBlt")
	getDIBits              = gdi32.NewProc("GetDIBits")
	deleteObject           = gdi32.NewProc("DeleteObject")
)

func capturePrimaryScreen() ([]byte, error) {
	width, _, err := getMetric(smCxScreen)
	if err != nil {
		return nil, err
	}
	height, _, err := getMetric(smCyScreen)
	if err != nil {
		return nil, err
	}
	if width <= 0 || height <= 0 {
		return nil, fmt.Errorf("invalid primary screen size: %dx%d", width, height)
	}

	screen, _, err := getDC.Call(0)
	if screen == 0 {
		return nil, fmt.Errorf("GetDC failed: %w", err)
	}
	defer releaseDC.Call(0, screen)

	memDC, _, err := createCompatibleDC.Call(screen)
	if memDC == 0 {
		return nil, fmt.Errorf("CreateCompatibleDC failed: %w", err)
	}
	defer deleteDC.Call(memDC)

	bitmap, _, err := createCompatibleBitmap.Call(screen, uintptr(width), uintptr(height))
	if bitmap == 0 {
		return nil, fmt.Errorf("CreateCompatibleBitmap failed: %w", err)
	}
	defer deleteObject.Call(bitmap)

	previous, _, err := selectObject.Call(memDC, bitmap)
	if previous == 0 {
		return nil, fmt.Errorf("SelectObject failed: %w", err)
	}
	defer selectObject.Call(memDC, previous)

	if ok, _, err := bitBlt.Call(memDC, 0, 0, uintptr(width), uintptr(height), screen, 0, 0, srccopy); ok == 0 {
		return nil, fmt.Errorf("BitBlt failed: %w", err)
	}

	img := image.NewRGBA(image.Rect(0, 0, width, height))
	bmi := bitmapInfo{Header: bitmapInfoHeader{
		Size:        uint32(unsafe.Sizeof(bitmapInfoHeader{})),
		Width:       int32(width),
		Height:      -int32(height), // top-down DIB; keeps desktop orientation without vertical flip.
		Planes:      1,
		BitCount:    32,
		Compression: dibRGB,
	}}
	if copied, _, err := getDIBits.Call(memDC, bitmap, 0, uintptr(height), uintptr(unsafe.Pointer(&img.Pix[0])), uintptr(unsafe.Pointer(&bmi)), dibRGB); copied == 0 {
		return nil, fmt.Errorf("GetDIBits failed: %w", err)
	}

	// Windows DIB pixels are BGRA; image.RGBA expects RGBA.
	for i := 0; i+3 < len(img.Pix); i += 4 {
		img.Pix[i], img.Pix[i+2] = img.Pix[i+2], img.Pix[i]
		img.Pix[i+3] = 255
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, fmt.Errorf("encode screenshot: %w", err)
	}
	return buf.Bytes(), nil
}

func getMetric(index int) (int, uintptr, error) {
	value, _, err := getSystemMetrics.Call(uintptr(index))
	if value == 0 {
		if err != nil && err != syscall.Errno(0) {
			return 0, value, err
		}
		return 0, value, fmt.Errorf("GetSystemMetrics(%d) returned 0", index)
	}
	return int(value), value, nil
}
