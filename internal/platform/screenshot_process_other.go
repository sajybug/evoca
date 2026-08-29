//go:build !windows

package platform

import "fmt"

func CapturePrimaryScreen() ([]byte, error) {
	return nil, fmt.Errorf("screenshot capture is currently supported on Windows only")
}
