package app

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/sajybug/evoca/backend/credentials"
	"github.com/sajybug/evoca/backend/db"
	"github.com/sajybug/evoca/backend/hotkey"
	"github.com/sajybug/evoca/backend/llm"
	"github.com/sajybug/evoca/internal/platform"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx             context.Context
	database        *db.DB
	providers       *llm.Registry
	hotkey          *hotkey.Manager
	overlayVisible  bool
	streamMu        sync.Mutex
	streamWG        sync.WaitGroup
	streams         map[string]context.CancelFunc
	screenshotMu    sync.Mutex
	screenshotPNG   []byte
	credentialStore credentials.CredentialStore
}

func NewApp() *App {
	return &App{streams: make(map[string]context.CancelFunc), credentialStore: credentials.NewStore()}
}

func (a *App) Startup(ctx context.Context) {
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
	platform.StartWindowFocusWatcher()
}

func (a *App) DomReady(ctx context.Context) {
	runtime.WindowHide(ctx)
}

func (a *App) Shutdown(ctx context.Context) {
	a.streamMu.Lock()
	for _, cancel := range a.streams {
		cancel()
	}
	a.streams = make(map[string]context.CancelFunc)
	a.streamMu.Unlock()
	platform.StopWindowFocusWatcher()
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

	// Tell the renderer to switch back to the launcher while the window is still hidden.
	// A short delay lets React commit the reset before the native window becomes visible,
	// preventing the previous Settings/History state from flashing for a frame.
	runtime.EventsEmit(a.ctx, "evoca:overlay", map[string]any{
		"timestamp": time.Now().UnixMilli(),
		"reset":     true,
	})
	time.Sleep(60 * time.Millisecond)
	runtime.WindowShow(a.ctx)
	runtime.WindowSetAlwaysOnTop(a.ctx, true)
	runtime.WindowCenter(a.ctx)
	// Wails/WebView2 can restore the host window without restoring WebView input focus.
	// Nudge the renderer after activation so the first interaction is not consumed by focus recovery.
	time.AfterFunc(40*time.Millisecond, func() {
		if a.ctx != nil {
			runtime.WindowExecJS(a.ctx, `(function(){var el=document.querySelector('[data-evoca-root]'); if(el){el.focus();}})();`)
		}
	})

	a.overlayVisible = true
}

func (a *App) BeginScreenshot() (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("app is not initialized")
	}
	// Hide eVoca before capture so its own window is never included in the image.
	// The native hide is deliberately synchronized with the Windows compositor;
	// runtime.WindowHide alone can leave one transitional/blurred frame visible
	// long enough for BitBlt to capture it.
	a.HideOverlay()
	if err := platform.HideScreenshotWindowForCapture(); err != nil {
		_ = platform.UncloakScreenshotWindow()
		runtime.WindowShow(a.ctx)
		a.overlayVisible = true
		return "", err
	}
	pngData, err := platform.CapturePrimaryScreen()
	if err != nil {
		_ = platform.UncloakScreenshotWindow()
		runtime.WindowShow(a.ctx)
		a.overlayVisible = true
		return "", err
	}
	// The capture is complete; restore DWM composition before showing the
	// interactive fullscreen screenshot selector. The captured PNG is already
	// isolated from eVoca.
	_ = platform.UncloakScreenshotWindow()
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
	imageBase64, err := platform.CropPNG(pngData, x, y, width, height, viewportWidth, viewportHeight)
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

func (a *App) ChooseDirectory(current, title string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("app is not initialized")
	}
	selected, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		DefaultDirectory: filepath.Dir(current),
		Title:            title,
	})
	if err != nil || strings.TrimSpace(selected) == "" {
		return selected, err
	}
	return selected, nil
}

func (a *App) ChooseBackupSavePath(current string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("app is not initialized")
	}
	// Native file dialogs temporarily own activation/focus. Suspend the eVoca
	// focus recovery watcher so it cannot steal the dialog back to the main window.
	releaseFocusRecovery := platform.SuppressWindowFocusRecovery()
	defer releaseFocusRecovery()

	defaultFilename := "eVoca-backup-" + time.Now().Format("2006-01-02_15-04-05") + ".zip"
	if strings.TrimSpace(current) != "" {
		base := filepath.Base(current)
		if strings.TrimSpace(base) != "" && base != "." && base != string(filepath.Separator) {
			defaultFilename = base
		}
	}
	return runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultDirectory: filepath.Dir(current),
		DefaultFilename:  defaultFilename,
		Title:            "Save eVoca backup",
		Filters:          []runtime.FileFilter{{DisplayName: "eVoca backup (*.zip)", Pattern: "*.zip"}},
	})
}

