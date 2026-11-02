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