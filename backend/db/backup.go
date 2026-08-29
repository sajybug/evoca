package db

import (
	"archive/zip"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type BackupMode string

const (
	maxBackupArchiveBytes             = 512 << 20
	maxBackupEntries                  = 10_000
	maxBackupFileBytes                = 256 << 20
	maxBackupExpandedBytes            = 768 << 20
	BackupModeFull         BackupMode = "full"
	BackupModeSettings     BackupMode = "settings"
)

type BackupMetadata struct {
	Version   int        `json:"version"`
	CreatedAt int64      `json:"createdAt"`
	Mode      BackupMode `json:"mode,omitempty"`
	Database  string     `json:"database,omitempty"`
	Images    string     `json:"images,omitempty"`
	Data      string     `json:"data,omitempty"`
}

type BackupPayload struct {
	Providers      []Provider      `json:"providers"`
	Models         []ProviderModel `json:"models"`
	Configurations []Configuration `json:"configurations"`
}

func (d *DB) BackupTo(path string, mode BackupMode) error {
	if mode != BackupModeFull && mode != BackupModeSettings {
		return fmt.Errorf("unsupported backup mode %q", mode)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	tmp := path + ".tmp"
	_ = os.Remove(tmp)
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	zw := zip.NewWriter(out)
	cleanup := func() {
		_ = zw.Close()
		_ = out.Close()
		_ = os.Remove(tmp)
	}

	metadata := BackupMetadata{Version: 3, CreatedAt: time.Now().UnixMilli(), Mode: mode}
	if mode == BackupModeFull {
		metadata.Database = "database/evoca.db"
		metadata.Images = "images/"
	} else {
		metadata.Data = "data/backup.json"
	}
	metadataBytes, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		cleanup()
		return fmt.Errorf("encode backup metadata: %w", err)
	}
	if err := writeZipBytes(zw, "metadata.json", metadataBytes); err != nil {
		cleanup()
		return err
	}

	if mode == BackupModeSettings {
		payload, err := d.settingsBackupPayload()
		if err != nil {
			cleanup()
			return err
		}
		payloadBytes, err := json.MarshalIndent(payload, "", "  ")
		if err != nil {
			cleanup()
			return fmt.Errorf("encode backup data: %w", err)
		}
		if err := writeZipBytes(zw, "data/backup.json", payloadBytes); err != nil {
			cleanup()
			return err
		}
	} else {
		settings, err := LoadStorageSettings()
		if err != nil {
			cleanup()
			return err
		}
		if _, err := os.Stat(settings.DatabasePath); err != nil {
			cleanup()
			return fmt.Errorf("database file is unavailable: %w", err)
		}

		// Make sure committed WAL pages are in the main database file before copying it.
		if _, err := d.conn.Exec(`PRAGMA wal_checkpoint(TRUNCATE)`); err != nil {
			cleanup()
			return fmt.Errorf("checkpoint database: %w", err)
		}
		if err := addFileToZip(zw, settings.DatabasePath, "database/evoca.db"); err != nil {
			cleanup()
			return err
		}

		if info, err := os.Stat(settings.ImagesPath); err == nil && info.IsDir() {
			err = filepath.Walk(settings.ImagesPath, func(filePath string, info os.FileInfo, walkErr error) error {
				if walkErr != nil {
					return walkErr
				}
				if info.IsDir() {
					return nil
				}
				rel, err := filepath.Rel(settings.ImagesPath, filePath)
				if err != nil {
					return err
				}
				return addFileToZip(zw, filePath, filepath.ToSlash(filepath.Join("images", rel)))
			})
			if err != nil {
				cleanup()
				return err
			}
		} else if err != nil && !os.IsNotExist(err) {
			cleanup()
			return err
		}
	}

	if err := zw.Close(); err != nil {
		_ = out.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func (d *DB) settingsBackupPayload() (BackupPayload, error) {
	providers, err := d.ListProviders()
	if err != nil {
		return BackupPayload{}, fmt.Errorf("load providers: %w", err)
	}
	configurations, err := d.ListConfigurations()
	if err != nil {
		return BackupPayload{}, fmt.Errorf("load configurations: %w", err)
	}

	models := make([]ProviderModel, 0)
	providerIDs := make(map[string]struct{}, len(providers))
	for _, provider := range providers {
		providerIDs[provider.ID] = struct{}{}
		providerModels, err := d.ListProviderModels(provider.ID)
		if err != nil {
			return BackupPayload{}, fmt.Errorf("load models for provider %q: %w", provider.ID, err)
		}
		models = append(models, providerModels...)
	}

	modelsByProvider := make(map[string]map[string]struct{})
	for _, model := range models {
		if modelsByProvider[model.ProviderID] == nil {
			modelsByProvider[model.ProviderID] = make(map[string]struct{})
		}
		modelsByProvider[model.ProviderID][model.Name] = struct{}{}
	}
	for _, config := range configurations {
		if _, ok := providerIDs[config.ProviderID]; !ok {
			return BackupPayload{}, fmt.Errorf("cannot create settings backup: configuration %q references missing provider %q", config.ID, config.ProviderID)
		}
		if _, ok := modelsByProvider[config.ProviderID][config.Model]; !ok {
			return BackupPayload{}, fmt.Errorf("cannot create settings backup: configuration %q references missing model %q for provider %q", config.ID, config.Model, config.ProviderID)
		}
	}

	return BackupPayload{Providers: providers, Models: models, Configurations: configurations}, nil
}

func ReadBackupMode(path string) (BackupMode, error) {
	metadata, err := readBackupMetadata(path)
	if err != nil {
		return "", err
	}
	if metadata.Version == 1 && metadata.Database != "" {
		return BackupModeFull, nil
	}
	if metadata.Version >= 3 && metadata.Mode == BackupModeFull {
		return BackupModeFull, nil
	}
	if metadata.Version >= 2 && (metadata.Mode == BackupModeSettings || metadata.Data != "") {
		return BackupModeSettings, nil
	}
	return "", fmt.Errorf("unsupported backup format")
}

// RestoreSettingsFromBackup replaces only Providers, Provider Models, and Configurations.
// The caller must close the active application database before invoking this function.
func RestoreSettingsFromBackup(path string) error {
	if err := validateSettingsBackup(path); err != nil {
		return err
	}

	payload, err := readSettingsBackupPayload(path)
	if err != nil {
		return err
	}

	settings, err := LoadStorageSettings()
	if err != nil {
		return err
	}

	conn, err := sql.Open("sqlite", settings.DatabasePath)
	if err != nil {
		return fmt.Errorf("open database for restore: %w", err)
	}
	defer conn.Close()

	if _, err := conn.Exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`); err != nil {
		return fmt.Errorf("prepare database for restore: %w", err)
	}

	maintenanceDB := &DB{conn: conn, imageDir: settings.ImagesPath}
	return maintenanceDB.restorePayload(payload)
}

func readSettingsBackupPayload(path string) (BackupPayload, error) {
	tmpDir, err := os.MkdirTemp("", "evoca-restore-settings-")
	if err != nil {
		return BackupPayload{}, err
	}
	defer os.RemoveAll(tmpDir)

	if err := extractZipSafely(path, tmpDir); err != nil {
		return BackupPayload{}, err
	}
	payloadPath := filepath.Join(tmpDir, "data", "backup.json")
	payloadData, err := os.ReadFile(payloadPath)
	if err != nil {
		return BackupPayload{}, fmt.Errorf("read backup data: %w", err)
	}
	var payload BackupPayload
	if err := json.Unmarshal(payloadData, &payload); err != nil {
		return BackupPayload{}, fmt.Errorf("invalid backup data: %w", err)
	}
	return payload, nil
}

func (d *DB) RestoreFromBackup(path string) error {
	mode, err := ReadBackupMode(path)
	if err != nil {
		return err
	}
	if mode != BackupModeSettings {
		return fmt.Errorf("this is a full-program backup; restore it as a full backup")
	}
	return RestoreSettingsFromBackup(path)
}

// RestoreFullFromBackup replaces the active database file and History images.
// The caller must close the active database connection before calling this method.
func RestoreFullFromBackup(path string) error {
	settings, err := LoadStorageSettings()
	if err != nil {
		return err
	}
	if err := validateFullBackup(path); err != nil {
		return err
	}

	tmpDir, err := os.MkdirTemp("", "evoca-restore-full-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmpDir)

	if err := extractZipSafely(path, tmpDir); err != nil {
		return err
	}
	backupDB := filepath.Join(tmpDir, "database", "evoca.db")
	if _, err := os.Stat(backupDB); err != nil {
		return fmt.Errorf("backup does not contain a database")
	}

	if err := os.MkdirAll(filepath.Dir(settings.DatabasePath), 0o755); err != nil {
		return err
	}
	if err := copyFile(backupDB, settings.DatabasePath); err != nil {
		return fmt.Errorf("restore database: %w", err)
	}

	if err := os.RemoveAll(settings.ImagesPath); err != nil {
		return fmt.Errorf("clear history images: %w", err)
	}
	if err := os.MkdirAll(settings.ImagesPath, 0o755); err != nil {
		return err
	}
	backupImages := filepath.Join(tmpDir, "images")
	if info, statErr := os.Stat(backupImages); statErr == nil && info.IsDir() {
		if err := copyDir(backupImages, settings.ImagesPath); err != nil {
			return fmt.Errorf("restore history images: %w", err)
		}
	}
	return nil
}

func readBackupMetadata(path string) (BackupMetadata, error) {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return BackupMetadata{}, fmt.Errorf("invalid backup: %w", err)
	}
	defer zr.Close()
	for _, zf := range zr.File {
		if filepath.ToSlash(zf.Name) != "metadata.json" {
			continue
		}
		r, err := zf.Open()
		if err != nil {
			return BackupMetadata{}, err
		}
		data, err := io.ReadAll(r)
		closeErr := r.Close()
		if err != nil {
			return BackupMetadata{}, err
		}
		if closeErr != nil {
			return BackupMetadata{}, closeErr
		}
		var metadata BackupMetadata
		if err := json.Unmarshal(data, &metadata); err != nil {
			return BackupMetadata{}, fmt.Errorf("invalid backup metadata: %w", err)
		}
		return metadata, nil
	}
	return BackupMetadata{}, fmt.Errorf("invalid backup: metadata.json is missing")
}

func validateFullBackup(path string) error {
	if err := validateBackupArchive(path); err != nil {
		return err
	}
	metadata, err := readBackupMetadata(path)
	if err != nil {
		return err
	}
	if metadata.Version == 1 && metadata.Database != "" {
		return nil
	}
	if metadata.Version >= 3 && metadata.Mode == BackupModeFull {
		return nil
	}
	return fmt.Errorf("selected file is not a full-program backup")
}

func validateSettingsBackup(path string) error {
	if err := validateBackupArchive(path); err != nil {
		return err
	}
	metadata, err := readBackupMetadata(path)
	if err != nil {
		return err
	}
	if metadata.Version < 2 || (metadata.Version >= 3 && metadata.Mode != BackupModeSettings) {
		return fmt.Errorf("selected file is not a settings backup")
	}
	zr, err := zip.OpenReader(path)
	if err != nil {
		return fmt.Errorf("invalid backup: %w", err)
	}
	defer zr.Close()
	for _, zf := range zr.File {
		if filepath.ToSlash(zf.Name) == "data/backup.json" {
			return nil
		}
	}
	return fmt.Errorf("invalid backup: data/backup.json is missing")
}

func (d *DB) restorePayload(payload BackupPayload) error {
	// Validate the complete payload before opening a write transaction. This prevents
	// a malformed/inconsistent backup from partially deleting the current settings.
	providerIDs := make(map[string]struct{}, len(payload.Providers))
	for _, provider := range payload.Providers {
		if strings.TrimSpace(provider.ID) == "" || strings.TrimSpace(provider.Name) == "" {
			return fmt.Errorf("backup contains an invalid provider")
		}
		if _, exists := providerIDs[provider.ID]; exists {
			return fmt.Errorf("backup contains duplicate provider %q", provider.ID)
		}
		providerIDs[provider.ID] = struct{}{}
	}

	modelIDs := make(map[string]struct{}, len(payload.Models))
	modelsByProvider := make(map[string]map[string]struct{})
	for _, model := range payload.Models {
		if strings.TrimSpace(model.ID) == "" || strings.TrimSpace(model.ProviderID) == "" || strings.TrimSpace(model.Name) == "" {
			return fmt.Errorf("backup contains an invalid provider model")
		}
		if _, exists := modelIDs[model.ID]; exists {
			return fmt.Errorf("backup contains duplicate provider model %q", model.ID)
		}
		if _, ok := providerIDs[model.ProviderID]; !ok {
			return fmt.Errorf("backup model %q references missing provider %q", model.ID, model.ProviderID)
		}
		modelIDs[model.ID] = struct{}{}
		if modelsByProvider[model.ProviderID] == nil {
			modelsByProvider[model.ProviderID] = make(map[string]struct{})
		}
		modelsByProvider[model.ProviderID][model.Name] = struct{}{}
	}

	configIDs := make(map[string]struct{}, len(payload.Configurations))
	for _, config := range payload.Configurations {
		if strings.TrimSpace(config.ID) == "" || strings.TrimSpace(config.Name) == "" || strings.TrimSpace(config.ProviderID) == "" || strings.TrimSpace(config.Model) == "" {
			return fmt.Errorf("backup contains an invalid configuration")
		}
		if _, exists := configIDs[config.ID]; exists {
			return fmt.Errorf("backup contains duplicate configuration %q", config.ID)
		}
		if _, ok := providerIDs[config.ProviderID]; !ok {
			return fmt.Errorf("configuration %q references missing provider %q", config.ID, config.ProviderID)
		}
		if _, ok := modelsByProvider[config.ProviderID][config.Model]; !ok {
			return fmt.Errorf("configuration %q references missing model %q for provider %q", config.ID, config.Model, config.ProviderID)
		}
		configIDs[config.ID] = struct{}{}
	}

	tx, err := d.conn.Begin()
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.Exec(`DELETE FROM configurations`); err != nil {
		return fmt.Errorf("clear configurations: %w", err)
	}
	if _, err = tx.Exec(`DELETE FROM provider_models`); err != nil {
		return fmt.Errorf("clear provider models: %w", err)
	}
	if _, err = tx.Exec(`DELETE FROM providers`); err != nil {
		return fmt.Errorf("clear providers: %w", err)
	}

	for _, provider := range payload.Providers {
		if provider.Kind == "" {
			provider.Kind = "openai_compatible"
		}
		if provider.HeadersJSON == "" {
			provider.HeadersJSON = "{}"
		}
		if _, err = tx.Exec(`
			INSERT INTO providers(id,name,kind,base_url,credential_ref,api_key_env,headers_json,created_at)
			VALUES(?,?,?,?,?,?,?,?)
		`, provider.ID, provider.Name, provider.Kind, provider.BaseURL, provider.CredentialRef, provider.APIKeyEnv, provider.HeadersJSON, provider.CreatedAt); err != nil {
			return fmt.Errorf("restore provider %q: %w", provider.ID, err)
		}
	}

	for _, model := range payload.Models {
		if _, err = tx.Exec(`
			INSERT INTO provider_models(id,provider_id,name,display_name,created_at)
			VALUES(?,?,?,?,?)
		`, model.ID, model.ProviderID, model.Name, model.DisplayName, model.CreatedAt); err != nil {
			return fmt.Errorf("restore model %q: %w", model.ID, err)
		}
	}

	for _, config := range payload.Configurations {
		if _, err = tx.Exec(`
			INSERT INTO configurations(
				id,name,description,icon,provider_id,model,spell,input_type,output_type,
				temperature,max_tokens,pinned,last_used_at,use_count,created_at,updated_at
			) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		`, config.ID, config.Name, config.Description, config.Icon, config.ProviderID, config.Model, config.Spell,
			config.InputType, config.OutputType, config.Temperature, config.MaxTokens, boolToInt(config.Pinned),
			config.LastUsedAt, config.UseCount, config.CreatedAt, config.UpdatedAt); err != nil {
			return fmt.Errorf("restore configuration %q: %w", config.ID, err)
		}
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit restore: %w", err)
	}
	committed = true
	return nil
}

func validateBackupArchive(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("stat backup: %w", err)
	}
	if info.Size() > maxBackupArchiveBytes {
		return fmt.Errorf("backup is too large: %d bytes exceeds %d-byte limit", info.Size(), maxBackupArchiveBytes)
	}
	zr, err := zip.OpenReader(path)
	if err != nil {
		return fmt.Errorf("invalid backup: %w", err)
	}
	defer zr.Close()
	if len(zr.File) > maxBackupEntries {
		return fmt.Errorf("backup contains too many entries: %d", len(zr.File))
	}
	var expanded uint64
	for _, file := range zr.File {
		name := strings.TrimSuffix(filepath.FromSlash(file.Name), string(os.PathSeparator))
		if name == "" || filepath.Clean(name) != name || filepath.IsAbs(name) {
			return fmt.Errorf("invalid backup path: %s", file.Name)
		}
		if file.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("backup contains unsupported symlink: %s", file.Name)
		}
		if file.UncompressedSize64 > maxBackupFileBytes {
			return fmt.Errorf("backup entry is too large: %s", file.Name)
		}
		expanded += file.UncompressedSize64
		if expanded > maxBackupExpandedBytes {
			return fmt.Errorf("backup expands beyond safe limit")
		}
	}
	return nil
}

func extractZipSafely(path, dest string) error {
	if err := validateBackupArchive(path); err != nil {
		return err
	}
	zr, err := zip.OpenReader(path)
	if err != nil {
		return err
	}
	defer zr.Close()
	base, err := filepath.Abs(dest)
	if err != nil {
		return err
	}
	for _, file := range zr.File {
		name := filepath.FromSlash(file.Name)
		target := filepath.Join(base, name)
		abs, err := filepath.Abs(target)
		if err != nil {
			return err
		}
		if abs != base && !strings.HasPrefix(abs, base+string(os.PathSeparator)) {
			return fmt.Errorf("invalid backup path: %s", file.Name)
		}
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(abs, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
			return err
		}
		r, err := file.Open()
		if err != nil {
			return err
		}
		w, err := os.OpenFile(abs, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
		if err != nil {
			_ = r.Close()
			return err
		}
		_, cpErr := io.Copy(w, io.LimitReader(r, maxBackupFileBytes+1))
		closeErr1 := w.Close()
		closeErr2 := r.Close()
		if cpErr != nil {
			return cpErr
		}
		if closeErr1 != nil {
			return closeErr1
		}
		if closeErr2 != nil {
			return closeErr2
		}
		if file.UncompressedSize64 > maxBackupFileBytes {
			return fmt.Errorf("backup entry is too large: %s", file.Name)
		}
	}
	return nil
}

func addFileToZip(zw *zip.Writer, source, name string) error {
	src, err := os.Open(source)
	if err != nil {
		return err
	}
	defer src.Close()
	info, err := src.Stat()
	if err != nil {
		return err
	}
	hdr, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	hdr.Name = filepath.ToSlash(name)
	hdr.Method = zip.Deflate
	dst, err := zw.CreateHeader(hdr)
	if err != nil {
		return err
	}
	_, err = io.Copy(dst, src)
	return err
}

func writeZipBytes(zw *zip.Writer, name string, data []byte) error {
	w, err := zw.Create(name)
	if err != nil {
		return err
	}
	_, err = w.Write(data)
	return err
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	_, cpErr := io.Copy(out, in)
	closeErr := out.Close()
	if cpErr != nil {
		return cpErr
	}
	return closeErr
}

func copyDir(srcDir, dstDir string) error {
	return filepath.Walk(srcDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(srcDir, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dstDir, rel)
		if info.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		return copyFile(path, target)
	})
}
