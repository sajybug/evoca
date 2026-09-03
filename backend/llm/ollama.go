package llm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

type Ollama struct{ BaseURL string }

func (p Ollama) Generate(req Request) (string, error) {
	base := strings.TrimRight(p.BaseURL, "/")
	if base == "" {
		base = "http://localhost:11434"
	}
	user := map[string]any{"role": "user", "content": req.Input}
	if req.ImageBase64 != "" {
		user["images"] = []string{req.ImageBase64}
	}
	body := map[string]any{"model": req.Model, "stream": false, "messages": []map[string]any{{"role": "system", "content": req.Spell}, user}}
	payload, _ := json.Marshal(body)
	resp, err := http.Post(base+"/api/chat", "application/json", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("ollama returned HTTP %d", resp.StatusCode)
	}
	var out struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	return out.Message.Content, nil
}
