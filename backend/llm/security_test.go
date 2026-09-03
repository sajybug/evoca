package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sajybug/evoca/backend/credentials"
	"github.com/sajybug/evoca/backend/db"
)

type testCredentialStore struct{ value string }

func (s testCredentialStore) Get(string) (string, error) { return s.value, nil }
func (s testCredentialStore) Set(string, string) error   { return nil }
func (s testCredentialStore) Delete(string) error        { return nil }

var _ credentials.CredentialStore = testCredentialStore{}

func TestOpenAICustomHeadersCannotOverrideCredential(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer real-secret" {
			t.Fatalf("credential was overridden: %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]string{"content": "ok"}}},
		})
	}))
	defer srv.Close()

	provider := db.Provider{
		Kind:          "openai_compatible",
		BaseURL:       srv.URL,
		CredentialRef: "test-key",
		HeadersJSON:   `{"Authorization":"Bearer attacker-controlled"}`,
	}
	client := OpenAICompatible{Provider: provider, Credentials: testCredentialStore{value: "real-secret"}}
	result, err := client.Generate(context.Background(), Request{Model: "model", Input: "hello", Spell: "system"})
	if err != nil {
		t.Fatal(err)
	}
	if result != "ok" {
		t.Fatalf("unexpected result %q", result)
	}
}
