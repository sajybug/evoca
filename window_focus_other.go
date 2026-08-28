//go:build !windows

package main

func recoverWindowFocus() {}

func suppressWindowFocusRecovery() func() {
	return func() {}
}
