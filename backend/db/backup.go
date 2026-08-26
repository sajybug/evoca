package db

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type BackupMetadata struct {
	Version   int    `json:"version"`
	CreatedAt int64  `json:"createdAt"`
	Database  string `json:"database"`
	Images    string `json:"images"`
}

func (d *DB) BackupTo(path string) error {
	settings, err := LoadStorageSettings()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if _, err := os.Stat(settings.DatabasePath); err != nil {
		return fmt.Errorf("database file is unavailable: %w", err)
	}

	// Ensure WAL content is checkpointed into the main database file before copying it.
	if _, err := d.conn.Exec(`PRAGMA wal_checkpoint(TRUNCATE)`); err != nil {
		return fmt.Errorf("checkpoint database: %w", err)
	}

	tmp := path + ".tmp"
	_ = os.Remove(tmp)
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	zw := zip.NewWriter(out)

	metadata, _ := json.MarshalIndent(BackupMetadata{Version: 1, CreatedAt: time.Now().UnixMilli(), Database: "evoca.db", Images: "images/"}, "", "  ")
	if err := writeZipBytes(zw, "metadata.json", metadata); err != nil {
		out.Close()
		return err
	}
	if err := addFileToZip(zw, settings.DatabasePath, "database/evoca.db"); err != nil {
		out.Close()
		return err
	}

	if _, err := os.Stat(settings.ImagesPath); err == nil {
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
			out.Close()
			return err
		}
	}
	if err := zw.Close(); err != nil {
		out.Close()
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func RestoreFromBackup(path string) error {
	settings, err := LoadStorageSettings()
	if err != nil {
		return err
	}
	if err := validateBackup(path); err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(settings.DatabasePath), 0o755); err != nil {
		return err
	}
	tmpDir, err := os.MkdirTemp("", "evoca-restore-")
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

	// Restore the database atomically as far as the filesystem allows. The caller closes the active DB first.
	if err := copyFile(backupDB, settings.DatabasePath); err != nil {
		return err
	}

	if err := os.RemoveAll(settings.ImagesPath); err != nil {
		return err
	}
	if err := os.MkdirAll(settings.ImagesPath, 0o755); err != nil {
		return err
	}
	backupImages := filepath.Join(tmpDir, "images")
	if info, statErr := os.Stat(backupImages); statErr == nil && info.IsDir() {
		if err := copyDir(backupImages, settings.ImagesPath); err != nil {
			return err
		}
	}
	return nil
}

func validateBackup(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	zr, err := zip.NewReader(f, st.Size())
	if err != nil {
		return fmt.Errorf("invalid backup: %w", err)
	}
	found := false
	for _, zf := range zr.File {
		if filepath.ToSlash(zf.Name) == "database/evoca.db" {
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("invalid backup: database/evoca.db is missing")
	}
	return nil
}

func extractZipSafely(path, dest string) error {
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
			r.Close()
			return err
		}
		_, cpErr := io.Copy(w, r)
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
