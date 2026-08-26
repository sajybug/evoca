//go:build !windows

package main

import "fmt"

func capturePrimaryScreen() ([]byte, error) {
	return nil, fmt.Errorf("screenshot capture is currently supported on Windows only")
}