func (a *App) ChooseBackupFile(current string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("app is not initialized")
	}
	releaseFocusRecovery := platform.SuppressWindowFocusRecovery()
	defer releaseFocusRecovery()
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		DefaultDirectory: filepath.Dir(current),
		Title:            "Restore eVoca backup",
		Filters:          []runtime.FileFilter{{DisplayName: "eVoca backup (*.zip)", Pattern: "*.zip"}},
	})
}

func (a *App) CreateBackup(path, mode string) error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("backup path is required")
	}
	return a.database.BackupTo(path, db.BackupMode(mode))
}

func (a *App) RestoreBackup(path string) error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("backup path is required")
	}

	mode, err := db.ReadBackupMode(path)
	if err != nil {
		return err
	}

	// Restore is an exclusive database maintenance operation. Cancel any active
	// LLM streams and wait for them to finish before closing SQLite.
	if !a.cancelActiveStreamsAndWait(5 * time.Second) {
		return fmt.Errorf("could not stop active operations before restore")
	}

	currentDB := a.database
	a.database = nil
	if err := currentDB.Close(); err != nil {
		a.database = currentDB
		return fmt.Errorf("close database before restore: %w", err)
	}

	var restoreErr error
	if mode == db.BackupModeFull {
		restoreErr = db.RestoreFullFromBackup(path)
	} else {
		restoreErr = db.RestoreSettingsFromBackup(path)
	}

	if restoreErr != nil {
		reopened, reopenErr := db.Open(a.ctx)
		if reopenErr != nil {
			return fmt.Errorf("restore failed: %v; reopen database failed: %w", restoreErr, reopenErr)
		}
		a.database = reopened
		return restoreErr
	}

	runtime.EventsEmit(a.ctx, "evoca:data:restored", map[string]any{"timestamp": time.Now().UnixMilli(), "mode": string(mode)})
	return nil
}

func (a *App) cancelActiveStreamsAndWait(timeout time.Duration) bool {
	a.streamMu.Lock()
	cancels := make([]context.CancelFunc, 0, len(a.streams))
	for _, cancel := range a.streams {
		cancels = append(cancels, cancel)
	}
	a.streamMu.Unlock()

	for _, cancel := range cancels {
		cancel()
	}
	if len(cancels) == 0 {
		return true
	}

	done := make(chan struct{})
	go func() {
		a.streamWG.Wait()
		close(done)
	}()
	select {
	case <-done:
		return true
	case <-time.After(timeout):
		return false
	}
}

func (a *App) RecoverWindowFocus() {
	platform.RecoverWindowFocus()
}

func (a *App) DeleteExecution(id string) error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	return a.database.DeleteExecution(id)
}

func (a *App) ClearExecutions() error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	return a.database.ClearExecutions()
}

func (a *App) Quit() {
	if a.ctx != nil {
		runtime.Quit(a.ctx)
	}
}

func (a *App) Restart() {
	if a.ctx == nil {
		return
	}

	exe, err := os.Executable()
	if err != nil {
		runtime.LogError(a.ctx, "restart failed: "+err.Error())
		return
	}
	args := append([]string(nil), os.Args[1:]...)
	go func(ctx context.Context) {
		// Let Wails run its normal shutdown path before the replacement process starts.
		time.Sleep(700 * time.Millisecond)
		cmd := exec.Command(exe, args...)
		cmd.Dir = filepath.Dir(exe)
		cmd.Stdout = nil
		cmd.Stderr = nil
		cmd.Stdin = nil
		if err := cmd.Start(); err != nil {
			runtime.LogError(ctx, "restart launch failed: "+err.Error())
			return
		}
		runtime.Quit(ctx)
	}(a.ctx)
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

func (a *App) SetConfigurationPinned(id string, pinned bool) error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	return a.database.SetConfigurationPinned(id, pinned)
}

func (a *App) DuplicateConfiguration(id string) (db.Configuration, error) {
	if a.database == nil {
		return db.Configuration{}, fmt.Errorf("database is not initialized")
	}
	return a.database.DuplicateConfiguration(id)
}

func (a *App) DeleteConfiguration(id string) error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	return a.database.DeleteConfiguration(id)
}

func (a *App) IsAutostartEnabled() (bool, error) {
	return platform.IsAutostartEnabled()
}

func (a *App) SetAutostart(enabled bool) error {
	return platform.SetAutostartEnabled(enabled)
}

func (a *App) HasProviderCredential(ref string) bool {
	ref = strings.TrimSpace(ref)
	if ref == "" || a.credentialStore == nil {
		return false
	}
	value, err := a.credentialStore.Get(ref)
	return err == nil && value != ""
}

func (a *App) SetProviderCredential(ref, value string) error {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return fmt.Errorf("credential reference is required")
	}
	if a.credentialStore == nil {
		return fmt.Errorf("credential store is not initialized")
	}
	return a.credentialStore.Set(ref, value)
}

