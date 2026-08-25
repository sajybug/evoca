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
	body := map[string]any{"model": req.Model, "stream": false, "messages": []map[string]string{{"role": "system", "content": req.Spell}, {"role": "user", "content": req.Input}}}
	payload, _ := json.Marshal(body)
	resp, err := http.Post(base+"/api/chat", "application/json", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
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
