package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/sajybug/evoca/backend/credentials"
	"github.com/sajybug/evoca/backend/db"
)

type OpenAICompatible struct {
	Provider    db.Provider
	Credentials credentials.CredentialStore
}

func (p OpenAICompatible) Generate(ctx context.Context, req Request) (string, error) {
	envName := p.Provider.APIKeyEnv
	if envName == "" {
		keyRef := p.Provider.CredentialRef
		if keyRef == "" {
			keyRef = "openai_api_key"
		}
		envName = "EVOCA_" + strings.ToUpper(keyRef)
	}

	apiKey := os.Getenv(envName)
	if apiKey == "" && p.Credentials != nil && p.Provider.CredentialRef != "" {
		if stored, err := p.Credentials.Get(p.Provider.CredentialRef); err == nil {
			apiKey = stored
		}
	}

	userContent := any(req.Input)
	if req.ImageBase64 != "" {
		userContent = []map[string]any{
			{"type": "text", "text": req.Input},
			{"type": "image_url", "image_url": map[string]string{"url": "data:image/png;base64," + req.ImageBase64}},
		}
	}
	body := map[string]any{
		"model": req.Model,
		"messages": []map[string]any{
			{"role": "system", "content": req.Spell},
			{"role": "user", "content": userContent},
		},
		"temperature": valueOr(req.Temperature, 0.2),
	}
	if req.MaxTokens != nil {
		body["max_tokens"] = *req.MaxTokens
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return "", err
	}

	base := strings.TrimRight(p.Provider.BaseURL, "/")
	if base == "" {
		base = "https://api.openai.com/v1"
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	if p.Provider.HeadersJSON != "" && p.Provider.HeadersJSON != "{}" {
		var headers map[string]string
		if err := json.Unmarshal([]byte(p.Provider.HeadersJSON), &headers); err != nil {
			return "", fmt.Errorf("invalid custom headers JSON: %w", err)
		}
		for k, v := range headers {
			httpReq.Header.Set(k, v)
		}
	}

	// Application-owned headers are applied last so provider configuration
	// cannot silently replace the credential supplied by the credential store.
	httpReq.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := providerHTTPClient.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("provider returned HTTP %d", resp.StatusCode)
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("provider returned no choices")
	}
	return result.Choices[0].Message.Content, nil
}

func valueOr(value *float32, fallback float32) float32 {
	if value == nil {
		return fallback
	}
	return *value
}
