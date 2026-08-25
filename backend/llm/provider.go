package llm

import (
	"fmt"
	"strings"

	"github.com/evoca-dev/evoca/backend/db"
)

type Request struct {
	Model       string
	Spell       string
	Input       string
	Temperature *float32
	MaxTokens   *int64
	OutputType  string
}

type Provider interface {
	Generate(request Request) (string, error)
}
type Registry struct{}

func NewRegistry() *Registry { return &Registry{} }
func (r *Registry) Generate(provider db.Provider, request Request) (string, error) {
	switch strings.ToLower(provider.Kind) {
	case "openai_compatible":
		return OpenAICompatible{Provider: provider}.Generate(request)
	case "ollama":
		return Ollama{BaseURL: provider.BaseURL}.Generate(request)
	default:
		return "", fmt.Errorf("unsupported provider type: %s", provider.Kind)
	}
}
func (r *Registry) GenerateStream(provider db.Provider, request Request, onChunk ChunkFunc) (string, error) {
	switch strings.ToLower(provider.Kind) {
	case "openai_compatible":
		return streamOpenAI(provider, request, onChunk)
	case "ollama":
		return streamOllama(provider, request, onChunk)
	default:
		return "", fmt.Errorf("unsupported provider type: %s", provider.Kind)
	}
}
