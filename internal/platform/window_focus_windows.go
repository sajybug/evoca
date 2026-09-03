//go:build windows

package platform

import (
	"sync"
	"syscall"
	"time"
	"unsafe"
)

var (
	user32Focus             = syscall.NewLazyDLL("user32.dll")
	getForegroundWindowProc = user32Focus.NewProc("GetForegroundWindow")
	isWindowVisibleProc     = user32Focus.NewProc("IsWindowVisible")
	setForegroundWindowProc = user32Focus.NewProc("SetForegroundWindow")
	setActiveWindowProc     = user32Focus.NewProc("SetActiveWindow")
	bringWindowToTopProc    = user32Focus.NewProc("BringWindowToTop")
	getCursorPosProc        = user32Focus.NewProc("GetCursorPos")
	windowFromPointProc     = user32Focus.NewProc("WindowFromPoint")
	getAncestorProc         = user32Focus.NewProc("GetAncestor")
)

type focusPoint struct {
	X int32
	Y int32
}

var focusWatcherMu sync.Mutex
var focusWatcherStop chan struct{}
var focusWatcherSuppressed bool

func SuppressWindowFocusRecovery() func() {
	focusWatcherMu.Lock()
	previous := focusWatcherSuppressed
	focusWatcherSuppressed = true
	focusWatcherMu.Unlock()
	return func() {
		focusWatcherMu.Lock()
		focusWatcherSuppressed = previous
		focusWatcherMu.Unlock()
	}
}

func isWindowFocusRecoverySuppressed() bool {
	focusWatcherMu.Lock()
	suppressed := focusWatcherSuppressed
	focusWatcherMu.Unlock()
	return suppressed
}

func RecoverWindowFocus() {
	hwnd := findEvocaWindow()
	if hwnd == 0 {
		return
	}
	if !isVisibleWindow(hwnd) {
		return
	}

	foreground, _, _ := getForegroundWindowProc.Call()
	if foreground == hwnd {
		return
	}

	_, _, _ = bringWindowToTopProc.Call(hwnd)
	_, _, _ = setForegroundWindowProc.Call(hwnd)
	_, _, _ = setActiveWindowProc.Call(hwnd)
}

// startWindowFocusWatcher keeps native focus in sync when the user switches
// to another application and then moves the pointer back over eVoca. The
// pointer is checked natively so the first click does not have to race a JS
// pointerenter -> Go RPC round trip.
func StartWindowFocusWatcher() {
	focusWatcherMu.Lock()
	defer focusWatcherMu.Unlock()
	if focusWatcherStop != nil {
		return
	}

	stop := make(chan struct{})
	focusWatcherStop = stop

	go func() {
		ticker := time.NewTicker(40 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if !isWindowFocusRecoverySuppressed() && cursorIsOverEvoca() {
					RecoverWindowFocus()
				}
			case <-stop:
				return
			}
		}
	}()
}

func StopWindowFocusWatcher() {
	focusWatcherMu.Lock()
	defer focusWatcherMu.Unlock()
	if focusWatcherStop == nil {
		return
	}
	close(focusWatcherStop)
	focusWatcherStop = nil
}

func isVisibleWindow(hwnd uintptr) bool {
	visible, _, _ := isWindowVisibleProc.Call(hwnd)
	return visible != 0
}

func cursorIsOverEvoca() bool {
	hwnd := findEvocaWindow()
	if hwnd == 0 || !isVisibleWindow(hwnd) {
		return false
	}

	var point focusPoint
	ok, _, _ := getCursorPosProc.Call(uintptr(unsafe.Pointer(&point)))
	if ok == 0 {
		return false
	}

	hit, _, _ := windowFromPointProc.Call(uintptr(uint64(uint32(point.X)) | (uint64(uint32(point.Y)) << 32)))
	if hit == 0 {
		return false
	}

	const gaRoot = 2
	root, _, _ := getAncestorProc.Call(hit, gaRoot)
	return root == hwnd
}
