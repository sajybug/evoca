package credentials

import "strings"

// CredentialStore abstracts the platform credential backend used by eVoca.
// On Windows this is backed by Windows Credential Manager.
type CredentialStore interface {
	Get(ref string) (string, error)
	Set(ref, value string) error
	Delete(ref string) error
}

// RefForProvider returns the deterministic credential target for a provider.
// The reference is internal and is never persisted in the provider model or
// exposed to the frontend.
func RefForProvider(providerID string) string {
	return "provider_" + strings.TrimSpace(providerID)
}
