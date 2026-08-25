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
  createdAt: number;
  updatedAt: number;
}

export interface Provider {
  id: string;
  name: string;
  kind: string;
  baseUrl?: string;
  credentialRef?: string;
  apiKeyEnv?: string;
  headersJson?: string;
  createdAt: number;
}

export interface ProviderModel {
  id: string;
  providerId: string;
  name: string;
  displayName?: string;
  createdAt: number;
}
