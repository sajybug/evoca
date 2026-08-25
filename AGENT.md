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

---

## Phase History

Only record durable architectural/product changes here. Do not append repetitive implementation notes.

### Phase 1 — RTL Results and Vision Screenshots

- Added automatic RTL/LTR direction detection for rendered LLM Markdown while keeping code blocks LTR.
- Added Overlay Screenshot flow: hide eVoca, capture the primary Windows display, select a screen region, crop it, and send the image with the prompt to the selected Configuration using the existing streaming result path.
- Added image payload support to OpenAI-compatible and Ollama providers; vision-capable models are required for image understanding.
- No database migration is required. Tests and build were intentionally not run for this delivery.
- Fixed screenshot selection so the captured screen remains visible as the fullscreen selection background instead of appearing black.
- Added a cropped screenshot preview with Cancel and Confirm & Send actions; the image is sent to the LLM only after confirmation.

---

## Current Roadmap

```text
Phase 0 -> RTL Results and Vision Screenshots -> Done
```

The completed phases are located here.


The exact next Phase may change; when it does, update the roadmap rather than keeping contradictory plans.

### Phase entry format

```md
### Phase N — Short Name

- Added/changed ...
- Added/changed ...
- Important compatibility/security/migration note, if any.
```

Do not copy entire implementation notes, file lists, debugging transcripts, or repeated rules into the Phase history.

---

## Definition of Done

A Phase is Done only when:

- implementation is complete;
- existing architecture is preserved;
- persistence migrations are handled where needed;
- existing Generate/Refine/Restore/Delete/Clear/Reload flows remain coherent;
- Design isolation is preserved;
- Frontend/Backend contracts agree;
- security-sensitive changes are reviewed;
- relevant tests/build checks have actually been run, or the delivery explicitly states they were not run;
- `AGENT.md` contains the new concise Phase entry.
- Added regression coverage for Markdown HTML extraction and Preview sanitization helpers.