func (a *App) DeleteProviderCredential(ref string) error {
	ref = strings.TrimSpace(ref)
	if ref == "" || a.credentialStore == nil {
		return nil
	}
	return a.credentialStore.Delete(ref)
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
	provider, err := a.database.GetProvider(id)
	if err != nil {
		return err
	}
	if err := a.database.DeleteProvider(id); err != nil {
		return err
	}
	if a.credentialStore != nil && strings.TrimSpace(provider.CredentialRef) != "" {
		_ = a.credentialStore.Delete(provider.CredentialRef)
	}
	return nil
}

func (a *App) TestProvider(provider db.Provider) error {
	if a.providers == nil {
		return fmt.Errorf("provider registry is not initialized")
	}
	return llm.TestProvider(provider, a.credentialStore)
}

func (a *App) DiscoverProviderModels(provider db.Provider) ([]db.ProviderModel, error) {
	if a.providers == nil {
		return nil, fmt.Errorf("provider registry is not initialized")
	}
	discovered, err := llm.DiscoverModels(provider, a.credentialStore)
	if err != nil {
		return nil, err
	}
	models := make([]db.ProviderModel, 0, len(discovered))
	for _, model := range discovered {
		models = append(models, db.ProviderModel{
			ID:          fmt.Sprintf("%s:%s", provider.ID, model.Name),
			ProviderID:  provider.ID,
			Name:        model.Name,
			DisplayName: model.DisplayName,
		})
	}
	return models, nil
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

func (a *App) registerStream(requestID string) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(a.ctx)
	a.streamMu.Lock()
	a.streams[requestID] = cancel
	a.streamWG.Add(1)
	a.streamMu.Unlock()
	return ctx, cancel
}

func (a *App) unregisterStream(requestID string) {
	a.streamMu.Lock()
	delete(a.streams, requestID)
	a.streamMu.Unlock()
	a.streamWG.Done()
}

func (a *App) CancelLLM(requestID string) error {
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return fmt.Errorf("request id is required")
	}
	a.streamMu.Lock()
	cancel := a.streams[requestID]
	a.streamMu.Unlock()
	if cancel == nil {
		return nil
	}
	cancel()
	return nil
}

func (a *App) StartConfigurationStream(id, input, requestID string) error {
	return a.startConfigurationStream(id, input, requestID, "")
}

func (a *App) StartConfigurationStreamWithModel(id, input, requestID, model string) error {
	return a.startConfigurationStream(id, input, requestID, strings.TrimSpace(model))
}

