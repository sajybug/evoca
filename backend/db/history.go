package db

import (
	"database/sql"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

type ExecutionMetrics struct {
	DurationMs   int64
	FirstTokenMs int64
	InputTokens  int64
	OutputTokens int64
	TotalTokens  int64
	TokensPerSec float64
}

type Execution struct {
	ID                string  `json:"id"`
	ConfigurationID   string  `json:"configurationId"`
	ConfigurationName string  `json:"configurationName"`
	ProviderName      string  `json:"providerName"`
	Model             string  `json:"model"`
	RequestType       string  `json:"requestType"`
	Input             string  `json:"input"`
	SystemPrompt      string  `json:"systemPrompt"`
	ImageData         string  `json:"imageData,omitempty"`
	Output            string  `json:"output"`
	Error             string  `json:"error,omitempty"`
	Status            string  `json:"status"`
	CreatedAt         int64   `json:"createdAt"`
	CompletedAt       int64   `json:"completedAt,omitempty"`
	DurationMs        int64   `json:"durationMs"`
	FirstTokenMs      int64   `json:"firstTokenMs"`
	InputTokens       int64   `json:"inputTokens"`
	OutputTokens      int64   `json:"outputTokens"`
	TotalTokens       int64   `json:"totalTokens"`
	TokensPerSec      float64 `json:"tokensPerSec"`
}

type ExecutionPage struct {
	Items      []Execution `json:"items"`
	Page       int         `json:"page"`
	PageSize   int         `json:"pageSize"`
	Total      int         `json:"total"`
	TotalPages int         `json:"totalPages"`
}

func (d *DB) RecordExecutionStart(configurationID, model, requestType, input, systemPrompt, imageData string) (string, error) {
	id := uuid.NewString()
	now := time.Now().UnixMilli()
	storedImage := imageData
	if imageData != "" && d.imageDir != "" {
		imagePath := filepath.Join(d.imageDir, id+".png")
		data, err := decodeBase64Image(imageData)
		if err != nil {
			return "", err
		}
		if err := os.WriteFile(imagePath, data, 0o644); err != nil {
			return "", err
		}
		storedImage = "@file:" + filepath.Base(imagePath)
	}
	_, err := d.conn.Exec(`
		INSERT INTO executions(id,configuration_id,model,input,output,status,created_at,duration_ms,
			request_type,system_prompt,image_data,completed_at,error_text,first_token_ms,input_tokens,output_tokens,total_tokens,tokens_per_sec)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
	`, id, configurationID, model, input, "", "running", now, 0, requestType, systemPrompt, storedImage, nil, "", 0, 0, 0, 0, 0)
	return id, err
}

func (d *DB) resolveExecutionImagePath(imageData string) string {
	if !strings.HasPrefix(imageData, "@file:") {
		return ""
	}
	ref := strings.TrimSpace(strings.TrimPrefix(imageData, "@file:"))
	if ref == "" || d.imageDir == "" {
		return ""
	}
	// New records store only the image filename, which makes backups portable.
	// Older databases stored absolute paths; keep using them when the original
	// file still exists, otherwise fall back to the same filename in the current
	// configured image directory after a full backup restore.
	if filepath.IsAbs(ref) {
		if _, err := os.Stat(ref); err == nil {
			return ref
		}
	}
	return filepath.Join(d.imageDir, filepath.Base(ref))
}

func (d *DB) CompleteExecution(id, output, status, errorText string, metrics ExecutionMetrics) error {
	completed := time.Now().UnixMilli()
	_, err := d.conn.Exec(`
		UPDATE executions SET output=?,status=?,completed_at=?,error_text=?,duration_ms=?,first_token_ms=?,
			input_tokens=?,output_tokens=?,total_tokens=?,tokens_per_sec=? WHERE id=?
	`, output, status, completed, errorText, metrics.DurationMs, metrics.FirstTokenMs,
		metrics.InputTokens, metrics.OutputTokens, metrics.TotalTokens, metrics.TokensPerSec, id)
	return err
}

func (d *DB) ListExecutions(page, pageSize int, search, status, requestType, configurationID string) (ExecutionPage, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	where := []string{"1=1"}
	args := make([]any, 0, 8)
	if q := strings.TrimSpace(search); q != "" {
		where = append(where, `(e.input LIKE ? OR e.output LIKE ? OR e.error_text LIKE ? OR c.name LIKE ? OR p.name LIKE ? OR e.model LIKE ?)`)
		like := "%" + q + "%"
		args = append(args, like, like, like, like, like, like)
	}
	if status != "" {
		where = append(where, "e.status=?")
		args = append(args, status)
	}
	if requestType != "" {
		where = append(where, "e.request_type=?")
		args = append(args, requestType)
	}
	if configurationID != "" {
		where = append(where, "e.configuration_id=?")
		args = append(args, configurationID)
	}
	whereSQL := strings.Join(where, " AND ")
	var total int
	if err := d.conn.QueryRow(`SELECT COUNT(*) FROM executions e LEFT JOIN configurations c ON c.id=e.configuration_id LEFT JOIN providers p ON p.id=c.provider_id WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return ExecutionPage{}, err
	}
	totalPages := 0
	if total > 0 {
		totalPages = int(math.Ceil(float64(total) / float64(pageSize)))
	}
	if totalPages > 0 && page > totalPages {
		page = totalPages
	}
	offset := (page - 1) * pageSize
	queryArgs := append(append([]any{}, args...), pageSize, offset)
	rows, err := d.conn.Query(`
		SELECT e.id,e.configuration_id,COALESCE(c.name,'Deleted configuration'),COALESCE(p.name,'Deleted provider'),e.model,e.request_type,e.input,e.system_prompt,
			'',e.output,COALESCE(e.error_text,''),e.status,e.created_at,COALESCE(e.completed_at,0),
			e.duration_ms,e.first_token_ms,e.input_tokens,e.output_tokens,e.total_tokens,e.tokens_per_sec
		FROM executions e LEFT JOIN configurations c ON c.id=e.configuration_id LEFT JOIN providers p ON p.id=c.provider_id
		WHERE `+whereSQL+` ORDER BY e.created_at DESC LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		return ExecutionPage{}, err
	}
	defer func() { _ = rows.Close() }()
	items := make([]Execution, 0)
	for rows.Next() {
		var x Execution
		if err := rows.Scan(&x.ID, &x.ConfigurationID, &x.ConfigurationName, &x.ProviderName, &x.Model, &x.RequestType,
			&x.Input, &x.SystemPrompt, &x.ImageData, &x.Output, &x.Error, &x.Status, &x.CreatedAt, &x.CompletedAt,
			&x.DurationMs, &x.FirstTokenMs, &x.InputTokens, &x.OutputTokens, &x.TotalTokens, &x.TokensPerSec); err != nil {
			return ExecutionPage{}, err
		}
		if strings.HasPrefix(x.ImageData, "@file:") {
			if encoded, err := encodeImageFile(d.resolveExecutionImagePath(x.ImageData)); err == nil {
				x.ImageData = encoded
			}
		}
		items = append(items, x)
	}
	if err := rows.Err(); err != nil {
		return ExecutionPage{}, err
	}
	return ExecutionPage{Items: items, Page: page, PageSize: pageSize, Total: total, TotalPages: totalPages}, nil
}

func (d *DB) DeleteExecution(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("execution id is required")
	}
	var imageData string
	if err := d.conn.QueryRow(`SELECT COALESCE(image_data,'') FROM executions WHERE id=?`, id).Scan(&imageData); err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("execution %q does not exist", id)
		}
		return err
	}
	if _, err := d.conn.Exec(`DELETE FROM executions WHERE id=?`, id); err != nil {
		return err
	}
	if strings.HasPrefix(imageData, "@file:") {
		_ = os.Remove(d.resolveExecutionImagePath(imageData))
	}
	return nil
}

