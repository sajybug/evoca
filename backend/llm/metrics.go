package llm

type Metrics struct {
	DurationMs   int64
	FirstTokenMs int64
	InputTokens  int64
	OutputTokens int64
	TotalTokens  int64
	TokensPerSec float64
}

type StreamResult struct {
	Text    string
	Metrics Metrics
}
