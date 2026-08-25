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

### Phase 2 — Screenshot Preview Fix

- Fixed screenshot selection so the captured screen remains visible as the fullscreen selection background instead of appearing black.
- Added a cropped screenshot preview with Cancel and Confirm & Send actions; the image is sent to the LLM only after confirmation.

### Phase 3 — Execution History & Chat Inspector

- Added persistent execution history for text and screenshot requests in SQLite.
- History records retain configuration/provider/model, prompt, system prompt, screenshot payload when present, response, status/error, timestamps, duration, first-token latency, token usage and tokens/sec when supplied by the provider.
- Added paginated history APIs with free-text search and filters by status, input type and configuration.
- Added a History panel to the overlay with searchable/filterable execution list and a full execution detail view.
- OpenAI-compatible streaming requests ask for usage metadata when supported; Ollama streaming captures prompt/eval token counters and evaluation speed when supplied.

### Phase 4 — History reliability, hotkey guard & configurable storage

- Hardened the global hotkey callback against duplicate/re-entrant trigger events during modifier transitions.
- Made execution history queries resilient to deleted/missing configurations/providers by using left joins and readable fallback names.
- Added configurable database and screenshot-image storage paths through bootstrap storage settings.
- New screenshot images are persisted as PNG files under the configured image directory; history detail reads them back for display.
- Added General Settings controls for database and chat-image paths. Path changes are saved immediately and require an application restart to reopen the database at the new database path.
- Added a manual History refresh action and null-safe history-page handling.

### Phase 5 — History execution model persistence fix

- Fixed History loading failure caused by history queries reading `executions.model` while older schemas had no model column.
- Added an idempotent `model` migration and persist the selected model at execution start so history retains the exact model used at request time.
- Existing text and screenshot execution paths now provide the model when recording history; older rows remain readable with an empty model value.
- History UI now surfaces backend load errors instead of silently displaying an empty `No executions found` state.

### Phase 6 — Hotkey Escape fix & draggable frameless window

- Fixed Overlay keyboard handling so only the actual Escape key closes/cancels the current view; modifier keys such as Ctrl no longer hide the app.
- Added Wails frameless-window drag handles to the Overlay, History and Settings headers, while keeping buttons and interactive controls non-draggable.
- Uses Wails CSS drag regions (`--wails-draggable: drag` / `no-drag`) for native window movement.

### Phase 7 — Hidden screenshot capture process

- Fixed Windows screenshot capture so the PowerShell helper process runs with its console window hidden.
- Prevents the terminal from appearing over the desktop during capture and from being included in the captured image.
- Screenshot selection / preview / confirm flow remains unchanged.

---

## Current Roadmap

The completed phases are located here.

```text
Phase 1 -> RTL Results and Vision Screenshots -> Done
Phase 2 -> Screenshot Preview Fix -> Done
Phase 3 -> Execution History & Chat Inspector -> Done
Phase 4 -> History reliability, hotkey guard & configurable storage -> Done
Phase 5 -> History execution model persistence fix -> Done
Phase 6 -> Hotkey Escape fix & draggable frameless window -> Done
Phase 7 -> Hidden screenshot capture process -> Done
```

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