func (d *DB) ClearExecutions() error {
	rows, err := d.conn.Query(`SELECT COALESCE(image_data,'') FROM executions`)
	if err != nil {
		return err
	}
	var imagePaths []string
	for rows.Next() {
		var imageData string
		if err := rows.Scan(&imageData); err != nil {
			defer func() { _ = rows.Close() }()
			return err
		}
		if strings.HasPrefix(imageData, "@file:") {
			imagePaths = append(imagePaths, d.resolveExecutionImagePath(imageData))
		}
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if _, err := d.conn.Exec(`DELETE FROM executions`); err != nil {
		return err
	}
	for _, path := range imagePaths {
		_ = os.Remove(path)
	}
	return nil
}

func (d *DB) GetExecution(id string) (Execution, error) {
	var x Execution
	err := d.conn.QueryRow(`
		SELECT e.id,e.configuration_id,COALESCE(c.name,'Deleted configuration'),COALESCE(p.name,'Deleted provider'),e.model,e.request_type,e.input,e.system_prompt,
			COALESCE(e.image_data,''),e.output,COALESCE(e.error_text,''),e.status,e.created_at,COALESCE(e.completed_at,0),
			e.duration_ms,e.first_token_ms,e.input_tokens,e.output_tokens,e.total_tokens,e.tokens_per_sec
		FROM executions e LEFT JOIN configurations c ON c.id=e.configuration_id LEFT JOIN providers p ON p.id=c.provider_id
		WHERE e.id=?`, id).Scan(&x.ID, &x.ConfigurationID, &x.ConfigurationName, &x.ProviderName, &x.Model, &x.RequestType,
		&x.Input, &x.SystemPrompt, &x.ImageData, &x.Output, &x.Error, &x.Status, &x.CreatedAt, &x.CompletedAt, &x.DurationMs, &x.FirstTokenMs,
		&x.InputTokens, &x.OutputTokens, &x.TotalTokens, &x.TokensPerSec)
	if strings.HasPrefix(x.ImageData, "@file:") {
		if encoded, readErr := encodeImageFile(d.resolveExecutionImagePath(x.ImageData)); readErr == nil {
			x.ImageData = encoded
		}
	}
	if err == sql.ErrNoRows {
		return Execution{}, fmt.Errorf("execution %q does not exist", id)
	}
	return x, err
}
