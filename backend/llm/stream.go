package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/sajybug/evoca/backend/credentials"
	"github.com/sajybug/evoca/backend/db"
)

type ChunkFunc func(string) error

func streamOllama(ctx context.Context, provider db.Provider, req Request, onChunk ChunkFunc) (StreamResult, error) {
	started := time.Now()
	base := strings.TrimRight(provider.BaseURL, "/")
	if base == "" {
		base = "http://localhost:11434"
	}
	user := map[string]any{"role": "user", "content": req.Input}
	if req.ImageBase64 != "" {
		user["images"] = []string{req.ImageBase64}
	}
	body := map[string]any{"model": req.Model, "stream": true, "messages": []map[string]any{{"role": "system", "content": req.Spell}, user}}
	payload, _ := json.Marshal(body)
	hreq, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/api/chat", bytes.NewReader(payload))
	if err != nil {
		return StreamResult{}, err
	}
	hreq.Header.Set("Content-Type", "application/json")
	resp, err := providerStreamHTTPClient.Do(hreq)
	if err != nil {
		return StreamResult{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return StreamResult{}, fmt.Errorf("ollama returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var full strings.Builder
	firstTokenMs := int64(0)
	metrics := Metrics{}
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 4096), 4*1024*1024)
	for sc.Scan() {
		var item struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			Done            bool  `json:"done"`
			PromptEvalCount int64 `json:"prompt_eval_count"`
			EvalCount       int64 `json:"eval_count"`
			TotalDuration   int64 `json:"total_duration"`
			EvalDuration    int64 `json:"eval_duration"`
		}
		if err := json.Unmarshal(sc.Bytes(), &item); err != nil {
			return StreamResult{}, err
		}
		if item.Message.Content != "" {
			if firstTokenMs == 0 {
				firstTokenMs = time.Since(started).Milliseconds()
			}
			full.WriteString(item.Message.Content)
			if err := onChunk(item.Message.Content); err != nil {
				return StreamResult{}, err
			}
		}
		if item.Done {
			metrics.InputTokens = item.PromptEvalCount
			metrics.OutputTokens = item.EvalCount
			metrics.TotalTokens = item.PromptEvalCount + item.EvalCount
			if item.TotalDuration > 0 {
				metrics.DurationMs = item.TotalDuration / int64(time.Millisecond)
			} else {
				metrics.DurationMs = time.Since(started).Milliseconds()
			}
			if item.EvalDuration > 0 && item.EvalCount > 0 {
				metrics.TokensPerSec = float64(item.EvalCount) / (float64(item.EvalDuration) / float64(time.Second))
			}
		}
	}
	if err := sc.Err(); err != nil {
		return StreamResult{}, err
	}
	if metrics.DurationMs == 0 {
		metrics.DurationMs = time.Since(started).Milliseconds()
	}
	metrics.FirstTokenMs = firstTokenMs
	return StreamResult{Text: full.String(), Metrics: metrics}, nil
}

func streamOpenAI(ctx context.Context, provider db.Provider, req Request, onChunk ChunkFunc, store credentials.CredentialStore) (StreamResult, error) {
	started := time.Now()
	envName := provider.APIKeyEnv
	if envName == "" {
		ref := provider.CredentialRef
		if ref == "" {
			ref = "openai_api_key"
		}
		envName = "EVOCA_" + strings.ToUpper(ref)
	}
	var userContent any = req.Input
	if req.ImageBase64 != "" {
		userContent = []map[string]any{{"type": "text", "text": req.Input}, {"type": "image_url", "image_url": map[string]string{"url": "data:image/png;base64," + req.ImageBase64}}}
	}
	body := map[string]any{"model": req.Model, "stream": true, "messages": []map[string]any{{"role": "system", "content": req.Spell}, {"role": "user", "content": userContent}}, "temperature": valueOr(req.Temperature, .2), "stream_options": map[string]any{"include_usage": true}}
	if req.MaxTokens != nil {
		body["max_tokens"] = *req.MaxTokens
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return StreamResult{}, err
	}
	base := strings.TrimRight(provider.BaseURL, "/")
	if base == "" {
		base = "https://api.openai.com/v1"
	}
	hreq, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return StreamResult{}, err
	}
	apiKey := os.Getenv(envName)
	if apiKey == "" && store != nil && provider.CredentialRef != "" {
		if stored, err := store.Get(provider.CredentialRef); err == nil {
			apiKey = stored
		}
	}
	if provider.HeadersJSON != "" && provider.HeadersJSON != "{}" {
		var hs map[string]string
		if err := json.Unmarshal([]byte(provider.HeadersJSON), &hs); err != nil {
			return StreamResult{}, fmt.Errorf("invalid custom headers JSON: %w", err)
		}
		for k, v := range hs {
			hreq.Header.Set(k, v)
		}
	}

	// Application-owned headers are applied last so custom headers cannot
	// replace the credential used for this request.
	hreq.Header.Set("Content-Type", "application/json")
	hreq.Header.Set("Accept", "text/event-stream")
	if apiKey != "" {
		hreq.Header.Set("Authorization", "Bearer "+apiKey)
	}
	resp, err := providerStreamHTTPClient.Do(hreq)
	if err != nil {
		return StreamResult{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return StreamResult{}, fmt.Errorf("provider returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var full strings.Builder
	firstTokenMs := int64(0)
	metrics := Metrics{}
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 4096), 4*1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || line == "data: [DONE]" {
			continue
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		var item struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
			Usage *struct {
				PromptTokens     int64 `json:"prompt_tokens"`
				CompletionTokens int64 `json:"completion_tokens"`
				TotalTokens      int64 `json:"total_tokens"`
			} `json:"usage"`
		}
		if err := json.Unmarshal([]byte(data), &item); err != nil {
			return StreamResult{}, err
		}
		if item.Usage != nil {
			metrics.InputTokens = item.Usage.PromptTokens
			metrics.OutputTokens = item.Usage.CompletionTokens
			metrics.TotalTokens = item.Usage.TotalTokens
		}
		if len(item.Choices) > 0 && item.Choices[0].Delta.Content != "" {
			c := item.Choices[0].Delta.Content
			if firstTokenMs == 0 {
				firstTokenMs = time.Since(started).Milliseconds()
			}
			full.WriteString(c)
			if err := onChunk(c); err != nil {
				return StreamResult{}, err
			}
		}
	}
	if err := sc.Err(); err != nil {
		return StreamResult{}, err
	}
	metrics.DurationMs = time.Since(started).Milliseconds()
	metrics.FirstTokenMs = firstTokenMs
	if metrics.OutputTokens > 0 && metrics.DurationMs > 0 {
		metrics.TokensPerSec = float64(metrics.OutputTokens) / (float64(metrics.DurationMs) / 1000)
	}
	return StreamResult{Text: full.String(), Metrics: metrics}, nil
}
