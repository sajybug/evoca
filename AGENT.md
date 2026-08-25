# AGENT.md

## Mission

Build **eVoca** as a small Windows-first launcher for reusable LLM configurations.

Core loop:

```text
Hotkey → Configuration → Input → Run → Result
```

It is not a general-purpose chat client.

## Framework

Use **Wails v2** for the MVP.

Do not migrate to Wails v3 unless explicitly requested.

## User-facing language

Do not use fantasy vocabulary in normal UI or workflows.

Use:

- Configuration
- Provider
- Model
- System Prompt
- Settings
- Run
- Result
- History

The fantasy/magic concept is brand identity only.

## Backend responsibilities

Go owns:

- app lifecycle
- global shortcut
- window behavior
- SQLite
- configuration persistence
- provider abstraction
- LLM HTTP calls
- future secure credential storage
- Windows integration

## Frontend responsibilities

React/TypeScript owns:

- overlay UI
- search
- configuration editor
- settings UI
- input
- result display
- UI state

Never put provider-specific API logic in React.

## Configuration model

A reusable LLM configuration should contain at least:

```text
Name
Description
Provider
Model
System Prompt
Input Type
Output Type
Temperature
Max Tokens
```

Future fields:

```text
Shortcut
Input Source
Output Target
```

## Configuration management

Settings must support:

- create configuration
- edit configuration
- save configuration
- delete configuration
- select provider
- select model
- edit System Prompt

Do not require users to understand internal domain terminology.

## Application exit

The Settings screen must expose an explicit **Exit eVoca** action.

Use the Wails Go runtime:

```go
runtime.Quit(ctx)
```

Do not implement exit by merely hiding the window.

## Overlay

The primary interaction is:

```text
Ctrl + Space
  ↓
Search configurations
  ↓
Choose one
  ↓
Enter text
  ↓
Run
  ↓
Result
```

Escape should dismiss transient UI.

## Provider abstraction

Keep providers isolated behind a common interface.

Current implementations:

- OpenAI-compatible
- Ollama

The configuration model must not be tied to OpenAI.

## Database

SQLite is the local source of truth.

Current tables:

- providers
- configurations
- executions
- settings

The database is recreated from scratch when the schema changes; migrations are not required for the current MVP.

## Secrets

Never store raw API keys in ordinary SQLite columns.

The MVP may use environment variables as a temporary credential mechanism. Production should use Windows secure credential storage.

## Future selection workflow

Design toward:

```text
Selected text
  ↓
Configuration
  ↓
LLM
  ↓
Replace selection / Clipboard / Overlay
```

Future abstractions:

```text
InputSource
├── Manual
├── Clipboard
└── Selection

OutputTarget
├── Overlay
├── Clipboard
├── Paste
└── ReplaceSelection
```

## Scope control

Do not add without explicit direction:

- agents
- MCP
- RAG
- accounts
- sync
- marketplace
- plugin ecosystem
- complex chat sessions

## Development principle

Prefer one complete vertical slice over broad infrastructure.

A good increment is:

```text
One configuration
→ one input
→ one provider
→ one result
```


## Providers

Providers are managed entities, separate from Configurations.

Do not hard-code the supported provider list into the UI.

A Provider must support:

```text
Provider
├── name
├── type
├── base URL
├── credential reference
├── credential environment variable
├── custom headers
└── Models[]
```

A Configuration references:

```text
Configuration
├── Provider
├── Model
├── System Prompt
└── generation parameters
```

Adding a provider should not require a code change to the Configuration model.
