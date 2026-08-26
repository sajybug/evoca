//go:build !windows

package main

type screenshotWindowRect struct {
	Left, Top, Right, Bottom int32
}

func hideScreenshotWindowForCapture() error { return nil }

func showScreenshotWindowNoActivate(width, height int) error { return nil }
func getEvocaWindowRect() (screenshotWindowRect, error)      { return screenshotWindowRect{}, nil }
func restoreEvocaWindowRect(rect screenshotWindowRect) error { return nil }
