//go:build !windows

package platform

func RecoverWindowFocus() {}

func SuppressWindowFocusRecovery() func() {
	return func() {}
}

func StartWindowFocusWatcher() {}

func StopWindowFocusWatcher() {}
