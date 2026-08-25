import {
  GetConfigurations,
  GetProviders,
  InvokeConfiguration,
  StartConfigurationStream,
  HideOverlay,
  Quit,
  SaveConfiguration,
  DeleteConfiguration,
  SaveProvider,
  DeleteProvider,
  GetProviderModels,
  SaveProviderModel,
  DeleteProviderModel,
  GetHotkey,
  SetHotkey,
  BeginScreenshot,
  PreviewScreenshot,
  CancelScreenshot,
  StartScreenshotStream,
} from "../wailsjs/go/main/App";

import type { Configuration, Provider, ProviderModel } from "../types/domain";

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

  invokeConfiguration(id: string, input: string): Promise<string> {
    return InvokeConfiguration(id, input);
  },

  startConfigurationStream(id: string, input: string, requestId: string): Promise<void> {
    return StartConfigurationStream(id, input, requestId);
  },

  hideOverlay(): Promise<void> {
    return HideOverlay();
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

  quit(): Promise<void> {
    return Quit();
  },

  saveConfiguration(configuration: Configuration): Promise<void> {
    return SaveConfiguration(configuration);
  },

  deleteConfiguration(id: string): Promise<void> {
    return DeleteConfiguration(id);
  },
};
