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
	// SQLite is a single-file database. Keep one pooled connection and give
	// short-lived concurrent operations a small window to yield on locks.
	conn.SetMaxOpenConns(1)
	if _, err := conn.Exec(`PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;`); err != nil {
		_ = conn.Close()
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
			pinned INTEGER NOT NULL DEFAULT 0,
			last_used_at INTEGER NOT NULL DEFAULT 0,
			use_count INTEGER NOT NULL DEFAULT 0,
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
		{"pinned", "INTEGER NOT NULL DEFAULT 0"},
		{"last_used_at", "INTEGER NOT NULL DEFAULT 0"},
		{"use_count", "INTEGER NOT NULL DEFAULT 0"},
	} {
		if err := d.ensureColumn("configurations", column.name, column.definition); err != nil {
			return err
		}
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

	// Seed defaults through a versioned initializer. Existing installations get the
	// new default configurations once, while later startups leave user edits alone.
	seedVersion, err := d.GetSetting("default_seed_version", "")
	if err != nil {
		return err
	}
	if seedVersion == "3" {
		return nil
	}

	now := time.Now().Unix()

	if seedVersion == "" {
		var providerCount int
		if err := d.conn.QueryRow(`SELECT COUNT(1) FROM providers`).Scan(&providerCount); err != nil {
			return err
		}
		if providerCount == 0 {
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
		}
		if _, err := d.conn.Exec(`
			INSERT OR IGNORE INTO provider_models(id,provider_id,name,display_name,created_at)
			VALUES
			  ('openai-gpt-5','openai','gpt-5','GPT-5',?),
			  ('openai-gpt-5-mini','openai','gpt-5-mini','GPT-5 Mini',?),
			  ('ollama-llama3','ollama','llama3','Llama 3',?)
		`, now, now, now); err != nil {
			return err
		}
	}

	// Phase 18 adds multiple useful starter configurations. INSERT OR IGNORE keeps
	// existing user-edited configurations intact while adding only missing defaults.
	if _, err := d.conn.Exec(`
		INSERT OR IGNORE INTO configurations
		  (id,name,description,icon,provider_id,model,spell,input_type,output_type,
		   temperature,max_tokens,created_at,updated_at)
		VALUES
		  ('translate','Translate','Translate text to Persian','✦','openai','gpt-5',
		   'Translate the user input accurately into Persian. Preserve formatting and meaning.',
		   'text','text',0.2,2000,?,?),
		  ('summarize','Summarize','Summarize the input clearly and concisely','◆','openai','gpt-5-mini',
		   'Summarize the user input clearly. Keep the key facts and important context. Use concise language.',
		   'text','text',0.2,1200,?,?),
		  ('improve-writing','Improve Writing','Improve clarity, grammar, and style','◆','openai','gpt-5-mini',
		   'Improve the writing for clarity, grammar, flow, and tone while preserving the original meaning. Return only the improved text.',
		   'text','text',0.3,2000,?,?)
	`, now, now, now, now, now, now); err != nil {
		return err
	}

	// Repair the Phase 18 seed dependency graph on existing installations.
	// Earlier versions skipped provider seeding whenever any provider already existed,
	// which could leave the starter configurations pointing at a missing provider/model.
	if _, err := d.conn.Exec(`
		INSERT OR IGNORE INTO providers
		  (id,name,kind,base_url,credential_ref,api_key_env,headers_json,created_at)
		VALUES
		  ('openai','OpenAI','openai_compatible','https://api.openai.com/v1',
		   'openai_api_key','EVOCA_OPENAI_API_KEY','{}',?)
	`, now); err != nil {
		return err
	}
	if _, err := d.conn.Exec(`
		INSERT OR IGNORE INTO provider_models(id,provider_id,name,display_name,created_at)
		VALUES
		  ('openai-gpt-5','openai','gpt-5','GPT-5',?),
		  ('openai-gpt-5-mini','openai','gpt-5-mini','GPT-5 Mini',?)
	`, now, now); err != nil {
		return err
	}

	return d.SaveSetting("default_seed_version", "3")
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
		       temperature,max_tokens,pinned,last_used_at,use_count,created_at,updated_at
		FROM configurations
		ORDER BY pinned DESC, last_used_at DESC, use_count DESC, updated_at DESC, name COLLATE NOCASE
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
			&s.InputType, &s.OutputType, &s.Temperature, &s.MaxTokens, &s.Pinned, &s.LastUsedAt, &s.UseCount, &s.CreatedAt, &s.UpdatedAt,
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
		       temperature,max_tokens,pinned,last_used_at,use_count,created_at,updated_at
		FROM configurations WHERE id=?
	`, id).Scan(
		&s.ID, &s.Name, &s.Description, &s.Icon, &s.ProviderID, &s.Model, &s.Spell,
		&s.InputType, &s.OutputType, &s.Temperature, &s.MaxTokens, &s.Pinned, &s.LastUsedAt, &s.UseCount, &s.CreatedAt, &s.UpdatedAt,
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
		  temperature,max_tokens,pinned,last_used_at,use_count,created_at,updated_at
		) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
		s.InputType, s.OutputType, s.Temperature, s.MaxTokens, s.Pinned, s.LastUsedAt, s.UseCount, s.CreatedAt, s.UpdatedAt,
	)
	return err
}

func (d *DB) SetConfigurationPinned(id string, pinned bool) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("configuration id is required")
	}
	result, err := d.conn.Exec(`UPDATE configurations SET pinned=? WHERE id=?`, boolToInt(pinned), id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("configuration %q does not exist", id)
	}
	return nil
}

func (d *DB) MarkConfigurationUsed(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("configuration id is required")
	}
	_, err := d.conn.Exec(`UPDATE configurations SET last_used_at=?, use_count=use_count+1 WHERE id=?`, time.Now().UnixMilli(), id)
	return err
}

func (d *DB) DuplicateConfiguration(id string) (Configuration, error) {
	original, err := d.GetConfiguration(id)
	if err != nil {
		return Configuration{}, err
	}
	baseName := strings.TrimSpace(original.Name)
	name := "Copy of " + baseName
	for index := 2; ; index++ {
		var exists int
		if err := d.conn.QueryRow(`SELECT COUNT(1) FROM configurations WHERE name=?`, name).Scan(&exists); err != nil {
			return Configuration{}, err
		}
		if exists == 0 {
			break
		}
		name = fmt.Sprintf("Copy of %s (%d)", baseName, index)
	}
	duplicate := original
	duplicate.ID = uuid.NewString()
	duplicate.Name = name
	duplicate.Pinned = false
	duplicate.LastUsedAt = 0
	duplicate.UseCount = 0
	duplicate.CreatedAt = 0
	duplicate.UpdatedAt = 0
	if err := d.SaveConfiguration(duplicate); err != nil {
		return Configuration{}, err
	}
	return d.GetConfiguration(duplicate.ID)
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
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
