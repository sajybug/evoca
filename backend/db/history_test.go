package db

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExecutionLifecyclePersistsMetricsAndRemovesImage(t *testing.T) {
	db := newTestDB(t)
	if _, err := db.conn.Exec(`
		INSERT INTO providers(id,name,kind,base_url,headers_json,created_at)
		VALUES('p1','Test','openai_compatible','','{}',1);`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.conn.Exec(`
		INSERT INTO provider_models(id,provider_id,name,display_name,created_at)
		VALUES('m1','p1','model','Model',1);`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.conn.Exec(`
		INSERT INTO configurations(id,name,provider_id,model,spell,input_type,output_type,created_at,updated_at)
		VALUES('c1','Test config','p1','model','system','text','text',1,1);`); err != nil {
		t.Fatal(err)
	}

	imageBytes, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	imageData := base64.StdEncoding.EncodeToString(imageBytes)
	id, err := db.RecordExecutionStart("c1", "model", "screenshot", "input", "system", imageData)
	if err != nil {
		t.Fatal(err)
	}

	var imagePath string
	if err := db.conn.QueryRow(`SELECT image_data FROM executions WHERE id=?`, id).Scan(&imagePath); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(imagePath, "@file:") {
		t.Fatalf("expected prefix '@file:', got %q (length: %d)", imagePath, len(imagePath))
	}
	path := strings.TrimPrefix(imagePath, "@file:")
	if filepath.IsAbs(path) {
		t.Fatalf("stored image reference should be portable, got absolute path %q", path)
	}
	resolvedPath := filepath.Join(db.imageDir, filepath.Base(path))
	if _, err := os.Stat(resolvedPath); err != nil {
		t.Fatalf("stored image missing: %v", err)
	}

	if err := db.CompleteExecution(id, "output", "completed", "", ExecutionMetrics{
		DurationMs:   120,
		FirstTokenMs: 25,
		InputTokens:  10,
		OutputTokens: 20,
		TotalTokens:  30,
		TokensPerSec: 166.6,
	}); err != nil {
		t.Fatal(err)
	}

	page, err := db.ListExecutions(1, 20, "", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 1 || page.Items[0].Status != "completed" || page.Items[0].TotalTokens != 30 {
		t.Fatalf("unexpected execution page: %+v", page)
	}

	if err := db.DeleteExecution(id); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(resolvedPath); !os.IsNotExist(err) {
		t.Fatalf("expected image to be removed, stat error=%v", err)
	}
}

func TestResolveExecutionImagePathPortableFallback(t *testing.T) {
	db := newTestDB(t)
	legacyDir := t.TempDir()
	legacyPath := filepath.Join(legacyDir, "execution.png")
	if err := os.WriteFile(legacyPath, []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}
	ref := "@file:" + legacyPath
	resolved := db.resolveExecutionImagePath(ref)
	if resolved != legacyPath {
		t.Fatalf("existing absolute path should be preserved: got %q want %q", resolved, legacyPath)
	}

	db.imageDir = filepath.Join(t.TempDir(), "images")
	want := filepath.Join(db.imageDir, filepath.Base(legacyPath))
	resolved = db.resolveExecutionImagePath("@file:" + filepath.Join(filepath.Dir(legacyPath), "missing", filepath.Base(legacyPath)))
	if resolved != want {
		t.Fatalf("missing legacy path should fall back to current image directory: got %q want %q", resolved, want)
	}

	relative := db.resolveExecutionImagePath("@file:execution.png")
	if relative != want {
		t.Fatalf("relative image reference should resolve under current image directory: got %q want %q", relative, want)
	}
}
