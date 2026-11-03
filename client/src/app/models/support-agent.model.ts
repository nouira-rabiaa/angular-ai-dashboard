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

export interface AgentDocument {
  documentId: number; filename: string; fileType: string; createdAt: string; chunksCount: number;
}
export interface AgentKnowledge {
  documentIds: number[]; documents: AgentDocument[]; scopeVersion: string;
}
export interface SupportAnswer {
  status: 'answered' | 'abstained'; reason: string | null; reply: string; durationMs: number;
  sources: { label: string; documentId: number; chunkId: number; filename: string; excerpt: string; pageNumber: number | null; startOffset: number | null; endOffset: number | null }[];
  citationValidation: { validLabels: string[]; invalidLabels: string[]; sourceIdentityValidated: boolean; factualEntailmentValidated: false } | null;
}

export interface SupportConversation {
  id: string; agent_id: string; title: string; status: 'open'; created_at: string; updated_at: string;
}
export interface ConversationMessage {
  id: string; sequence: number; requestId: string; role: 'user' | 'assistant'; content: string;
  status: 'pending' | 'completed' | 'abstained' | 'failed'; createdAt: string;
  sources: SupportAnswer['sources']; stale: boolean; metadata: { code?: string; reason?: string };
}
export interface ConversationPage { items: SupportConversation[]; total: number; limit: number; offset: number; }
export interface ConversationHistory { conversation: SupportConversation; items: ConversationMessage[]; nextBefore: number | null; }
export interface ConversationTurn { items: ConversationMessage[]; }
