//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

type screenshotWindowRect struct {
	Left   int32
	Top    int32
	Right  int32
	Bottom int32
}

const (
	swShowNoActivate = 4
	swpNoActivate    = 0x0010
	swpShowWindow    = 0x0040
	swpNoZOrder      = 0x0004
)

var (
	findWindowW   = user32.NewProc("FindWindowW")
	showWindow    = user32.NewProc("ShowWindow")
	setWindowPos  = user32.NewProc("SetWindowPos")
	getWindowRect = user32.NewProc("GetWindowRect")
)

// showScreenshotWindowNoActivate reveals and resizes the Wails window without
// foreground activation. This prevents Windows from flashing/bouncing the
// taskbar button during screenshot capture.
func showScreenshotWindowNoActivate(width, height int) error {
	hwnd := findEvocaWindow()
	if hwnd == 0 {
		return fmt.Errorf("eVoca window handle not found")
	}

	if ok, _, err := setWindowPos.Call(
		hwnd,
		0,
		0,
		0,
		uintptr(width),
		uintptr(height),
		uintptr(swpNoActivate|swpNoZOrder|swpShowWindow),
	); ok == 0 {
		return fmt.Errorf("SetWindowPos failed: %w", err)
	}

	showWindow.Call(hwnd, uintptr(swShowNoActivate))
	return nil
}

func getEvocaWindowRect() (screenshotWindowRect, error) {
	hwnd := findEvocaWindow()
	if hwnd == 0 {
		return screenshotWindowRect{}, fmt.Errorf("eVoca window handle not found")
	}
	var rect screenshotWindowRect
	if ok, _, err := getWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&rect))); ok == 0 {
		return screenshotWindowRect{}, fmt.Errorf("GetWindowRect failed: %w", err)
	}
	return rect, nil
}

func restoreEvocaWindowRect(rect screenshotWindowRect) error {
	hwnd := findEvocaWindow()
	if hwnd == 0 {
		return fmt.Errorf("eVoca window handle not found")
	}
	width := rect.Right - rect.Left
	height := rect.Bottom - rect.Top
	if width <= 0 || height <= 0 {
		return fmt.Errorf("invalid saved window bounds: %dx%d", width, height)
	}
	if ok, _, err := setWindowPos.Call(
		hwnd,
		0,
		uintptr(rect.Left),
		uintptr(rect.Top),
		uintptr(width),
		uintptr(height),
		uintptr(swpNoActivate|swpNoZOrder),
	); ok == 0 {
		return fmt.Errorf("SetWindowPos restore failed: %w", err)
	}
	return nil
}

func findEvocaWindow() uintptr {
	title, _ := syscall.UTF16PtrFromString("eVoca")
	hwnd, _, _ := findWindowW.Call(0, uintptr(unsafe.Pointer(title)))
	return hwnd
}
