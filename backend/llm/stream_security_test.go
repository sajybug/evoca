package llm

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sajybug/evoca/backend/db"
)

func TestStreamOpenAICustomHeadersCannotOverrideCredential(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer real-secret" {
			t.Fatalf("credential was overridden: %q", got)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\n"))
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer srv.Close()

	provider := db.Provider{
		Kind:        "openai_compatible",
		BaseURL:     srv.URL,
		HeadersJSON: `{"Authorization":"Bearer attacker-controlled"}`,
	}
	result, err := streamOpenAI(context.Background(), provider, Request{Model: "model", Input: "hello", Spell: "system"}, func(string) error { return nil }, testCredentialStore{value: "real-secret"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Text != "ok" {
		t.Fatalf("unexpected stream result %q", result.Text)
	}
}
