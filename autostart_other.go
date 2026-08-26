//go:build !windows

package main

import "fmt"

func isAutostartEnabled() (bool, error) { return false, nil }
func setAutostartEnabled(bool) error    { return fmt.Errorf("autostart is supported on Windows only") }
