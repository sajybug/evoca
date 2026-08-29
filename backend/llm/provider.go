package llm

import (
	"context"
	"fmt"
	"strings"

	"github.com/sajybug/evoca/backend/credentials"
	"github.com/sajybug/evoca/backend/db"
)

type Request struct {
	Model       string
	Spell       string
	Input       string
	Temperature *float32
	MaxTokens   *int64
	OutputType  string
	ImageBase64 string
}

type Provider interface {
	Generate(request Request) (string, error)
}
type Registry struct{ Credentials credentials.CredentialStore }

func NewRegistry() *Registry { return &Registry{Credentials: credentials.NewStore()} }
func (r *Registry) Generate(provider db.Provider, request Request) (string, error) {
	switch strings.ToLower(provider.Kind) {
	case "openai_compatible":
		return OpenAICompatible{Provider: provider, Credentials: r.Credentials}.Generate(request)
	case "ollama":
		return Ollama{BaseURL: provider.BaseURL}.Generate(request)
	default:
		return "", fmt.Errorf("unsupported provider type: %s", provider.Kind)
	}
}
func (r *Registry) GenerateStream(ctx context.Context, provider db.Provider, request Request, onChunk ChunkFunc) (StreamResult, error) {
	switch strings.ToLower(provider.Kind) {
	case "openai_compatible":
		return streamOpenAI(ctx, provider, request, onChunk, r.Credentials)
	case "ollama":
		return streamOllama(ctx, provider, request, onChunk)
	default:
		return StreamResult{}, fmt.Errorf("unsupported provider type: %s", provider.Kind)
	}
}
