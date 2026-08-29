//go:build !windows

package platform

import "fmt"

func IsAutostartEnabled() (bool, error) { return false, nil }
func SetAutostartEnabled(bool) error    { return fmt.Errorf("autostart is supported on Windows only") }
