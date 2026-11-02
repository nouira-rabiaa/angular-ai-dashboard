import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardDataService } from './dashboard-data.service';

describe('DashboardDataService', () => {
  let service: DashboardDataService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DashboardDataService, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(DashboardDataService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests bounded aggregate and time-series endpoints with date parameters', () => {
    const range = { from: '2026-10-01', to: '2026-10-27' };
    service.getMetrics(range).subscribe(result => expect(result.requestCount).toBe(2));
    const metrics = http.expectOne(request => request.url === 'http://localhost:3000/api/dashboard/metrics');
    expect(metrics.request.params.get('from')).toBe(range.from);
    metrics.flush({ range, requestCount: 2 });

    service.getTimeseries(range).subscribe(result => expect(result.items).toHaveLength(0));
    const series = http.expectOne(request => request.url.endsWith('/timeseries'));
    expect(series.request.params.get('to')).toBe(range.to);
    series.flush({ range, items: [] });
  });

  it('requests filtered paginated inference history, trace details, documents, and submission metadata', () => {
    service.getInferences({ from: '2026-10-01', to: '2026-10-27', limit: 25, offset: 50, status: 'error', scope: 'document' }).subscribe();
    const history = http.expectOne(request => request.url.endsWith('/inferences'));
    expect(history.request.params.get('limit')).toBe('25');
    expect(history.request.params.get('offset')).toBe('50');
    expect(history.request.params.get('status')).toBe('error');
    expect(history.request.params.get('scope')).toBe('document');
    history.flush({ total: 0, items: [] });

    service.getInferenceDetail('trace-a').subscribe();
    http.expectOne('http://localhost:3000/api/dashboard/inferences/trace-a').flush({ traceId: 'trace-a', steps: [] });

    service.getDocuments(25, 0).subscribe();
    http.expectOne(request => request.url.endsWith('/documents')).flush({ total: 0, totalChunks: 0, items: [] });

    service.getFormSubmissions(25, 0, '2026-10').subscribe();
    const forms = http.expectOne(request => request.url.endsWith('/form-submissions'));
    expect(forms.request.params.get('q')).toBe('2026-10');
    forms.flush({ total: 0, items: [] });
  });
});
