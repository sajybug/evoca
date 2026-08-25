package hotkey

import (
    "fmt"
    "strings"
    "sync"

    "golang.design/x/hotkey"
)

// Manager owns the single global toggle hotkey. The UI exposes a small,
// reliable set of common combinations so users can change it without
// depending on platform-specific key names.
type Manager struct {
    mu       sync.Mutex
    hk       *hotkey.Hotkey
    stop     chan struct{}
    stopOnce sync.Once
    combo    string
    onPress  func()
}

var presets = map[string][]hotkey.Modifier{
    "Ctrl+Space":       {hotkey.ModCtrl},
    "Ctrl+Shift+Space": {hotkey.ModCtrl, hotkey.ModShift},
    "Alt+Space":        {hotkey.ModAlt},
    "Ctrl+Alt+Space":   {hotkey.ModCtrl, hotkey.ModAlt},
}

func NewManager() *Manager { return &Manager{} }

func (m *Manager) Start(combo string, onPress func()) error {
    m.mu.Lock()
    defer m.mu.Unlock()
    if m.hk != nil {
        return nil
    }
    modifiers, ok := presets[normalize(combo)]
    if !ok {
        return fmt.Errorf("unsupported hotkey %q", combo)
    }
    return m.startLocked(normalize(combo), modifiers, onPress)
}

func (m *Manager) Set(combo string) error {
    combo = normalize(combo)
    modifiers, ok := presets[combo]
    if !ok {
        return fmt.Errorf("unsupported hotkey %q", combo)
    }

    m.mu.Lock()
    defer m.mu.Unlock()
    if m.combo == combo && m.hk != nil {
        return nil
    }
    if m.hk != nil {
        _ = m.stopLocked()
    }
    return m.startLocked(combo, modifiers, m.onPress)
}

func (m *Manager) Current() string {
    m.mu.Lock()
    defer m.mu.Unlock()
    if m.combo == "" {
        return "Ctrl+Space"
    }
    return m.combo
}

func (m *Manager) startLocked(combo string, modifiers []hotkey.Modifier, onPress func()) error {
    hk := hotkey.New(modifiers, hotkey.KeySpace)
    if err := hk.Register(); err != nil {
        return fmt.Errorf("register %s: %w", combo, err)
    }
    m.hk = hk
    m.stop = make(chan struct{})
    m.stopOnce = sync.Once{}
    m.combo = combo
    m.onPress = onPress

    go func() {
        for {
            select {
            case <-hk.Keydown():
                if m.onPress != nil {
                    m.onPress()
                }
            case <-m.stop:
                return
            }
        }
    }()
    return nil
}

func (m *Manager) stopLocked() error {
    m.stopOnce.Do(func() {
        if m.stop != nil {
            close(m.stop)
        }
    })
    var err error
    if m.hk != nil {
        err = m.hk.Unregister()
    }
    m.hk = nil
    m.stop = nil
    return err
}

func (m *Manager) Stop() error {
    m.mu.Lock()
    defer m.mu.Unlock()
    return m.stopLocked()
}

func normalize(s string) string {
    s = strings.ReplaceAll(strings.TrimSpace(s), " ", "")
    switch strings.ToLower(s) {
    case "ctrl+space": return "Ctrl+Space"
    case "ctrl+shift+space": return "Ctrl+Shift+Space"
    case "alt+space": return "Alt+Space"
    case "ctrl+alt+space": return "Ctrl+Alt+Space"
    default: return s
    }
}