func (a *App) startConfigurationStream(id, input, requestID, modelOverride string) error {
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
	model := strings.TrimSpace(configuration.Model)
	if modelOverride != "" {
		model = modelOverride
	}
	if model == "" {
		return fmt.Errorf("model is required")
	}
	if err := a.database.MarkConfigurationUsed(id); err != nil {
		return err
	}
	executionID, err := a.database.RecordExecutionStart(id, model, "text", input, configuration.Spell, "")
	if err != nil {
		return err
	}
	runtime.EventsEmit(a.ctx, "evoca:llm:start", map[string]any{"id": requestID, "executionId": executionID, "model": model})
	requestCtx, cancel := a.registerStream(requestID)
	go func() {
		defer cancel()
		defer a.unregisterStream(requestID)
		result, err := a.providers.GenerateStream(requestCtx, provider, llm.Request{Model: model, Spell: configuration.Spell, Input: input, Temperature: configuration.Temperature, MaxTokens: configuration.MaxTokens, OutputType: configuration.OutputType}, func(chunk string) error {
			runtime.EventsEmit(a.ctx, "evoca:llm:chunk", map[string]any{"id": requestID, "chunk": chunk})
			return nil
		})
		if err != nil {
			if errors.Is(err, context.Canceled) {
				_ = a.database.CompleteExecution(executionID, "", "cancelled", "", db.ExecutionMetrics{})
				runtime.EventsEmit(a.ctx, "evoca:llm:cancelled", map[string]any{"id": requestID, "executionId": executionID})
				return
			}
			_ = a.database.CompleteExecution(executionID, "", "error", err.Error(), db.ExecutionMetrics{})
			runtime.EventsEmit(a.ctx, "evoca:llm:error", map[string]any{"id": requestID, "executionId": executionID, "error": err.Error()})
			return
		}
		metrics := db.ExecutionMetrics{DurationMs: result.Metrics.DurationMs, FirstTokenMs: result.Metrics.FirstTokenMs, InputTokens: result.Metrics.InputTokens, OutputTokens: result.Metrics.OutputTokens, TotalTokens: result.Metrics.TotalTokens, TokensPerSec: result.Metrics.TokensPerSec}
		_ = a.database.CompleteExecution(executionID, result.Text, "success", "", metrics)
		runtime.EventsEmit(a.ctx, "evoca:llm:done", map[string]any{"id": requestID, "executionId": executionID, "output": result.Text, "metrics": result.Metrics, "model": model})
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
	imageBase64, err := platform.CropPNG(pngData, x, y, width, height, viewportWidth, viewportHeight)
	if err != nil {
		a.restoreScreenshotWindow()
		return err
	}
	runtime.WindowUnfullscreen(a.ctx)
	runtime.WindowShow(a.ctx)
	runtime.WindowSetAlwaysOnTop(a.ctx, true)
	if err := a.database.MarkConfigurationUsed(id); err != nil {
		return err
	}
	executionID, err := a.database.RecordExecutionStart(id, configuration.Model, "screenshot", input, configuration.Spell, imageBase64)
	if err != nil {
		return err
	}
	runtime.EventsEmit(a.ctx, "evoca:llm:start", map[string]any{"id": requestID, "executionId": executionID})
	requestCtx, cancel := a.registerStream(requestID)
	go func() {
		defer cancel()
		defer a.unregisterStream(requestID)
		result, err := a.providers.GenerateStream(requestCtx, provider, llm.Request{Model: configuration.Model, Spell: configuration.Spell, Input: input, ImageBase64: imageBase64, Temperature: configuration.Temperature, MaxTokens: configuration.MaxTokens, OutputType: configuration.OutputType}, func(chunk string) error {
			runtime.EventsEmit(a.ctx, "evoca:llm:chunk", map[string]any{"id": requestID, "chunk": chunk})
			return nil
		})
		if err != nil {
			if errors.Is(err, context.Canceled) {
				_ = a.database.CompleteExecution(executionID, "", "cancelled", "", db.ExecutionMetrics{})
				runtime.EventsEmit(a.ctx, "evoca:llm:cancelled", map[string]any{"id": requestID, "executionId": executionID})
				return
			}
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

func (a *App) StartExecutionStream(executionID, requestID string) error {
	if a.database == nil {
		return fmt.Errorf("database is not initialized")
	}
	execution, err := a.database.GetExecution(executionID)
	if err != nil {
		return err
	}
	configuration, err := a.database.GetConfiguration(execution.ConfigurationID)
	if err != nil {
		return err
	}
	provider, err := a.database.GetProvider(configuration.ProviderID)
	if err != nil {
		return err
	}
	if err := a.database.MarkConfigurationUsed(configuration.ID); err != nil {
		return err
	}
	imageBase64 := ""
	if execution.RequestType == "screenshot" {
		imageBase64 = execution.ImageData
		if imageBase64 == "" {
			return fmt.Errorf("the original screenshot is no longer available")
		}
	}
	newExecutionID, err := a.database.RecordExecutionStart(configuration.ID, configuration.Model, execution.RequestType, execution.Input, configuration.Spell, imageBase64)
	if err != nil {
		return err
	}
	runtime.EventsEmit(a.ctx, "evoca:llm:start", map[string]any{"id": requestID, "executionId": newExecutionID})
	requestCtx, cancel := a.registerStream(requestID)
	go func() {
		defer cancel()
		defer a.unregisterStream(requestID)
		result, err := a.providers.GenerateStream(requestCtx, provider, llm.Request{Model: configuration.Model, Spell: configuration.Spell, Input: execution.Input, ImageBase64: imageBase64, Temperature: configuration.Temperature, MaxTokens: configuration.MaxTokens, OutputType: configuration.OutputType}, func(chunk string) error {
			runtime.EventsEmit(a.ctx, "evoca:llm:chunk", map[string]any{"id": requestID, "chunk": chunk})
			return nil
		})
		if err != nil {
			if errors.Is(err, context.Canceled) {
				_ = a.database.CompleteExecution(newExecutionID, "", "cancelled", "", db.ExecutionMetrics{})
				runtime.EventsEmit(a.ctx, "evoca:llm:cancelled", map[string]any{"id": requestID, "executionId": newExecutionID})
				return
			}
			_ = a.database.CompleteExecution(newExecutionID, "", "error", err.Error(), db.ExecutionMetrics{})
			runtime.EventsEmit(a.ctx, "evoca:llm:error", map[string]any{"id": requestID, "executionId": newExecutionID, "error": err.Error()})
			return
		}
		metrics := db.ExecutionMetrics{DurationMs: result.Metrics.DurationMs, FirstTokenMs: result.Metrics.FirstTokenMs, InputTokens: result.Metrics.InputTokens, OutputTokens: result.Metrics.OutputTokens, TotalTokens: result.Metrics.TotalTokens, TokensPerSec: result.Metrics.TokensPerSec}
		_ = a.database.CompleteExecution(newExecutionID, result.Text, "success", "", metrics)
		runtime.EventsEmit(a.ctx, "evoca:llm:done", map[string]any{"id": requestID, "executionId": newExecutionID, "output": result.Text, "metrics": result.Metrics})
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
