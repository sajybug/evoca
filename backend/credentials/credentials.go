package credentials

type CredentialStore interface {
	Get(ref string) (string, error)
	Set(ref, value string) error
	Delete(ref string) error
}
