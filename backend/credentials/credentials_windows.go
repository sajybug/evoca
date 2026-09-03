//go:build windows

package credentials

import (
	"errors"
	"fmt"
	"syscall"
	"unsafe"
)

const (
	credTypeGeneric = 1
	errorNotFound   = syscall.Errno(1168)
)

type credential struct {
	Flags              uint32
	Type               uint32
	TargetName         *uint16
	Comment            *uint16
	LastWritten        [8]byte
	CredentialBlobSize uint32
	CredentialBlob     *byte
	Persist            uint32
	AttributeCount     uint32
	Attributes         uintptr
	TargetAlias        *uint16
	UserName           *uint16
}

var advapi32 = syscall.NewLazyDLL("advapi32.dll")
var credReadProc = advapi32.NewProc("CredReadW")
var credWriteProc = advapi32.NewProc("CredWriteW")
var credDeleteProc = advapi32.NewProc("CredDeleteW")
var credFreeProc = advapi32.NewProc("CredFree")

const credPersistLocalMachine = 2

type WindowsCredentialStore struct{}

func NewStore() CredentialStore { return WindowsCredentialStore{} }

func (WindowsCredentialStore) Get(ref string) (string, error) {
	target, err := syscall.UTF16PtrFromString(normalizeTarget(ref))
	if err != nil {
		return "", err
	}
	var ptr unsafe.Pointer
	ok, _, callErr := credReadProc.Call(uintptr(unsafe.Pointer(target)), credTypeGeneric, 0, uintptr(unsafe.Pointer(&ptr)))
	if ok == 0 {
		var errno syscall.Errno
		if errors.As(callErr, &errno) && errno == errorNotFound {
			return "", fmt.Errorf("credential not found")
		}
		return "", fmt.Errorf("CredReadW failed: %w", callErr)
	}

	defer func() {
		_, _, _ = credFreeProc.Call(uintptr(ptr))
	}()

	c := (*credential)(ptr)
	if c.CredentialBlobSize == 0 || c.CredentialBlob == nil {
		return "", nil
	}
	blob := unsafe.Slice(c.CredentialBlob, int(c.CredentialBlobSize))
	return string(blob), nil
}

func (WindowsCredentialStore) Set(ref, value string) error {
	target, err := syscall.UTF16PtrFromString(normalizeTarget(ref))
	if err != nil {
		return err
	}
	blob := []byte(value)
	var blobPtr *byte
	if len(blob) > 0 {
		blobPtr = &blob[0]
	}
	c := credential{
		Type:               credTypeGeneric,
		TargetName:         target,
		CredentialBlobSize: uint32(len(blob)),
		CredentialBlob:     blobPtr,
		Persist:            credPersistLocalMachine,
	}
	ok, _, callErr := credWriteProc.Call(uintptr(unsafe.Pointer(&c)), 0)
	if ok == 0 {
		return fmt.Errorf("CredWriteW failed: %w", callErr)
	}
	return nil
}

func (WindowsCredentialStore) Delete(ref string) error {
	target, err := syscall.UTF16PtrFromString(normalizeTarget(ref))
	if err != nil {
		return err
	}
	ok, _, callErr := credDeleteProc.Call(uintptr(unsafe.Pointer(target)), credTypeGeneric, 0)
	if ok == 0 {
		var errno syscall.Errno
		if errors.As(callErr, &errno) && errno == errorNotFound {
			return nil
		}
		return fmt.Errorf("CredDeleteW failed: %w", callErr)
	}
	return nil
}

func normalizeTarget(ref string) string {
	return "eVoca/" + ref
}
