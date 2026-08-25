package db

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type StorageSettings struct {
	DatabasePath string `json:"databasePath"`
	ImagesPath   string `json:"imagesPath"`
}

var storageMu sync.Mutex

func DefaultStorageSettings() (StorageSettings, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return StorageSettings{}, err
	}
	dir := filepath.Join(base, "eVoca")
	return StorageSettings{
		DatabasePath: filepath.Join(dir, "evoca.db"),
		ImagesPath:   filepath.Join(dir, "images"),
	}, nil
}

func storageConfigPath() (string, error) {
	defaults, err := DefaultStorageSettings()
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(defaults.DatabasePath), "storage.json"), nil
}

func LoadStorageSettings() (StorageSettings, error) {
	storageMu.Lock()
	defer storageMu.Unlock()

	defaults, err := DefaultStorageSettings()
	if err != nil {
		return StorageSettings{}, err
	}
	path, err := storageConfigPath()
	if err != nil {
		return StorageSettings{}, err
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return defaults, nil
	}
	if err != nil {
		return StorageSettings{}, err
	}
	var settings StorageSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		return StorageSettings{}, fmt.Errorf("read storage settings: %w", err)
	}
	if strings.TrimSpace(settings.DatabasePath) == "" {
		settings.DatabasePath = defaults.DatabasePath
	}
	if strings.TrimSpace(settings.ImagesPath) == "" {
		settings.ImagesPath = filepath.Join(filepath.Dir(settings.DatabasePath), "images")
	}
	return settings, nil
}

func SaveStorageSettings(settings StorageSettings) error {
	storageMu.Lock()
	defer storageMu.Unlock()

	defaults, err := DefaultStorageSettings()
	if err != nil {
		return err
	}
	settings.DatabasePath = strings.TrimSpace(settings.DatabasePath)
	settings.ImagesPath = strings.TrimSpace(settings.ImagesPath)
	if settings.DatabasePath == "" {
		settings.DatabasePath = defaults.DatabasePath
	}
	if settings.ImagesPath == "" {
		settings.ImagesPath = filepath.Join(filepath.Dir(settings.DatabasePath), "images")
	}
	if err := os.MkdirAll(filepath.Dir(settings.DatabasePath), 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(settings.ImagesPath, 0o755); err != nil {
		return err
	}
	path, err := storageConfigPath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func encodeImageFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

func decodeBase64Image(value string) ([]byte, error) {
	const prefix = "data:image/png;base64,"
	value = strings.TrimPrefix(value, prefix)
	return base64.StdEncoding.DecodeString(value)
}
