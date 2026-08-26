package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

type DB struct {
	conn     *sql.DB
	imageDir string
}

func Open(ctx context.Context) (*DB, error) {
	settings, err := LoadStorageSettings()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(settings.DatabasePath), 0o755); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(settings.ImagesPath, 0o755); err != nil {
		return nil, err
	}

	conn, err := sql.Open("sqlite", settings.DatabasePath)
	if err != nil {
		return nil, err
	}

	d := &DB{conn: conn, imageDir: settings.ImagesPath}
	if err := d.initializeSchema(); err != nil {
		_ = conn.Close()
		return nil, err
	}

	return d, nil
}

func (d *DB) Close() error {
	return d.conn.Close()
}

func (d *DB) initializeSchema() error {
	if _, err := d.conn.Exec(`
		PRAGMA foreign_keys = ON;

		CREATE TABLE IF NOT EXISTS providers (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			kind TEXT NOT NULL DEFAULT 'openai_compatible',
			base_url TEXT,
			credential_ref TEXT,
			api_key_env TEXT,
			headers_json TEXT,
			created_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS configurations (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT,
			icon TEXT,
			provider_id TEXT NOT NULL,
			model TEXT NOT NULL,
			spell TEXT NOT NULL,
			input_type TEXT NOT NULL DEFAULT 'text',
			output_type TEXT NOT NULL DEFAULT 'text',
			temperature REAL,
			max_tokens INTEGER,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS executions (
			id TEXT PRIMARY KEY,
			configuration_id TEXT NOT NULL,
			model TEXT NOT NULL DEFAULT '',
			input TEXT,
			output TEXT,
			status TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			duration_ms INTEGER,
			request_type TEXT NOT NULL DEFAULT 'text',
			system_prompt TEXT NOT NULL DEFAULT '',
			image_data TEXT NOT NULL DEFAULT '',
			completed_at INTEGER,
			error_text TEXT NOT NULL DEFAULT '',
			first_token_ms INTEGER NOT NULL DEFAULT 0,
			input_tokens INTEGER NOT NULL DEFAULT 0,
			output_tokens INTEGER NOT NULL DEFAULT 0,
			total_tokens INTEGER NOT NULL DEFAULT 0,
			tokens_per_sec REAL NOT NULL DEFAULT 0
		);

		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);
	`); err != nil {
		return err
	}

	if _, err := d.conn.Exec(`
		CREATE TABLE IF NOT EXISTS provider_models (
			id TEXT PRIMARY KEY,
			provider_id TEXT NOT NULL,
			name TEXT NOT NULL,
			display_name TEXT,
			created_at INTEGER NOT NULL,
			UNIQUE(provider_id, name)
		)
	`); err != nil {
		return err
	}

	// Keep an existing local database compatible with the current schema.
	// This only repairs missing columns; application data is left untouched.
	if err := d.ensureColumn("providers", "api_key_env", "TEXT"); err != nil {
		return err
	}
	if err := d.ensureColumn("providers", "headers_json", "TEXT"); err != nil {
		return err
	}
	for _, column := range []struct{ name, definition string }{
		{"model", "TEXT NOT NULL DEFAULT ''"},
		{"request_type", "TEXT NOT NULL DEFAULT 'text'"},
		{"system_prompt", "TEXT NOT NULL DEFAULT ''"},
		{"image_data", "TEXT NOT NULL DEFAULT ''"},
		{"completed_at", "INTEGER"},
		{"error_text", "TEXT NOT NULL DEFAULT ''"},
		{"first_token_ms", "INTEGER NOT NULL DEFAULT 0"},
		{"input_tokens", "INTEGER NOT NULL DEFAULT 0"},
		{"output_tokens", "INTEGER NOT NULL DEFAULT 0"},
		{"total_tokens", "INTEGER NOT NULL DEFAULT 0"},
		{"tokens_per_sec", "REAL NOT NULL DEFAULT 0"},
	} {
		if err := d.ensureColumn("executions", column.name, column.definition); err != nil {
			return err
		}
	}
	if _, err := d.conn.Exec(`UPDATE providers SET headers_json='{}' WHERE headers_json IS NULL OR TRIM(headers_json)=''`); err != nil {
		return err
	}

	// Seed defaults exactly once. The previous implementation used INSERT OR IGNORE on every startup,
	// which caused user-deleted default providers/models to come back on the next launch.
	seeded, err := d.GetSetting("default_seeded", "")
	if err != nil {
		return err
	}
	if seeded == "1" {
		return nil
	}

	var providerCount int
	if err := d.conn.QueryRow(`SELECT COUNT(1) FROM providers`).Scan(&providerCount); err != nil {
		return err
	}
	if providerCount > 0 {
		// Existing installations were already initialized before this marker existed.
		// Do not re-add defaults; only mark the database as initialized.
		return d.SaveSetting("default_seeded", "1")
	}

	now := time.Now().Unix()
	if _, err := d.conn.Exec(`
		INSERT INTO providers
		  (id,name,kind,base_url,credential_ref,api_key_env,headers_json,created_at)
		VALUES
		  ('openai','OpenAI','openai_compatible','https://api.openai.com/v1',
		   'openai_api_key','EVOCA_OPENAI_API_KEY','{}',?),
		  ('ollama','Ollama','ollama','http://localhost:11434',
		   '','','{}',?)
	`, now, now); err != nil {
		return err
	}
	if _, err := d.conn.Exec(`
		INSERT INTO provider_models (id,provider_id,name,display_name,created_at)
		VALUES
		  ('openai-gpt-5','openai','gpt-5','GPT-5',?),
		  ('openai-gpt-5-mini','openai','gpt-5-mini','GPT-5 Mini',?),
		  ('ollama-llama3','ollama','llama3','Llama 3',?)
	`, now, now, now); err != nil {
		return err
	}
	if _, err := d.conn.Exec(`
		INSERT INTO configurations
		  (id,name,description,icon,provider_id,model,spell,input_type,output_type,
		   temperature,max_tokens,created_at,updated_at)
		VALUES
		  ('translate','Translate','Translate text to Persian','✦','openai','gpt-5',
		   'Translate the user input accurately into Persian. Preserve formatting.',
		   'text','text',0.2,2000,?,?)
	`, now, now); err != nil {
		return err
	}
	return d.SaveSetting("default_seeded", "1")
}

