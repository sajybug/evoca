package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"sync"
	"time"

	"github.com/evoca-dev/evoca/backend/db"
	"github.com/evoca-dev/evoca/backend/hotkey"
	"github.com/evoca-dev/evoca/backend/llm"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx            context.Context
	database       *db.DB
	providers      *llm.Registry
	hotkey         *hotkey.Manager
	overlayVisible bool
	screenshotMu   sync.Mutex
	screenshotPNG  []byte
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	database, err := db.Open(ctx)
	if err != nil {
		runtime.LogError(ctx, "database init failed: "+err.Error())
		return
	}

	a.database = database
	a.providers = llm.NewRegistry()

	manager := hotkey.NewManager()
	combo, err := database.GetSetting("hotkey", "Ctrl+Space")
	if err != nil {
		combo = "Ctrl+Space"
	}
	if err := manager.Start(combo, func() {
		a.ToggleOverlay()
	}); err != nil {
		runtime.LogError(ctx, "hotkey registration failed: "+err.Error())
	}
	a.hotkey = manager
	a.startTray()
}

func (a *App) domReady(ctx context.Context) {
	runtime.WindowHide(ctx)
}

func (a *App) shutdown(ctx context.Context) {
	a.stopTray()
	if a.hotkey != nil {
		_ = a.hotkey.Stop()
	}
	if a.database != nil {
		_ = a.database.Close()
	}
}

func (a *App) ToggleOverlay() {
	if a.ctx == nil {
		return
	}

	if a.overlayVisible {
		a.HideOverlay()
		return
	}

	runtime.WindowShow(a.ctx)
	runtime.WindowSetAlwaysOnTop(a.ctx, true)
	runtime.WindowCenter(a.ctx)

	a.overlayVisible = true
	runtime.EventsEmit(a.ctx, "evoca:overlay", map[string]any{
		"timestamp": time.Now().UnixMilli(),
	})
}

func (a *App) BeginScreenshot() (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("app is not initialized")
	}
	// Hide eVoca before capture so its own window is never included in the image.
	a.HideOverlay()
	time.Sleep(120 * time.Millisecond)
	pngData, err := capturePrimaryScreen()
	if err != nil {
		runtime.WindowShow(a.ctx)
		a.overlayVisible = true
		return "", err
	}
	a.screenshotMu.Lock()
	a.screenshotPNG = pngData
	a.screenshotMu.Unlock()
	runtime.WindowShow(a.ctx)
	runtime.WindowSetAlwaysOnTop(a.ctx, true)
	runtime.WindowFullscreen(a.ctx)
	runtime.EventsEmit(a.ctx, "evoca:screenshot:ready", map[string]any{"timestamp": time.Now().UnixMilli()})
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngData), nil
}

func (a *App) PreviewScreenshot(x, y, width, height, viewportWidth, viewportHeight int) (string, error) {
	a.screenshotMu.Lock()
	pngData := append([]byte(nil), a.screenshotPNG...)
	a.screenshotMu.Unlock()
	if len(pngData) == 0 {
		return "", fmt.Errorf("no screenshot is available")
	}
	imageBase64, err := cropPNG(pngData, x, y, width, height, viewportWidth, viewportHeight)
	if err != nil {
		return "", err
	}
	return "data:image/png;base64," + imageBase64, nil
}

func (a *App) CancelScreenshot() {
	a.screenshotMu.Lock()
	a.screenshotPNG = nil
	a.screenshotMu.Unlock()
	a.restoreScreenshotWindow()
}

func (a *App) restoreScreenshotWindow() {
	if a.ctx == nil {
		return
	}
	runtime.WindowUnfullscreen(a.ctx)
	runtime.WindowShow(a.ctx)
	runtime.WindowSetAlwaysOnTop(a.ctx, true)
}

func (a *App) HideOverlay() {
	if a.ctx != nil {
		a.overlayVisible = false
		runtime.WindowHide(a.ctx)
	}
}

func (a *App) GetHotkey() string {
	if a.hotkey == nil {
		return "Ctrl+Space"
	}
	return a.hotkey.Current()
}

func (a *App) SetHotkey(combo string) error {
	if a.hotkey == nil {
		return fmt.Errorf("hotkey manager is not initialized")
	}
	if err := a.hotkey.Set(combo); err != nil {
		return err
	}
	if a.database != nil {
		return a.database.SaveSetting("hotkey", a.hotkey.Current())
	}
	return nil
}

