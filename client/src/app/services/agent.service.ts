import { SupportAgent, SupportAgentConfig, SupportAgentPage, SupportAgentStatus, AgentKnowledge, SupportAnswer, SupportConversation, ConversationPage, ConversationHistory, ConversationTurn } from '../models/support-agent.model';
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AgentService {
  private readonly http = inject(HttpClient);

  private readonly configurations = 'http://localhost:3000/api/agents';

  listAgents(limit = 50, offset = 0): Observable<SupportAgentPage> {
    return this.http.get<SupportAgentPage>(this.configurations, { params: { limit, offset } });
  }
  getAgent(id: string): Observable<SupportAgent> {
    return this.http.get<SupportAgent>(`${this.configurations}/${encodeURIComponent(id)}`);
  }
  createAgent(config: SupportAgentConfig): Observable<SupportAgent> {
    return this.http.post<SupportAgent>(this.configurations, config);
  }
  updateAgent(id: string, config: SupportAgentConfig, version: number): Observable<SupportAgent> {
    return this.http.put<SupportAgent>(`${this.configurations}/${encodeURIComponent(id)}`, { ...config, version });
  }
  setAgentStatus(id: string, status: SupportAgentStatus, version: number): Observable<SupportAgent> {
    return this.http.patch<SupportAgent>(`${this.configurations}/${encodeURIComponent(id)}/status`, { status, version });
  }

  getAgentDocuments(id: string): Observable<AgentKnowledge> {
    return this.http.get<AgentKnowledge>(`${this.configurations}/${encodeURIComponent(id)}/documents`);
  }
  setAgentDocuments(id: string, documentIds: number[], scopeVersion: string): Observable<AgentKnowledge> {
    return this.http.put<AgentKnowledge>(`${this.configurations}/${encodeURIComponent(id)}/documents`, { documentIds, scopeVersion });
  }
  askAgent(id: string, question: string, documentId?: number): Observable<SupportAnswer> {
    return this.http.post<SupportAnswer>(`${this.configurations}/${encodeURIComponent(id)}/ask`,
      { question, ...(documentId !== undefined ? { documentId } : {}) });
  }

  listConversations(id: string, offset = 0, limit = 30): Observable<ConversationPage> {
    return this.http.get<ConversationPage>(`${this.configurations}/${encodeURIComponent(id)}/conversations`, { params: { limit, offset } });
  }
  createConversation(id: string): Observable<SupportConversation> {
    return this.http.post<SupportConversation>(`${this.configurations}/${encodeURIComponent(id)}/conversations`, {});
  }
  getConversation(id: string, conversationId: string, before?: number): Observable<ConversationHistory> {
    return this.http.get<ConversationHistory>(`${this.configurations}/${encodeURIComponent(id)}/conversations/${encodeURIComponent(conversationId)}`,
      { params: { limit: 30, ...(before !== undefined ? { before } : {}) } });
  }
  sendConversationMessage(id: string, conversationId: string, question: string, requestId: string): Observable<ConversationTurn> {
    return this.http.post<ConversationTurn>(`${this.configurations}/${encodeURIComponent(id)}/conversations/${encodeURIComponent(conversationId)}/messages`, { question, requestId });
  }
  deleteConversation(id: string, conversationId: string): Observable<void> {
    return this.http.delete<void>(`${this.configurations}/${encodeURIComponent(id)}/conversations/${encodeURIComponent(conversationId)}`);
  }

}
