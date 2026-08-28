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

### Phase 8 — Configuration details, provider discovery & LLM loading

- Configuration list now shows the Provider and Model alongside the configuration name and description.
- Configuration editing has an explicit Back action to return to the configuration list.
- Provider setup supports Test provider, Discover models, and adding discovered models for supported provider types.
- LLM execution now keeps an explicit loading state from Run until the stream completes, including an animated indicator while waiting for the first token and while chunks are arriving.
- The execution/input/result views include an explicit Back action so the user can return to the configuration list without closing eVoca.
- While an LLM request is running, the input controls and Run/Screenshot actions are replaced by one dedicated loading view so the UI does not appear split into a loading area plus an active Run footer.
- Loading behavior is reasoning-friendly: before visible output arrives, the UI uses a compact “Thinking…” state with elapsed seconds instead of a large indefinite spinner, then switches to live streamed output as soon as visible content arrives.
- Back actions use a white label.

### Phase 9 — Tailwind v4 UI rebuild

- Migrated the frontend styling pipeline to Tailwind CSS v4.3.3 using the official `@tailwindcss/vite` plugin.
- Rebuilt the visual system around a dark-first compact desktop-app treatment while keeping the existing eVoca brand mark and gold accent.
- Standardized panels, inputs, buttons, tabs, sidebars, history cards, loading states, screenshot preview, markdown output and scroll behavior for more consistent spacing, hierarchy and interaction states.
- Kept the minimal overlay interaction model, while giving Settings and History a denser app-like layout without changing their existing data flow or backend contracts.
- No new icon dependency was added to avoid unnecessary runtime/bundle overhead.
- Direction changed from simple dark utility UI to a more premium productivity-tool visual language.
- Preserved existing eVoca brand mark and dark/gold identity.
- Overlay is intentionally quiet/minimal; Settings and History use denser app-like layouts.
- Reduced visual noise, standardized surfaces, radii, borders, typography, buttons, fields, states, and selection overlays.

### Phase 10 — Full Frontend Redesign

- Completely redesigned the frontend visual system and primary UI surfaces while preserving the Wails/Go architecture and existing backend contracts.
- Reworked the launcher overlay into a compact configuration-first command palette with stronger hierarchy, configuration metadata, keyboard hints, and distinct input/loading/result states.
- Reworked Settings into a denser premium desktop-app workspace for General, Configurations, and Providers, including clearer configuration editing, provider management, and model management.
- Reworked History into a two-pane execution inspector with improved filtering, metadata cards, request/response sections, and screenshot inspection.
- Replaced the previous utility styling with a cohesive dark-first premium design system using the existing eVoca gold accent, standardized surfaces, controls, spacing, typography, and interaction states.
- No backend/data-flow changes were required for the redesign

### Phase 11 — Full Tailwind utility migration

- Removed frontend component-level semantic style classes from `frontend/src/styles/app.css`.
- Rebuilt the existing UI styling as Tailwind utility classes directly in the React/TSX markup, preserving the Phase 10 visual system, spacing, colors, borders, shadows, states, and responsive behavior.
- Kept only Tailwind theme/base rules plus animation keyframes and the non-visual Wails drag-region behavior in the stylesheet.
- No UI redesign or behavioral changes were introduced in this phase.

### Phase 12 — Storage picker, history deletion, backup/restore & request cancellation

- Replaced manual storage-path editing with native directory selection controls for the database and chat-image locations.
- Added single-entry and bulk History deletion, including cleanup of stored screenshot files.
- Added a dedicated Backup tab with local ZIP backup/restore for SQLite data plus History images; restore reopens the database in-place.
- Added real LLM request cancellation through context-aware HTTP streaming and a visible Cancel request action while waiting/generating.
- Fixed global hotkey re-entry so Settings/History state is reset while the window is hidden before the launcher is shown, preventing the previous screen from flashing.
- Streaming cancel control is placed directly below the explanatory streaming text.
- Destructive delete/restore confirmations use the native eVoca-styled modal instead of browser confirmation dialogs.
- The main launcher header includes a compact tray/minimize control that hides the window while leaving the system tray active.

---

### Phase 13 — Windows startup, provider persistence, scalable dropdowns & secure credentials, Tray click behavior

- Added a tray **Start eVoca with Windows** toggle backed by the per-user Windows Run registry entry.
- Fixed default provider/model reseeding: built-in defaults are seeded once for a fresh database and deleted defaults are no longer recreated on later launches.
- Replaced high-volume frontend native dropdowns with searchable, scroll-limited selectors so large provider/model/configuration lists remain usable.
- Removed the PowerShell screenshot capture path and implemented primary-screen capture through native Win32 user32/gdi32 APIs on Windows.
- Connected provider API-key storage to Windows Credential Manager; SQLite keeps only the credential reference, with environment variables retained as a fallback.
- Provider deletion also removes its stored Windows credential; screenshot capture remains Windows-only.
- Updated the tray integration so a native left-click toggles the eVoca overlay/window.
- Right-click explicitly opens the existing tray context menu, preserving Toggle, autostart, and Quit actions.
- Switched the systray dependency to a compatible fork that exposes native click callbacks.

