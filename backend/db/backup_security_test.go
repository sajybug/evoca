package db

import (
	"archive/zip"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeZip(t *testing.T, files map[string]string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "backup.zip")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	for name, body := range files {
		w, err := zw.Create(name)
		if err != nil {
			_ = f.Close()
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(body)); err != nil {
			_ = f.Close()
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		_ = f.Close()
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestExtractZipSafelyRejectsTraversal(t *testing.T) {
	zipPath := writeZip(t, map[string]string{
		"../outside.txt": "must not escape",
	})
	dest := t.TempDir()
	if err := extractZipSafely(zipPath, dest); err == nil {
		t.Fatal("expected path traversal to be rejected")
	}
	if _, err := os.Stat(filepath.Join(dest, "..", "outside.txt")); !os.IsNotExist(err) {
		t.Fatal("traversal target exists outside destination")
	}
}

func TestSettingsBackupDoesNotContainRawCredentials(t *testing.T) {
	payload := BackupPayload{
		Providers: []Provider{{
			ID:            "p1",
			Name:          "Provider",
			Kind:          "openai_compatible",
			CredentialRef: "openai_api_key",
			APIKeyEnv:     "EVOCA_OPENAI_API_KEY",
			HeadersJSON:   `{"X-Test":"value"}`,
		}},
	}
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "sk-secret") || strings.Contains(string(data), "api-secret") {
		t.Fatal("raw credential leaked into backup payload")
	}
	if !strings.Contains(string(data), "openai_api_key") {
		t.Fatal("credential reference missing from payload")
	}
}

func TestRestorePayloadRejectsBrokenReferencesBeforeMutation(t *testing.T) {
	db := newTestDB(t)
	if _, err := db.conn.Exec(`INSERT INTO providers(id,name,kind,headers_json,created_at) VALUES('existing','Existing','openai_compatible','{}',1)`); err != nil {
		t.Fatal(err)
	}

	err := db.restorePayload(BackupPayload{
		Providers: []Provider{{ID: "new", Name: "New", Kind: "openai_compatible"}},
		Models:    []ProviderModel{{ID: "m1", ProviderID: "missing", Name: "model"}},
	})
	if err == nil {
		t.Fatal("expected broken provider reference to be rejected")
	}

	var count int
	if err := db.conn.QueryRow(`SELECT COUNT(*) FROM providers WHERE id='existing'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatal("invalid backup mutated existing provider data")
	}
}
