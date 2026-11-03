export type SupportAgentStatus = 'active' | 'inactive';
export interface SupportAgentConfig {
  name: string;
  description: string;
  role: string;
  systemInstructions: string;
  tone: 'professional' | 'friendly' | 'concise';
  language: 'fr' | 'en' | 'ar';
  model: 'openai/gpt-oss-120b';
  temperature: number;
  maxOutputTokens: number;
  fallbackMessage: string;
  escalationEnabled: boolean;
  status: SupportAgentStatus;
}
export interface SupportAgent extends SupportAgentConfig {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface SupportAgentPage { items: SupportAgent[]; total: number; limit: number; offset: number; }
export const emptySupportAgent = (): SupportAgentConfig => ({
  name: '', description: '', role: 'Support client',
  systemInstructions: '', tone: 'professional', language: 'fr', model: 'openai/gpt-oss-120b',
  temperature: 0.6, maxOutputTokens: 1024,
  fallbackMessage: 'Je ne dispose pas des informations nécessaires. Veuillez contacter un conseiller.',
  escalationEnabled: false, status: 'inactive'
});
