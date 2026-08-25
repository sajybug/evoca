package llm

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/evoca-dev/evoca/backend/db"
)

type ChunkFunc func(string) error

func streamOllama(provider db.Provider, req Request, onChunk ChunkFunc) (string, error) {
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
	hreq, err := http.NewRequest(http.MethodPost, base+"/api/chat", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	hreq.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(hreq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("ollama returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var full strings.Builder
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 4096), 4*1024*1024)
	for sc.Scan() {
		var item struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			Done bool `json:"done"`
		}
		if err := json.Unmarshal(sc.Bytes(), &item); err != nil {
			return "", err
		}
		if item.Message.Content != "" {
			full.WriteString(item.Message.Content)
			if err := onChunk(item.Message.Content); err != nil {
				return "", err
			}
		}
	}
	if err := sc.Err(); err != nil {
		return "", err
	}
	return full.String(), nil
}

func streamOpenAI(provider db.Provider, req Request, onChunk ChunkFunc) (string, error) {
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
		userContent = []map[string]any{
			{"type": "text", "text": req.Input},
			{"type": "image_url", "image_url": map[string]string{"url": "data:image/png;base64," + req.ImageBase64}},
		}
	}
	body := map[string]any{"model": req.Model, "stream": true, "messages": []map[string]any{{"role": "system", "content": req.Spell}, {"role": "user", "content": userContent}}, "temperature": valueOr(req.Temperature, .2)}
	if req.MaxTokens != nil {
		body["max_tokens"] = *req.MaxTokens
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	base := strings.TrimRight(provider.BaseURL, "/")
	if base == "" {
		base = "https://api.openai.com/v1"
	}
	hreq, err := http.NewRequest(http.MethodPost, base+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	hreq.Header.Set("Content-Type", "application/json")
	hreq.Header.Set("Accept", "text/event-stream")
	if key := os.Getenv(envName); key != "" {
		hreq.Header.Set("Authorization", "Bearer "+key)
	}
	if provider.HeadersJSON != "" && provider.HeadersJSON != "{}" {
		var hs map[string]string
		if err := json.Unmarshal([]byte(provider.HeadersJSON), &hs); err != nil {
			return "", fmt.Errorf("invalid custom headers JSON: %w", err)
		}
		for k, v := range hs {
			hreq.Header.Set(k, v)
		}
	}
	resp, err := http.DefaultClient.Do(hreq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("provider returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var full strings.Builder
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
		}
		if err := json.Unmarshal([]byte(data), &item); err != nil {
			return "", err
		}
		if len(item.Choices) > 0 && item.Choices[0].Delta.Content != "" {
			c := item.Choices[0].Delta.Content
			full.WriteString(c)
			if err := onChunk(c); err != nil {
				return "", err
			}
		}
	}
	if err := sc.Err(); err != nil {
		return "", err
	}
	return full.String(), nil
}
