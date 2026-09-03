package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/sajybug/evoca/backend/credentials"
	"github.com/sajybug/evoca/backend/db"
)

type DiscoveredModel struct {
	Name        string
	DisplayName string
}

func TestProvider(provider db.Provider, store credentials.CredentialStore) error {
	_, err := DiscoverModels(provider, store)
	return err
}

func DiscoverModels(provider db.Provider, store credentials.CredentialStore) ([]DiscoveredModel, error) {
	switch strings.ToLower(provider.Kind) {
	case "openai_compatible":
		return discoverOpenAIModels(provider, store)
	case "ollama":
		return discoverOllamaModels(provider, store)
	default:
		return nil, fmt.Errorf("unsupported provider type: %s", provider.Kind)
	}
}

func providerHeaders(provider db.Provider, store credentials.CredentialStore) (map[string]string, error) {
	headers := map[string]string{}
	if provider.HeadersJSON != "" && provider.HeadersJSON != "{}" {
		if err := json.Unmarshal([]byte(provider.HeadersJSON), &headers); err != nil {
			return nil, fmt.Errorf("invalid custom headers JSON: %w", err)
		}
	}
	envName := provider.APIKeyEnv
	if envName == "" {
		keyRef := provider.CredentialRef
		if keyRef == "" {
			keyRef = "openai_api_key"
		}
		envName = "EVOCA_" + strings.ToUpper(keyRef)
	}
	key := os.Getenv(envName)
	if key == "" && store != nil && provider.CredentialRef != "" {
		if stored, err := store.Get(provider.CredentialRef); err == nil {
			key = stored
		}
	}
	if key != "" && strings.EqualFold(provider.Kind, "openai_compatible") {
		headers["Authorization"] = "Bearer " + key
	}
	return headers, nil
}

func doProviderGet(provider db.Provider, path string, store credentials.CredentialStore) ([]byte, error) {
	base := strings.TrimRight(provider.BaseURL, "/")
	if strings.EqualFold(provider.Kind, "ollama") {
		if base == "" {
			base = "http://localhost:11434"
		}
	} else {
		if base == "" {
			base = "https://api.openai.com/v1"
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+path, nil)
	if err != nil {
		return nil, err
	}
	headers, err := providerHeaders(provider, store)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := providerHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("provider returned HTTP %d", resp.StatusCode)
	}
	var buf bytes.Buffer
	if _, err := buf.ReadFrom(resp.Body); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func discoverOpenAIModels(provider db.Provider, store credentials.CredentialStore) ([]DiscoveredModel, error) {
	data, err := doProviderGet(provider, "/models", store)
	if err != nil {
		return nil, err
	}
	var result struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	models := make([]DiscoveredModel, 0, len(result.Data))
	for _, item := range result.Data {
		if strings.TrimSpace(item.ID) != "" {
			models = append(models, DiscoveredModel{Name: item.ID, DisplayName: item.ID})
		}
	}
	return models, nil
}

func discoverOllamaModels(provider db.Provider, store credentials.CredentialStore) ([]DiscoveredModel, error) {
	data, err := doProviderGet(provider, "/api/tags", store)
	if err != nil {
		return nil, err
	}
	var result struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	models := make([]DiscoveredModel, 0, len(result.Models))
	for _, item := range result.Models {
		if strings.TrimSpace(item.Name) != "" {
			models = append(models, DiscoveredModel{Name: item.Name, DisplayName: item.Name})
		}
	}
	return models, nil
}
