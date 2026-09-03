# eVoca

**eVoca is a Windows-first launcher for reusable AI configurations.**

Press a global hotkey, pick a configuration, enter your prompt, and get the result without leaving the application you are working in.

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

* Global `Ctrl + Space` launcher.
* Searchable, reusable AI configurations.
* Configurable system prompts, temperature, and max tokens.
* Provider and model management.
* OpenAI-compatible and Ollama providers.
* Execution history stored locally in SQLite.
* Screenshot capture and preview.
* System-tray operation.
* Go backend with a React + TypeScript frontend connected through Wails.

## Privacy and data handling

eVoca is a local-first desktop application. Provider requests are made only when you run a configuration or explicitly test or discover a provider.

Execution history can contain prompts, generated output, system prompts, provider and model information, and captured images. Treat full backups as sensitive files.

API keys are not included in settings or full backups. On Windows, credential references are stored separately through Windows Credential Manager when configured.

## Releases

Official Windows builds are published from Git tags. Release artifacts include a SHA-256 checksum file. Building from source remains available for contributors who prefer to build locally.

## Platform

eVoca currently targets **Windows 10/11** and uses WebView2 for the application UI.

Cross-platform support is not currently a project goal.

## Development

### Prerequisites

* Windows 10/11.
* Go 1.25 or newer.
* Node.js 20+ and npm.
* WebView2 runtime.
* Wails v2 CLI (2.13.x).
* `golangci-lint` v2.

### Install golangci-lint

Install `golangci-lint` with Go:

```bash
go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest
```

Make sure your Go binary directory is available in your `PATH`.

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

## Formatting, linting, and checks

Run the following commands from the repository root before submitting changes.

### Go formatting

```bash
golangci-lint fmt
```

### Go linting

```bash
golangci-lint run
```

### Go tests

```bash
go test -v ./backend/... ./internal/...
```

### Frontend checks

```bash
cd frontend
npm install
npm run format:check
npm run lint
```

Repository CI should run the same checks automatically.

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

Providers are first-class objects. A provider can define its name, type, base URL, credential reference, API key environment variable, custom headers, and available models.

Configure providers from **Settings → Providers → Add provider**.

Supported provider types are:

* `openai_compatible`
* `ollama`

## Credentials

eVoca does not store raw API keys in ordinary SQLite configuration data.

On Windows, provider API keys are stored through **Windows Credential Manager** when a credential reference is configured. Environment variables can also be used through the provider's configured API key environment variable.

API keys are not included in settings backups. Backups contain provider references and configuration data, but not the secret values themselves.

Never commit API keys or other secrets to the repository.

## Data storage

SQLite is used as the local source of truth for providers, configurations, executions, and application settings.

Execution history can contain user input, generated output, system prompts, provider and model information, and captured image data. Data remains local unless the user explicitly runs a configuration or tests or discovers a provider.

Full backups may contain the local SQLite database and history images. Settings-only backups contain configuration and provider data but do not contain API key values.

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow.

The project intentionally keeps its scope small. Avoid adding agents, MCP, RAG, accounts, cloud sync, marketplace features, or other large subsystems without an explicit product decision.

## Versioning

eVoca follows semantic versioning. The current baseline is **`v0.1.0`**.

## About the Name

The name **eVoca** is derived from the Latin *evocare* ("to call forth"), chosen to describe the app's function of quickly calling up specific AI configurations.

## License

eVoca is licensed under the [MIT License](LICENSE).
