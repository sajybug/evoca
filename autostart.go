//go:build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows/registry"
)

const autostartRegistryPath = `Software\Microsoft\Windows\CurrentVersion\Run`
const autostartValueName = "eVoca"

func autostartExecutable() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	exe, err = filepath.Abs(exe)
	if err != nil {
		return "", err
	}
	return exe, nil
}

func isAutostartEnabled() (bool, error) {
	key, err := registry.OpenKey(registry.CURRENT_USER, autostartRegistryPath, registry.QUERY_VALUE)
	if err != nil {
		if err == registry.ErrNotExist {
			return false, nil
		}
		return false, err
	}
	defer key.Close()
	value, _, err := key.GetStringValue(autostartValueName)
	if err == registry.ErrNotExist {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(value) != "", nil
}

func setAutostartEnabled(enabled bool) error {
	key, _, err := registry.CreateKey(registry.CURRENT_USER, autostartRegistryPath, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer key.Close()

	if !enabled {
		err := key.DeleteValue(autostartValueName)
		if err == registry.ErrNotExist {
			return nil
		}
		return err
	}

	exe, err := autostartExecutable()
	if err != nil {
		return err
	}
	// Quote the path so installations under directories containing spaces start correctly.
	return key.SetStringValue(autostartValueName, fmt.Sprintf(`"%s"`, exe))
}
