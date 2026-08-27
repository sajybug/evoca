import {
  GetConfigurations,
  GetProviders,
  InvokeConfiguration,
  StartConfigurationStream,
  StartExecutionStream,
  HideOverlay,
  Quit,
  SaveConfiguration,
  DeleteConfiguration,
  SetConfigurationPinned,
  DuplicateConfiguration,
  SaveProvider,
  DeleteProvider,
  GetProviderModels,
  SaveProviderModel,
  DeleteProviderModel,
  TestProvider,
  DiscoverProviderModels,
  GetStorageSettings,
  SetStorageSettings,
  ChooseDirectory,
  ChooseBackupSavePath,
  ChooseBackupFile,
  CreateBackup,
  RestoreBackup,
  DeleteExecution,
  ClearExecutions,
  CancelLLM,
  IsAutostartEnabled,
  SetAutostart,
  HasProviderCredential,
  SetProviderCredential,
  DeleteProviderCredential,
  GetHotkey,
  SetHotkey,
  BeginScreenshot,
  PreviewScreenshot,
  CancelScreenshot,
  StartScreenshotStream,
  ListExecutions,
  GetExecution,
} from "../wailsjs/go/main/App";

import type { Configuration, Provider, ProviderModel, Execution, ExecutionPage, StorageSettings } from "../types/domain";

export const evoca = {
  getConfigurations(): Promise<Configuration[]> {
    return GetConfigurations();
  },

  getProviders(): Promise<Provider[]> {
    return GetProviders();
  },

  saveProvider(provider: Provider): Promise<void> {
    return SaveProvider(provider);
  },

  deleteProvider(id: string): Promise<void> {
    return DeleteProvider(id);
  },

  getProviderModels(providerId: string): Promise<ProviderModel[]> {
    return GetProviderModels(providerId);
  },

  saveProviderModel(model: ProviderModel): Promise<void> {
    return SaveProviderModel(model);
  },

  deleteProviderModel(id: string): Promise<void> {
    return DeleteProviderModel(id);
  },

  testProvider(provider: Provider): Promise<void> {
    return TestProvider(provider);
  },

  discoverProviderModels(provider: Provider): Promise<ProviderModel[]> {
    return DiscoverProviderModels(provider);
  },

  invokeConfiguration(id: string, input: string): Promise<string> {
    return InvokeConfiguration(id, input);
  },

  startConfigurationStream(id: string, input: string, requestId: string): Promise<void> {
    return StartConfigurationStream(id, input, requestId);
  },

  startExecutionStream(executionId: string, requestId: string): Promise<void> {
    return StartExecutionStream(executionId, requestId);
  },

  hideOverlay(): Promise<void> {
    return HideOverlay();
  },

  getStorageSettings(): Promise<StorageSettings> {
    return GetStorageSettings();
  },

  setStorageSettings(settings: StorageSettings): Promise<void> {
    return SetStorageSettings(settings);
  },

  chooseDirectory(current: string, title: string): Promise<string> {
    return ChooseDirectory(current, title);
  },

  chooseBackupSavePath(current: string): Promise<string> {
    return ChooseBackupSavePath(current);
  },

  chooseBackupFile(current: string): Promise<string> {
    return ChooseBackupFile(current);
  },

  createBackup(path: string): Promise<void> {
    return CreateBackup(path);
  },

  restoreBackup(path: string): Promise<void> {
    return RestoreBackup(path);
  },

  getHotkey(): Promise<string> {
    return GetHotkey();
  },

  setHotkey(combo: string): Promise<void> {
    return SetHotkey(combo);
  },

  beginScreenshot(): Promise<string> {
    return BeginScreenshot();
  },

  previewScreenshot(x: number, y: number, width: number, height: number, viewportWidth: number, viewportHeight: number): Promise<string> {
    return PreviewScreenshot(x, y, width, height, viewportWidth, viewportHeight);
  },

  cancelScreenshot(): Promise<void> {
    return CancelScreenshot();
  },

  startScreenshotStream(id: string, input: string, requestId: string, x: number, y: number, width: number, height: number, viewportWidth: number, viewportHeight: number): Promise<void> {
    return StartScreenshotStream(id, input, requestId, x, y, width, height, viewportWidth, viewportHeight);
  },

  listExecutions(page: number, pageSize: number, search: string, status: string, requestType: string, configurationId: string): Promise<ExecutionPage> {
    return ListExecutions(page, pageSize, search, status, requestType, configurationId);
  },

  getExecution(id: string): Promise<Execution> {
    return GetExecution(id);
  },

  deleteExecution(id: string): Promise<void> {
    return DeleteExecution(id);
  },

  clearExecutions(): Promise<void> {
    return ClearExecutions();
  },

  cancelLLM(requestId: string): Promise<void> {
    return CancelLLM(requestId);
  },

  isAutostartEnabled(): Promise<boolean> { return IsAutostartEnabled(); },
  setAutostart(enabled: boolean): Promise<void> { return SetAutostart(enabled); },
  hasProviderCredential(ref: string): Promise<boolean> { return HasProviderCredential(ref); },
  setProviderCredential(ref: string, value: string): Promise<void> { return SetProviderCredential(ref, value); },
  deleteProviderCredential(ref: string): Promise<void> { return DeleteProviderCredential(ref); },

  quit(): Promise<void> {
    return Quit();
  },

  saveConfiguration(configuration: Configuration): Promise<void> {
    return SaveConfiguration(configuration);
  },

  deleteConfiguration(id: string): Promise<void> {
    return DeleteConfiguration(id);
  },

  setConfigurationPinned(id: string, pinned: boolean): Promise<void> {
    return SetConfigurationPinned(id, pinned);
  },

  duplicateConfiguration(id: string): Promise<Configuration> {
    return DuplicateConfiguration(id);
  },
};
