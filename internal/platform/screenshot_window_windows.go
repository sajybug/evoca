//go:build windows

package platform

import (
	"errors"
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
	swHide           = 0
	swpNoActivate    = 0x0010
	swpShowWindow    = 0x0040
	swpNoZOrder      = 0x0004
)

var (
	findWindowW           = user32.NewProc("FindWindowW")
	showWindow            = user32.NewProc("ShowWindow")
	setWindowPos          = user32.NewProc("SetWindowPos")
	getWindowRect         = user32.NewProc("GetWindowRect")
	dwmSetWindowAttribute = syscall.NewLazyDLL("dwmapi.dll").NewProc("DwmSetWindowAttribute")
	dwmFlush              = syscall.NewLazyDLL("dwmapi.dll").NewProc("DwmFlush")
)

const dwmwaCloak = 13

func setScreenshotWindowCloaked(hwnd uintptr, cloaked bool) error {
	value := uint32(0)
	if cloaked {
		value = 1
	}
	if result, _, _ := dwmSetWindowAttribute.Call(
		hwnd,
		uintptr(dwmwaCloak),
		uintptr(unsafe.Pointer(&value)),
		unsafe.Sizeof(value),
	); result != 0 {
		return fmt.Errorf("DwmSetWindowAttribute(DWMWA_CLOAK=%t) failed: 0x%x", cloaked, result)
	}
	return nil
}

// hideScreenshotWindowForCapture removes the eVoca surface from the Desktop
// Window Manager before the desktop is sampled. Hiding the HWND alone is not
// sufficient for a transparent/frameless Wails window because DWM may still
// have its last rendered surface in the compositor for a frame. Cloaking
// removes that surface from composition, so BitBlt cannot capture a stale or
// blurred eVoca frame.
func HideScreenshotWindowForCapture() error {
	hwnd := findEvocaWindow()
	if hwnd == 0 {
		return fmt.Errorf("eVoca window handle not found")
	}

	// Keep the native hide as a first step, then cloak the compositor surface.
	_, _, _ = showWindow.Call(hwnd, uintptr(swHide))
	if err := setScreenshotWindowCloaked(hwnd, true); err != nil {
		return err
	}

	if _, _, err := dwmFlush.Call(); err != nil && !errors.Is(err, syscall.Errno(0)) {
		return fmt.Errorf("DwmFlush failed: %w", err)
	}
	return nil
}

func UncloakScreenshotWindow() error {
	hwnd := findEvocaWindow()
	if hwnd == 0 {
		return fmt.Errorf("eVoca window handle not found")
	}
	if err := setScreenshotWindowCloaked(hwnd, false); err != nil {
		return err
	}
	_, _, _ = dwmFlush.Call()
	return nil
}

// showScreenshotWindowNoActivate reveals and resizes the Wails window without
// foreground activation. This prevents Windows from flashing/bouncing the
// taskbar button during screenshot capture.
func ShowScreenshotWindowNoActivate(width, height int) error {
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

	_, _, _ = showWindow.Call(hwnd, uintptr(swShowNoActivate))
	return nil
}

func GetEvocaWindowRect() (screenshotWindowRect, error) {
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

func RestoreEvocaWindowRect(rect screenshotWindowRect) error {
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