func (a *App) ListExecutions(page, pageSize int, search, status, requestType, configurationID string) (db.ExecutionPage, error) {
	if a.database == nil {
		return db.ExecutionPage{}, fmt.Errorf("database is not initialized")
	}
	return a.database.ListExecutions(page, pageSize, search, status, requestType, configurationID)
}

func (a *App) GetExecution(id string) (db.Execution, error) {
	if a.database == nil {
		return db.Execution{}, fmt.Errorf("database is not initialized")
	}
	return a.database.GetExecution(id)
}

func (a *App) GetStorageSettings() (db.StorageSettings, error) {
	if a.database == nil {
		return db.StorageSettings{}, fmt.Errorf("database is not initialized")
	}
	return db.LoadStorageSettings()
}

func (a *App) SetStorageSettings(settings db.StorageSettings) error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	if err := db.SaveStorageSettings(settings); err != nil {
		return err
	}
	runtime.EventsEmit(a.ctx, "evoca:storage:changed")
	return nil
}

func (a *App) Quit() {
	if a.ctx != nil {
		runtime.Quit(a.ctx)
	}
}

func (a *App) GetConfigurations() ([]db.Configuration, error) {
	if a.database == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	return a.database.ListConfigurations()
}

func (a *App) GetConfiguration(id string) (db.Configuration, error) {
	if a.database == nil {
		return db.Configuration{}, fmt.Errorf("database is not initialized")
	}
	return a.database.GetConfiguration(id)
}

func (a *App) SaveConfiguration(configuration db.Configuration) error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	if configuration.Name == "" {
		return fmt.Errorf("configuration name is required")
	}
	if configuration.ProviderID == "" {
		return fmt.Errorf("provider is required")
	}
	return a.database.SaveConfiguration(configuration)
}

func (a *App) DeleteConfiguration(id string) error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	return a.database.DeleteConfiguration(id)
}

func (a *App) GetProviders() ([]db.Provider, error) {
	if a.database == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	return a.database.ListProviders()
}

func (a *App) SaveProvider(provider db.Provider) error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	if provider.Name == "" {
		return fmt.Errorf("provider name is required")
	}
	if provider.Kind == "" {
		provider.Kind = "openai_compatible"
	}
	if provider.HeadersJSON == "" {
		provider.HeadersJSON = "{}"
	}
	return a.database.SaveProvider(provider)
}

func (a *App) DeleteProvider(id string) error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	return a.database.DeleteProvider(id)
}

func (a *App) GetProviderModels(providerID string) ([]db.ProviderModel, error) {
	if a.database == nil {
		return nil, fmt.Errorf("database is not initialized")
	}
	return a.database.ListProviderModels(providerID)
}

func (a *App) SaveProviderModel(model db.ProviderModel) error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	if model.ProviderID == "" || model.Name == "" {
		return fmt.Errorf("provider and model name are required")
	}
	return a.database.SaveProviderModel(model)
}

func (a *App) DeleteProviderModel(id string) error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	return a.database.DeleteProviderModel(id)
}

func (a *App) StartConfigurationStream(id, input, requestID string) error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	configuration, err := a.database.GetConfiguration(id)
	if err != nil {
		return err
	}
	provider, err := a.database.GetProvider(configuration.ProviderID)
	if err != nil {
		return err
	}
	executionID, err := a.database.RecordExecutionStart(id, configuration.Model, "text", input, configuration.Spell, "")
	if err != nil {
		return err
	}
	runtime.EventsEmit(a.ctx, "evoca:llm:start", map[string]any{"id": requestID, "executionId": executionID})
	go func() {
		result, err := a.providers.GenerateStream(provider, llm.Request{Model: configuration.Model, Spell: configuration.Spell, Input: input, Temperature: configuration.Temperature, MaxTokens: configuration.MaxTokens, OutputType: configuration.OutputType}, func(chunk string) error {
			runtime.EventsEmit(a.ctx, "evoca:llm:chunk", map[string]any{"id": requestID, "chunk": chunk})
			return nil
		})
		if err != nil {
			_ = a.database.CompleteExecution(executionID, "", "error", err.Error(), db.ExecutionMetrics{})
			runtime.EventsEmit(a.ctx, "evoca:llm:error", map[string]any{"id": requestID, "executionId": executionID, "error": err.Error()})
			return
		}
		metrics := db.ExecutionMetrics{DurationMs: result.Metrics.DurationMs, FirstTokenMs: result.Metrics.FirstTokenMs, InputTokens: result.Metrics.InputTokens, OutputTokens: result.Metrics.OutputTokens, TotalTokens: result.Metrics.TotalTokens, TokensPerSec: result.Metrics.TokensPerSec}
		_ = a.database.CompleteExecution(executionID, result.Text, "success", "", metrics)
		runtime.EventsEmit(a.ctx, "evoca:llm:done", map[string]any{"id": requestID, "executionId": executionID, "output": result.Text, "metrics": result.Metrics})
	}()
	return nil
}

