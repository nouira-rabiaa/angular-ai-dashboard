import { SupportAgent, SupportAgentConfig, SupportAgentPage, SupportAgentStatus } from '../models/support-agent.model';
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AgentRunRequest, AgentRunResponse } from '../models/agent-run.model';

@Injectable({ providedIn: 'root' })
export class AgentService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = 'http://localhost:3000/api/agent/run';

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

  run(goal: string): Observable<AgentRunResponse> {
    const request: AgentRunRequest = { goal };
    return this.http.post<AgentRunResponse>(this.endpoint, request);
  }
}