package credentials

type CredentialStore interface {
	Get(ref string) (string, error)
	Set(ref, value string) error
	Delete(ref string) error
}

// MVP intentionally leaves implementation abstract. Production should use Windows Credential Manager or equivalent secure storage.