func (a *App) StartScreenshotStream(id, input, requestID string, x, y, width, height, viewportWidth, viewportHeight int) error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	configuration, err := a.database.GetConfiguration(id)
	if err != nil {
		return err
	}
	provider, err := a.database.GetProvider(configuration.ProviderID)
	if err != nil {
		return err
	}
	a.screenshotMu.Lock()
	pngData := append([]byte(nil), a.screenshotPNG...)
	a.screenshotPNG = nil
	a.screenshotMu.Unlock()
	if len(pngData) == 0 {
		a.restoreScreenshotWindow()
		return fmt.Errorf("no screenshot is available")
	}
	imageBase64, err := cropPNG(pngData, x, y, width, height, viewportWidth, viewportHeight)
	if err != nil {
		a.restoreScreenshotWindow()
		return err
	}
	runtime.WindowUnfullscreen(a.ctx)
	runtime.WindowShow(a.ctx)
	runtime.WindowSetAlwaysOnTop(a.ctx, true)
	executionID, err := a.database.RecordExecutionStart(id, configuration.Model, "screenshot", input, configuration.Spell, imageBase64)
	if err != nil {
		return err
	}
	runtime.EventsEmit(a.ctx, "evoca:llm:start", map[string]any{"id": requestID, "executionId": executionID})
	go func() {
		result, err := a.providers.GenerateStream(provider, llm.Request{Model: configuration.Model, Spell: configuration.Spell, Input: input, ImageBase64: imageBase64, Temperature: configuration.Temperature, MaxTokens: configuration.MaxTokens, OutputType: configuration.OutputType}, func(chunk string) error {
			runtime.EventsEmit(a.ctx, "evoca:llm:chunk", map[string]any{"id": requestID, "chunk": chunk})
			return nil
		})
		if err != nil {
			_ = a.database.CompleteExecution(executionID, "", "error", err.Error(), db.ExecutionMetrics{})
			runtime.EventsEmit(a.ctx, "evoca:llm:error", map[string]any{"id": requestID, "executionId": executionID, "error": err.Error()})
			return
		}
		metrics := db.ExecutionMetrics{DurationMs: result.Metrics.DurationMs, FirstTokenMs: result.Metrics.FirstTokenMs, InputTokens: result.Metrics.InputTokens, OutputTokens: result.Metrics.OutputTokens, TotalTokens: result.Metrics.TotalTokens, TokensPerSec: result.Metrics.TokensPerSec}
		_ = a.database.CompleteExecution(executionID, result.Text, "success", "", metrics)
		runtime.EventsEmit(a.ctx, "evoca:llm:done", map[string]any{"id": requestID, "executionId": executionID, "output": result.Text, "metrics": result.Metrics})
	}()
	return nil
}

func (a *App) InvokeConfiguration(id, input string) (string, error) {
	if a.database == nil {
		return "", fmt.Errorf("database is not initialized")
	}

	configuration, err := a.database.GetConfiguration(id)
	if err != nil {
		return "", err
	}

	provider, err := a.database.GetProvider(configuration.ProviderID)
	if err != nil {
		return "", err
	}

	executionID, startErr := a.database.RecordExecutionStart(id, configuration.Model, "text", input, configuration.Spell, "")
	if startErr != nil {
		return "", startErr
	}
	started := time.Now()
	result, err := a.providers.Generate(provider, llm.Request{
		Model:       configuration.Model,
		Spell:       configuration.Spell,
		Input:       input,
		Temperature: configuration.Temperature,
		MaxTokens:   configuration.MaxTokens,
		OutputType:  configuration.OutputType,
	})
	if err != nil {
		_ = a.database.CompleteExecution(executionID, "", "error", err.Error(), db.ExecutionMetrics{DurationMs: time.Since(started).Milliseconds()})
		return "", err
	}
	_ = a.database.CompleteExecution(executionID, result, "success", "", db.ExecutionMetrics{DurationMs: time.Since(started).Milliseconds()})
	return result, nil
}
