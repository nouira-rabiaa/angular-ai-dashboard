import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AgentRunRequest, AgentRunResponse } from '../models/agent-run.model';

@Injectable({ providedIn: 'root' })
export class AgentService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = 'http://localhost:3000/api/agent/run';

  run(goal: string): Observable<AgentRunResponse> {
    const request: AgentRunRequest = { goal };
    return this.http.post<AgentRunResponse>(this.endpoint, request);
  }
}