### Phase 14 — Screenshot capture compositor timing fix & DWM cloak

- Hardened the screenshot capture transition by hiding the native eVoca window synchronously before the desktop capture begins.
- The first implementation relied on HWND visibility plus a compositor delay; this was superseded in Phase 15 because DWM can retain the previous transparent/frameless surface after the window becomes hidden.
- Fixed desktop screenshot contamination by cloaking the eVoca HWND with `DWMWA_CLOAK` before the native `BitBlt` capture, removing the stale Wails surface from Desktop Window Manager composition rather than relying on timing alone.
- Flushes DWM while the window is cloaked, captures the desktop, then un-cloaks eVoca before opening the fullscreen screenshot selector.
- Kept screenshot selection, preview, confirmation, and restore flows unchanged.

### Phase 15 - Markdown Rendering Enhancement

- Improve Markdown rendering with GFM tables, code blocks, syntax highlighting, and LaTeX math support.

### Phase 16 — Launcher configuration productivity

- Added History **Run Again** to replay the original input against the saved configuration, including stored screenshot requests.
- Added persistent **Pinned Configurations** and launcher sections for **Pinned**, ranked **Recent**, and remaining configurations.
- Recent ranking is persisted from actual usage with last-used time and execution count.
- Added **Duplicate Configuration** with a fresh ID, reset usage metadata, and collision-safe copy naming.
- Added automatic SQLite schema migration for the new configuration metadata fields.

### Phase 17 — Configuration views, chat model override & focus recovery

- Added persistent Grid/List switching for the launcher Configuration cards using local WebView storage.
- Added per-chat Model selection from the active Provider's available models without mutating the saved Configuration.
- Added **Stop generating** labeling for the existing generation-time cancellation control while leaving the Thinking **Cancel** behavior unchanged.
- Added WebView focus recovery when the overlay is shown or the app window regains focus to mitigate the first-click-after-deactivation issue.
- Extended the configuration streaming backend to accept a per-request Model override; no database migration is required.

### Phase 18 — Scoped backup/restore, richer defaults & native focus recovery

- Added two Backup/Restore scopes: Full program (database + History images + local settings/data) and Settings only (Providers, Provider Models, and Configurations). Machine secrets/API keys are never copied.
- Added multiple default Configurations (Translate, Summarize, Improve Writing) with versioned seeding so existing installations receive the new defaults once without overwriting user edits.
- Reworked Windows focus recovery to monitor the native cursor/window relationship while eVoca is visible, restoring native foreground focus when the pointer returns from another application so the first click is not consumed by activation; native file dialogs are not targeted because the cursor is no longer over the eVoca window.
- Backup save dialogs now default to timestamped filenames in the form `eVoca-backup-YYYY-MM-DD_HH-MM-SS.zip`.
- Native Backup Save/Open dialogs temporarily suppress the Windows focus-recovery watcher. This prevents the watcher from calling `SetForegroundWindow`/`SetActiveWindow` while a native file dialog owns activation, which can destabilize Wails/WebView2 and cause the app to exit around backup operations. The focus watcher remains active for normal app interaction after the dialog closes.
- Restoring either backup type completes the data operation first, closes the restore confirmation modal, then restarts the application so all restored state is reloaded cleanly.
- Full and settings restore are exclusive maintenance operations.
- Active LLM streams are cancelled and allowed to finish before the application DB connection is closed.
- Settings restore is performed against a separate maintenance SQLite connection while the normal app connection is closed.
- The normal SQLite pool uses one open connection with a short busy timeout to reduce transient lock contention.
- Settings restore validates providers/models/configuration references before modifying live data.
- Settings restore transactions always rollback on any failure until commit succeeds.
- Settings backups reject orphaned configurations so invalid restore payloads are not produced.

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
Phase 8 -> Configuration details, provider discovery & LLM loading -> Done
Phase 9 -> Tailwind v4 UI rebuild -> Done
Phase 10 -> Full Frontend Redesign -> Done
Phase 11 -> Full Tailwind utility migration -> Done
Phase 12 -> Storage picker, history deletion, backup/restore & request cancellation -> Done
Phase 13 -> Windows startup, provider persistence, scalable dropdowns & secure credentials, Tray click behavior -> Done
Phase 14 —> Screenshot capture compositor timing fix & DWM cloak -> Done
Phase 15 -> Markdown Rendering Enhancement -> Done
Phase 16 -> Launcher configuration productivity -> Done
Phase 17 -> Configuration views, chat model override & focus recovery -> Done
Phase 18 -> Scoped backup/restore, richer defaults & native focus recovery -> Done
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