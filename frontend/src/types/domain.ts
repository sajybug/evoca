export interface Configuration {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  providerId: string;
  model: string;
  spell: string;
  inputType: string;
  outputType: string;
  temperature?: number;
  maxTokens?: number;
  pinned: boolean;
  lastUsedAt: number;
  useCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Provider {
  id: string;
  name: string;
  kind: string;
  baseUrl?: string;
  headersJson?: string;
  createdAt: number;
}

export interface AppInfo {
  name: string;
  version: string;
  purpose: string;
}

export interface ProviderModel {
  id: string;
  providerId: string;
  name: string;
  displayName?: string;
  createdAt: number;
}

export interface ExecutionMetrics {
  durationMs: number;
  firstTokenMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokensPerSec: number;
}

export interface Execution {
  id: string;
  configurationId: string;
  configurationName: string;
  providerName: string;
  model: string;
  requestType: string;
  input: string;
  systemPrompt: string;
  imageData?: string;
  output: string;
  error?: string;
  status: string;
  createdAt: number;
  completedAt?: number;
  durationMs: number;
  firstTokenMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokensPerSec: number;
}

export interface ExecutionPage {
  items: Execution[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface StorageSettings {
  databasePath: string;
  imagesPath: string;
}
