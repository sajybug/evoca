package db

type Configuration struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Icon        string   `json:"icon,omitempty"`
	ProviderID  string   `json:"providerId"`
	Model       string   `json:"model"`
	Spell       string   `json:"spell"`
	InputType   string   `json:"inputType"`
	OutputType  string   `json:"outputType"`
	Temperature *float32 `json:"temperature,omitempty"`
	MaxTokens   *int64   `json:"maxTokens,omitempty"`
	Pinned      bool     `json:"pinned"`
	LastUsedAt  int64    `json:"lastUsedAt"`
	UseCount    int64    `json:"useCount"`
	CreatedAt   int64    `json:"createdAt"`
	UpdatedAt   int64    `json:"updatedAt"`
}

type Provider struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	BaseURL     string `json:"baseUrl,omitempty"`
	HeadersJSON string `json:"headersJson,omitempty"`
	CreatedAt   int64  `json:"createdAt"`
}

type ProviderModel struct {
	ID          string `json:"id"`
	ProviderID  string `json:"providerId"`
	Name        string `json:"name"`
	DisplayName string `json:"displayName,omitempty"`
	CreatedAt   int64  `json:"createdAt"`
}
