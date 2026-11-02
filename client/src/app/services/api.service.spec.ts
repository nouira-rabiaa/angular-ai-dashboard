import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let service: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ApiService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('accepts a legacy chat response without optional citation fields', () => {
    let response: unknown;

    service.sendChatPrompt('Legacy question').subscribe(result => response = result);

    const request = http.expectOne('http://localhost:3000/api/chat');
    expect(request.request.method).toBe('POST');
    request.flush({ reply: 'Legacy answer.' });
    expect(response).toEqual({ reply: 'Legacy answer.' });
  });

  it('sends an active documentId or explicit null for all-document scope', () => {
    service.sendChatPrompt('Scoped question', 31).subscribe();
    const scopedRequest = http.expectOne('http://localhost:3000/api/chat');
    expect(scopedRequest.request.body).toEqual({ prompt: 'Scoped question', documentId: 31 });
    scopedRequest.flush({ reply: 'Scoped answer.' });

    service.sendChatPrompt('Global question', null).subscribe();
    const allDocumentsRequest = http.expectOne('http://localhost:3000/api/chat');
    expect(allDocumentsRequest.request.body).toEqual({ prompt: 'Global question', documentId: null });
    allDocumentsRequest.flush({ reply: 'Global answer.' });
  });
});