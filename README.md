# eVoca

**eVoca is a Windows-first launcher for reusable AI configurations.**

Press a global hotkey, pick a configuration, enter your input, and get the result without leaving the application you are working in.

> **Status:** `v0.1.0` — early open-source release.

## What eVoca does

```text
Global Hotkey
     ↓
Configurations
     ↓
Input
     ↓
LLM Provider
     ↓
Result
```

eVoca is intentionally focused. It is not a general-purpose chat client and does not try to be one.

## Features

- Global `Ctrl + Space` launcher.
- Searchable, reusable AI configurations.
- Configurable system prompts, temperature, and max tokens.
- Provider and model management.
- OpenAI-compatible and Ollama providers.
- Execution history stored locally in SQLite.
- Screenshot capture and preview workflow.
- System-tray operation.
- Go backend with a React + TypeScript frontend connected through Wails.

## Screenshots

### Launcher

![eVoca launcher](assets/screenshots/launcher.png)

### Configuration editor

![Configuration editor](assets/screenshots/configuration-editor.png)

### Provider settings

![Provider settings](assets/screenshots/providers.png)

## Platform

eVoca currently targets **Windows 10/11** and uses WebView2 for the application UI.

Cross-platform support is not a current project goal.

## Development

### Prerequisites

- Windows 10/11.
- Go 1.25 or newer.
- Node.js and npm.
- WebView2 runtime.
- Wails v2 CLI.

### Run the frontend

```bash
cd frontend
npm install
npm run dev
```

### Build the frontend

```bash
cd frontend
npm install
npm run build
```

### Run the Wails application

From the repository root:

```bash
wails dev
```

To create a Windows production build:

```bash
wails build
```

## Formatting and linting

Go formatting uses the standard `gofmt` tool. Frontend formatting and linting use Prettier.

## Configuration and providers

A **Configuration** defines how an LLM request should be run:

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
└── Max Tokens
```

Providers are first-class objects. A provider can define its name, type, base URL, credential reference, credential environment variable, custom headers, and available models.

Configure providers from **Settings → Providers → Add provider**.

Supported provider types are:

- `openai_compatible`
- `ollama`

## Credentials

eVoca does not store raw API keys in ordinary SQLite configuration data.

On Windows, provider API keys are stored through **Windows Credential Manager** when a credential reference is configured. Environment variables can also be used through the provider's configured API-key environment variable.

API keys are not included in settings backups; backups contain provider references and configuration data, not the secret value itself.

Never commit API keys or other secrets to the repository.

## Data storage

SQLite is used as the local source of truth for providers, configurations, executions, and application settings.

Execution history can contain user input, generated output, system prompts, model/provider information, and captured image data. Data remains local unless a provider request is explicitly made by the user.

Full backups may contain the local SQLite database and history images. Settings-only backups contain configuration/provider data but do not contain API-key values.

## Architecture

```text
Windows
  │
  ├── Global Hotkey
  │
  ▼
Wails Window
  │
  ├── React / TypeScript UI
  │
  ▼
Go Application
  ├── SQLite
  ├── Hotkey manager
  ├── Provider registry
  ├── LLM clients
  └── Credentials abstraction
```

The frontend does not call LLM providers directly. Provider requests are handled by Go.

## Project structure

```text
.
├── backend/
│   ├── credentials/
│   ├── db/
│   ├── hotkey/
│   └── llm/
├── frontend/
│   └── src/
├── app.go
├── main.go
├── screenshot.go
├── tray.go
├── go.mod
└── wails.json
```

The root-level Go files intentionally remain in the main package because they are part of the Wails application entrypoint.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow.

The project intentionally keeps its scope small. Avoid adding agents, MCP, RAG, accounts, cloud sync, marketplace features, or other large subsystems without an explicit product decision.

## Versioning

eVoca follows semantic versioning. The current baseline is **`v0.1.0`**.

## About the Name

The name **eVoca** is derived from the Latin *evocare* (to call forth), chosen to describe the app's function of quickly calling up specific AI configurations.

## License

eVoca is licensed under the [MIT License](LICENSE).
