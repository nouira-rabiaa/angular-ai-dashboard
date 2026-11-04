import { PRESERVE_HTTP_ERROR } from '../interceptors/preserve-http-error';
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { SupportTicket, TicketDraft, TicketPage, TicketEventPage, TicketFilters, TicketStatus, TicketPriority, TicketCategory } from '../models/support-ticket.model';
@Injectable({ providedIn: 'root' })
export class SupportTicketService {
  private readonly http = inject(HttpClient);
  private readonly context = new HttpContext().set(PRESERVE_HTTP_ERROR, true);
  private url(agentId: string) { return `http://localhost:3000/api/agents/${encodeURIComponent(agentId)}/tickets`; }
  list(agentId: string, filters: TicketFilters, offset = 0) {
    const params: Record<string, string | number> = { limit: 25, offset };
    for (const [key, value] of Object.entries(filters)) if (value) params[key] = value;
    return this.http.get<TicketPage>(this.url(agentId), { params, context: this.context });
  }
  create(agentId: string, draft: TicketDraft) { return this.http.post<SupportTicket>(this.url(agentId), draft, { context: this.context }); }
  get(agentId: string, id: string) { return this.http.get<SupportTicket>(`${this.url(agentId)}/${encodeURIComponent(id)}`, { context: this.context }); }
  update(agentId: string, id: string, data: { version: number; status: TicketStatus; priority: TicketPriority; category: TicketCategory }) {
    return this.http.patch<SupportTicket>(`${this.url(agentId)}/${encodeURIComponent(id)}`, data, { context: this.context });
  }
  events(agentId: string, id: string, offset = 0) { return this.http.get<TicketEventPage>(`${this.url(agentId)}/${encodeURIComponent(id)}/events`, { params: { limit: 25, offset }, context: this.context }); }
}
