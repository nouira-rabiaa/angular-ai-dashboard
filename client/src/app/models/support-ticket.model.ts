import { SupportConversation } from './support-agent.model';
export const TICKET_CATEGORIES = ['technical', 'billing', 'account', 'product', 'defective_product', 'returns', 'delivery', 'general', 'other'] as const;
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TICKET_STATUSES = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const;
export type TicketCategory = typeof TICKET_CATEGORIES[number];
export type TicketPriority = typeof TICKET_PRIORITIES[number];
export type TicketStatus = typeof TICKET_STATUSES[number];
export interface TicketDraft {
  requestId: string; title: string; description: string; conversationId: string | null; sourceMessageId: string | null;
  category?: TicketCategory; priority?: TicketPriority;
}
export interface SupportTicket {
  id: string; agentId: string; conversationId: string | null; sourceMessageId: string | null;
  title: string; description: string; category: TicketCategory; priority: TicketPriority; status: TicketStatus;
  classificationSource: 'manual' | 'rules'; classificationReason: string; classificationConfidence: null;
  version: number; createdAt: string; updatedAt: string; closedAt: string | null;
}
export interface TicketFilters { status: TicketStatus | ''; priority: TicketPriority | ''; category: TicketCategory | ''; search: string; conversationId: string; }
export interface TicketPage { items: SupportTicket[]; total: number; limit: number; offset: number; counts: Record<TicketStatus, number>; }
export interface TicketEvent { id: number; type: 'created' | 'classified' | 'status_changed' | 'priority_changed' | 'category_changed' | 'classification_changed' | 'conversation_unlinked' | 'source_unlinked'; oldValue: string | null; newValue: string | null; origin: 'local_user' | 'system'; createdAt: string; }
export interface TicketEventPage { items: TicketEvent[]; total: number; limit: number; offset: number; }
export interface ConversationTicketDraft { conversation: SupportConversation; description: string; sourceMessageId: string | null; }
