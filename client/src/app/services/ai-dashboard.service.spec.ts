import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AiDashboardService } from './ai-dashboard.service';

describe('AiDashboardService', () => {
  let service: AiDashboardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AiDashboardService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(AiDashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('devrait être créé', () => {
    expect(service).toBeTruthy();
  });

  it('devrait envoyer une requête HTTP POST pour le pipeline RAG', () => {
    const mockResponse = { answer: 'Résultat RAG', tokens: 42 };

    service.queryRagPipeline('test query').subscribe((res) => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne('/api/rag/query');
    expect(req.request.method).toBe('POST');
    req.flush(mockResponse);
  });
});