func (d *DB) ensureColumn(table, column, definition string) error {
	rows, err := d.conn.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name, colType string
		var notNull, pk int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultValue, &pk); err != nil {
			return err
		}
		if strings.EqualFold(name, column) {
			return nil
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	_, err = d.conn.Exec(`ALTER TABLE ` + table + ` ADD COLUMN ` + column + ` ` + definition)
	return err
}

func (d *DB) GetSetting(key, fallback string) (string, error) {
	var value string
	err := d.conn.QueryRow(`SELECT value FROM settings WHERE key=?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return fallback, nil
	}
	return value, err
}

func (d *DB) SaveSetting(key, value string) error {
	_, err := d.conn.Exec(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, key, value)
	return err
}

func (d *DB) ListConfigurations() ([]Configuration, error) {
	rows, err := d.conn.Query(`
		SELECT id,name,description,icon,provider_id,model,spell,input_type,output_type,
		       temperature,max_tokens,created_at,updated_at
		FROM configurations ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Configuration
	for rows.Next() {
		var s Configuration
		if err := rows.Scan(
			&s.ID, &s.Name, &s.Description, &s.Icon, &s.ProviderID, &s.Model, &s.Spell,
			&s.InputType, &s.OutputType, &s.Temperature, &s.MaxTokens, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (d *DB) GetConfiguration(id string) (Configuration, error) {
	var s Configuration
	err := d.conn.QueryRow(`
		SELECT id,name,description,icon,provider_id,model,spell,input_type,output_type,
		       temperature,max_tokens,created_at,updated_at
		FROM configurations WHERE id=?
	`, id).Scan(
		&s.ID, &s.Name, &s.Description, &s.Icon, &s.ProviderID, &s.Model, &s.Spell,
		&s.InputType, &s.OutputType, &s.Temperature, &s.MaxTokens, &s.CreatedAt, &s.UpdatedAt,
	)
	return s, err
}

func (d *DB) SaveConfiguration(s Configuration) error {
	now := time.Now().Unix()
	if s.ID == "" {
		s.ID = uuid.NewString()
	}
	if s.Name == "" {
		return fmt.Errorf("configuration name is required")
	}
	if s.ProviderID == "" {
		return fmt.Errorf("provider is required")
	}
	if strings.TrimSpace(s.Model) == "" {
		return fmt.Errorf("model is required")
	}

	var exists int
	if err := d.conn.QueryRow(`SELECT COUNT(1) FROM providers WHERE id=?`, s.ProviderID).Scan(&exists); err != nil {
		return err
	}
	if exists == 0 {
		return fmt.Errorf("provider %q does not exist", s.ProviderID)
	}

	var modelExists int
	if err := d.conn.QueryRow(`SELECT COUNT(1) FROM provider_models WHERE provider_id=? AND name=?`, s.ProviderID, strings.TrimSpace(s.Model)).Scan(&modelExists); err != nil {
		return err
	}
	if modelExists == 0 {
		return fmt.Errorf("model %q does not exist for provider %q", s.Model, s.ProviderID)
	}
	s.Model = strings.TrimSpace(s.Model)

	s.CreatedAt = now
	s.UpdatedAt = now

	_, err := d.conn.Exec(`
		INSERT INTO configurations (
		  id,name,description,icon,provider_id,model,spell,input_type,output_type,
		  temperature,max_tokens,created_at,updated_at
		) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
		  name=excluded.name,
		  description=excluded.description,
		  icon=excluded.icon,
		  provider_id=excluded.provider_id,
		  model=excluded.model,
		  spell=excluded.spell,
		  input_type=excluded.input_type,
		  output_type=excluded.output_type,
		  temperature=excluded.temperature,
		  max_tokens=excluded.max_tokens,
		  updated_at=excluded.updated_at
	`,
		s.ID, s.Name, s.Description, s.Icon, s.ProviderID, s.Model, s.Spell,
		s.InputType, s.OutputType, s.Temperature, s.MaxTokens, s.CreatedAt, s.UpdatedAt,
	)
	return err
}

func (d *DB) DeleteConfiguration(id string) error {
	_, err := d.conn.Exec(`DELETE FROM configurations WHERE id=?`, id)
	return err
}

func (d *DB) ListProviders() ([]Provider, error) {
	rows, err := d.conn.Query(`
		SELECT id,name,kind,
		       COALESCE(base_url, ''),
		       COALESCE(credential_ref, ''),
		       COALESCE(api_key_env, ''),
		       COALESCE(headers_json, '{}'),
		       created_at
		FROM providers ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Provider
	for rows.Next() {
		var r Provider
		if err := rows.Scan(&r.ID, &r.Name, &r.Kind, &r.BaseURL, &r.CredentialRef, &r.APIKeyEnv, &r.HeadersJSON, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (d *DB) GetProvider(id string) (Provider, error) {
	var r Provider
	err := d.conn.QueryRow(`
		SELECT id,name,kind,
		       COALESCE(base_url, ''),
		       COALESCE(credential_ref, ''),
		       COALESCE(api_key_env, ''),
		       COALESCE(headers_json, '{}'),
		       created_at
		FROM providers WHERE id=?
	`, id).Scan(&r.ID, &r.Name, &r.Kind, &r.BaseURL, &r.CredentialRef, &r.APIKeyEnv, &r.HeadersJSON, &r.CreatedAt)
	return r, err
}

func (d *DB) SaveProvider(r Provider) error {
	if r.ID == "" {
		r.ID = uuid.NewString()
	}
	if r.Name == "" {
		return fmt.Errorf("provider name is required")
	}
	if r.Kind == "" {
		r.Kind = "openai_compatible"
	}
	r.Name = strings.TrimSpace(r.Name)
	r.BaseURL = strings.TrimSpace(r.BaseURL)
	r.CredentialRef = strings.TrimSpace(r.CredentialRef)
	r.APIKeyEnv = strings.TrimSpace(r.APIKeyEnv)
	r.HeadersJSON = strings.TrimSpace(r.HeadersJSON)
	if r.HeadersJSON == "" {
		r.HeadersJSON = "{}"
	}
	var headers map[string]string
	if err := json.Unmarshal([]byte(r.HeadersJSON), &headers); err != nil {
		return fmt.Errorf("invalid custom headers JSON: %w", err)
	}
	if headers == nil {
		return fmt.Errorf("custom headers must be a JSON object")
	}
	r.CreatedAt = time.Now().Unix()

	_, err := d.conn.Exec(`
		INSERT INTO providers(
			id,name,kind,base_url,credential_ref,api_key_env,headers_json,created_at
		)
		VALUES(?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			name=excluded.name,
			kind=excluded.kind,
			base_url=excluded.base_url,
			credential_ref=excluded.credential_ref,
			api_key_env=excluded.api_key_env,
			headers_json=excluded.headers_json
	`,
		r.ID, r.Name, r.Kind, r.BaseURL, r.CredentialRef,
		r.APIKeyEnv, r.HeadersJSON, r.CreatedAt,
	)
	return err
}

func (d *DB) DeleteProvider(id string) error {
	var count int
	if err := d.conn.QueryRow(`SELECT COUNT(1) FROM configurations WHERE provider_id=?`, id).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf("provider %q is used by %d configuration(s); remove or reassign them first", id, count)
	}

	tx, err := d.conn.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.Exec(`DELETE FROM provider_models WHERE provider_id=?`, id); err != nil {
		return err
	}
	result, err := tx.Exec(`DELETE FROM providers WHERE id=?`, id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return fmt.Errorf("provider %q does not exist", id)
	}

	if err = tx.Commit(); err != nil {
		return err
	}
	return nil
}

func (d *DB) ListProviderModels(providerID string) ([]ProviderModel, error) {
	rows, err := d.conn.Query(`
		SELECT id,provider_id,name,COALESCE(display_name, name),created_at
		FROM provider_models WHERE provider_id=? ORDER BY COALESCE(display_name,name)
	`, providerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ProviderModel
	for rows.Next() {
		var m ProviderModel
		if err := rows.Scan(&m.ID, &m.ProviderID, &m.Name, &m.DisplayName, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (d *DB) SaveProviderModel(m ProviderModel) error {
	m.Name = strings.TrimSpace(m.Name)
	m.DisplayName = strings.TrimSpace(m.DisplayName)
	if m.ProviderID == "" {
		return fmt.Errorf("provider is required")
	}
	if m.Name == "" {
		return fmt.Errorf("model name is required")
	}

	var exists int
	if err := d.conn.QueryRow(`SELECT COUNT(1) FROM providers WHERE id=?`, m.ProviderID).Scan(&exists); err != nil {
		return err
	}
	if exists == 0 {
		return fmt.Errorf("provider %q does not exist", m.ProviderID)
	}

	if m.ID == "" {
		m.ID = uuid.NewString()
	}
	m.CreatedAt = time.Now().Unix()

	var duplicateID string
	err := d.conn.QueryRow(`
		SELECT id FROM provider_models
		WHERE provider_id=? AND name=? AND id<>?
	`, m.ProviderID, m.Name, m.ID).Scan(&duplicateID)
	if err == nil {
		return fmt.Errorf("model %q already exists for this provider", m.Name)
	}
	if err != sql.ErrNoRows {
		return err
	}

	_, err = d.conn.Exec(`
		INSERT INTO provider_models(id,provider_id,name,display_name,created_at)
		VALUES(?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			provider_id=excluded.provider_id,
			name=excluded.name,
			display_name=excluded.display_name
	`,
		m.ID, m.ProviderID, m.Name, m.DisplayName, m.CreatedAt,
	)
	return err
}

func (d *DB) DeleteProviderModel(id string) error {
	var providerID, name string
	err := d.conn.QueryRow(`SELECT provider_id,name FROM provider_models WHERE id=?`, id).Scan(&providerID, &name)
	if err == sql.ErrNoRows {
		return fmt.Errorf("model %q does not exist", id)
	}
	if err != nil {
		return err
	}

	var used int
	if err := d.conn.QueryRow(`SELECT COUNT(1) FROM configurations WHERE provider_id=? AND model=?`, providerID, name).Scan(&used); err != nil {
		return err
	}
	if used > 0 {
		return fmt.Errorf("model %q is used by %d configuration(s); reassign them first", name, used)
	}

	_, err = d.conn.Exec(`DELETE FROM provider_models WHERE id=?`, id)
	return err
}

func (d *DB) RecordExecution(configurationID, input, output, status string, duration int64) error {
	_, err := d.conn.Exec(`
		INSERT INTO executions(id,configuration_id,input,output,status,created_at,duration_ms)
		VALUES(?,?,?,?,?,?,?)
	`, uuid.NewString(), configurationID, input, output, status, time.Now().Unix(), duration)
	return err
}
