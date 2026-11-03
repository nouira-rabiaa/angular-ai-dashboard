import { emptySupportAgent } from '../models/support-agent.model';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { AgentRunResponse } from '../models/agent-run.model';
import { AgentService } from './agent.service';

describe('AgentService', () => {
  let service: AgentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AgentService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(AgentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the configuration resource and versioned HTTP methods without calling run', () => {
    const base = 'http://localhost:3000/api/agents';
    service.listAgents().subscribe();http.expectOne(base + '?limit=50&offset=0').flush({ items: [], total: 0, limit: 50, offset: 0 });
    service.getAgent('id').subscribe();http.expectOne(base + '/id').flush({ id: 'id' });
    const config = emptySupportAgent();
    service.createAgent(config).subscribe();const create = http.expectOne(base);expect(create.request.method).toBe('POST');expect(create.request.body).toEqual(config);create.flush({ id: 'id' });
    service.updateAgent('id', config, 2).subscribe();const update = http.expectOne(base + '/id');expect(update.request.method).toBe('PUT');expect(update.request.body.version).toBe(2);update.flush({ id: 'id' });
    service.setAgentStatus('id', 'active', 3).subscribe();const status = http.expectOne(base + '/id/status');expect(status.request.method).toBe('PATCH');expect(status.request.body).toEqual({ status: 'active', version: 3 });status.flush({ id: 'id' });
    http.expectNone('http://localhost:3000/api/agent/run');
  });

  it('uses scoped document and preview endpoints without calling legacy run/chat', () => {
    const url = 'http://localhost:3000/api/agents/id';
    service.getAgentDocuments('id').subscribe();http.expectOne(url + '/documents').flush({ documentIds: [], documents: [], scopeVersion: 'scope' });
    service.setAgentDocuments('id', [1], 'scope').subscribe();const update = http.expectOne(url + '/documents');expect(update.request.method).toBe('PUT');expect(update.request.body).toEqual({ documentIds: [1], scopeVersion: 'scope' });update.flush({ documentIds: [1], documents: [], scopeVersion: 'next' });
    service.askAgent('id', 'retour article', 1).subscribe();const ask = http.expectOne(url + '/ask');expect(ask.request.body).toEqual({ question: 'retour article', documentId: 1 });ask.flush({ status: 'abstained', sources: [] });
    http.expectNone('http://localhost:3000/api/agent/run');http.expectNone('http://localhost:3000/api/chat');
  });

  it('posts the goal and returns the typed run response', () => {
    const response: AgentRunResponse = {
      runId: 'run-123',
      status: 'completed',
      answer: 'There are 3 submissions.',
      trace: [{
        step: 1,
        tool: 'count_form_submissions',
        status: 'completed',
        result: { count: 3 }
      }]
    };
    let actual: AgentRunResponse | undefined;

    service.run('Count form submissions').subscribe(result => actual = result);

    const request = http.expectOne('http://localhost:3000/api/agent/run');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ goal: 'Count form submissions' });
    request.flush(response);
    expect(actual).toEqual(response);
  });
});