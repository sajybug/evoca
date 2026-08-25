# eVoca

eVoca is a system-tray AI assistant that provides quick access to pre-configured AI templates using a global hotkey.

### How it works
1. **Trigger:** Press your configured global hotkey.
2. **Select:** A window appears with your saved templates.
3. **Chat:** Select a template to start an AI conversation with a pre-set system prompt.

### Features
* **Global Hotkey:** Access the app from any window.
* **Template System:** Store custom system prompts for different tasks (e.g., coding, translation, summarizing).
* **System Tray:** Runs in the background with minimal overhead.
* **Focus:** Designed for quick interaction without leaving your current workspace.

## Stack

- Wails v2.13.0
- Go
- React + TypeScript + Vite
- SQLite via `modernc.org/sqlite`
- Global hotkey via `golang.design/x/hotkey`
- WebView2 on Windows

## Product terminology

The user-facing UI deliberately uses standard productivity terminology:

- Configuration
- Provider
- Model
- System Prompt
- Settings
- Run
- Result
- History

The magical identity of the project is branding only and should not add cognitive load to daily use.

## MVP features in this version

- Ctrl+Space overlay.
- Searchable configuration list.
- Create a new configuration.
- Edit an existing configuration.
- Select provider and model.
- Define System Prompt.
- Configure temperature and max tokens.
- Save/delete configurations in SQLite.
- Run a configuration against the configured LLM.
- Copy the result.
- Explicit `Exit eVoca` action from Settings.
- OpenAI-compatible and Ollama provider abstractions.

## Configuration model

```text
Configuration
├── Name
├── Description
├── Provider
├── Model
├── System Prompt
├── Input Type
├── Output Type
├── Temperature
├── Max Tokens
└── Future: Shortcut / Input Source / Output Target
```

## Architecture

```text
Windows
  │
  ├── Ctrl + Space
  │
  ▼
Wails Window
  │
  ▼
React / TypeScript
  │
  └── Generated Wails bindings
          │
          ▼
        Go App
        ├── SQLite
        ├── Hotkey
        ├── LLM Registry
        └── Credentials abstraction
               ├── OpenAI-compatible
               └── Ollama
```

The frontend does not call LLM providers directly. All provider calls go through Go.

## Secrets

The current MVP keeps credential references separate from SQLite data and uses environment variables for the temporary OpenAI credential path. Production should use Windows secure credential storage.

## Exit behavior

Wails v2 exposes `runtime.Quit(ctx)` for graceful application termination. eVoca exposes this through the Settings screen as `Exit eVoca`.

## Post-MVP

- Windows text selection capture.
- Replace-selection / paste output.
- Per-configuration shortcuts.
- Windows Credential Manager.
- Tray UI.
- Structured output.
- More providers.
- Input/output adapters.

Do not add agents, MCP, RAG, accounts, cloud sync, or marketplace features until the core launcher is solid.


## Providers

Providers are first-class objects and are managed separately from Configurations.

A provider can define:

- name
- type (`OpenAI compatible` or `Ollama`)
- base URL
- credential reference
- environment variable used for credentials
- custom HTTP headers
- a list of models

A Configuration selects exactly one Provider and one of its registered Models.

This makes custom endpoints and OpenAI-compatible services first-class instead of hard-coding a small provider list.


## Provider workflow

Use **Settings → Providers → Add provider**. A new provider appears immediately in the editor; enter its endpoint and credentials reference, add one or more models, then press **Save provider**.


Save operations validate required fields and surface backend errors directly in Settings instead of failing silently.

### About the Name
The name **eVoca** is derived from the Latin *evocare* (to call forth), chosen to describe the app's function of quickly calling up specific AI configurations.
