//go:build !windows

package credentials

import "fmt"

type unsupportedStore struct{}

func NewStore() CredentialStore { return unsupportedStore{} }
func (unsupportedStore) Get(string) (string, error) {
	return "", fmt.Errorf("Windows Credential Manager is available on Windows only")
}
func (unsupportedStore) Set(string, string) error {
	return fmt.Errorf("Windows Credential Manager is available on Windows only")
}
func (unsupportedStore) Delete(string) error {
	return fmt.Errorf("Windows Credential Manager is available on Windows only")
}
