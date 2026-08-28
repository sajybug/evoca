package hotkey

import "testing"

func TestNormalizeHotkey(t *testing.T) {
	tests := map[string]string{
		"Ctrl+Space":       "Ctrl+Space",
		" ctrl + space ":   "Ctrl+Space",
		"CTRL+SHIFT+SPACE": "Ctrl+Shift+Space",
		"Alt+Space":        "Alt+Space",
		"Ctrl+Alt+Space":   "Ctrl+Alt+Space",
		"Unknown+Key":      "Unknown+Key",
	}
	for input, want := range tests {
		if got := normalize(input); got != want {
			t.Errorf("normalize(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestManagerRejectsUnsupportedHotkeyWithoutRegistering(t *testing.T) {
	m := NewManager()
	if err := m.Start("not-a-hotkey", nil); err == nil {
		t.Fatal("expected unsupported hotkey error")
	}
	if got := m.Current(); got != "Ctrl+Space" {
		t.Fatalf("Current() = %q after failed Start, want Ctrl+Space", got)
	}
}
