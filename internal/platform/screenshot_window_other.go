//go:build !windows

package platform

type screenshotWindowRect struct {
	Left, Top, Right, Bottom int32
}

func HideScreenshotWindowForCapture() error { return nil }
func UncloakScreenshotWindow() error        { return nil }

func ShowScreenshotWindowNoActivate(width, height int) error { return nil }
func GetEvocaWindowRect() (screenshotWindowRect, error)      { return screenshotWindowRect{}, nil }
func RestoreEvocaWindowRect(rect screenshotWindowRect) error { return nil }
