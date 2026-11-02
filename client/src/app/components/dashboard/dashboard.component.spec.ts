import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { LOCALE_ID, registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { DashboardDataService, DashboardMetrics } from '../../services/dashboard-data.service';
import { DashboardComponent } from './dashboard.component';

const metrics: DashboardMetrics = {
  range: { from: '2026-10-01', to: '2026-10-27' },
  requestCount: 8,
  successCount: 6,
  noMatchCount: 1,
  errorCount: 1,
  averageLatencyMs: 120.5,
  inputTokens: 1000,
  outputTokens: 300,
  totalTokens: 1300,
  estimatedCostUsd: 0.0012,
  pricedRequestCount: 5,
  unpricedRequestCount: 3,
  retrievedChunkCount: 12
};

function dashboardService(overrides: Record<string, unknown> = {}) {
  return {
    getMetrics: jest.fn().mockReturnValue(of(metrics)),
    getTimeseries: jest.fn().mockReturnValue(of({ range: metrics.range, items: [] })),
    getInferences: jest.fn().mockReturnValue(of({ total: 0, limit: 25, offset: 0, items: [] })),
    getInferenceDetail: jest.fn().mockReturnValue(of({ traceId: 'trace-1', steps: [] })),
    getDocuments: jest.fn().mockReturnValue(of({ total: 0, totalChunks: 0, limit: 25, offset: 0, items: [] })),
    getFormSubmissions: jest.fn().mockReturnValue(of({ total: 0, limit: 25, offset: 0, items: [] })),
    ...overrides
  };
}

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;
  let data: ReturnType<typeof dashboardService>;

  beforeAll(() => registerLocaleData(localeFr, 'fr-FR'));

  function createComponent(service = dashboardService()): void {
    data = service;
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'fr-FR' },
        { provide: DashboardDataService, useValue: data }
      ]
    });
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  }

  beforeEach(() => {
    jest.spyOn(DashboardComponent.prototype as any, 'fetchCiStatus').mockImplementation(function(this: DashboardComponent) {
      this.ciStatus.set({ status: 'unknown', message: 'Unavailable in tests', loading: false });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders real metrics and shows pricing coverage without fake fallbacks', () => {
    createComponent();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Requêtes IA');
    expect(text).toContain('8');
    expect(text).toContain('$0.00120000 USD');
    expect(text).toContain('5 tarifées · 3 sans tarif');
    expect(text).toContain('120,5 ms');
    expect(text).not.toContain('142');
    expect(text).not.toContain('1,248');
    expect(text).not.toContain('$3.45');
  });

  it('shows loading, empty and error states from actual API state', () => {
    const pending = new Observable<DashboardMetrics>(() => undefined);
    createComponent(dashboardService({ getMetrics: jest.fn().mockReturnValue(pending) }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Chargement des métriques');

    component.overviewState.set('error');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Métriques indisponibles');
  });

  it('exposes four views and keeps AI execution separate from form submissions', () => {
    createComponent();
    fixture.detectChanges();
    const labels = Array.from(fixture.nativeElement.querySelectorAll('[role="tab"]'))
      .map((tab: Element) => tab.textContent?.trim());
    expect(labels).toEqual(['Vue d’ensemble', 'Historique IA', 'Documents', 'Soumissions']);

    component.selectView('forms');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Soumissions de formulaires');
    expect(fixture.nativeElement.textContent).toContain('métadonnées');
    expect(fixture.nativeElement.textContent).not.toContain('Étapes d’exécution');
  });

  it('renders paginated inference metadata and opens ordered trace detail', () => {
    const inference = {
      traceId: 'trace-1', timestamp: '2026-10-26T12:00:00.000Z',
      modelIdentifier: 'openai/gpt-oss-120b', status: 'success', scope: 'all', documentId: null,
      inputTokens: null, outputTokens: null, totalTokens: null, usageSource: 'unavailable',
      estimatedCostUsd: null, pricingModelId: null, pricingSource: null,
      totalDurationMs: 100.25, retrievalDurationMs: 2, contextPreparationDurationMs: 1,
      groqDurationMs: 95, retrievedChunkCount: 2
    };
    const stepDetail = { ...inference, steps: [
      { stepIndex: 0, name: 'request-validation', status: 'success', durationMs: 0.2 },
      { stepIndex: 1, name: 'groq-inference', status: 'success', durationMs: 95 }
    ] };
    createComponent(dashboardService({
      getInferences: jest.fn().mockReturnValue(of({ total: 1, limit: 25, offset: 0, items: [inference] })),
      getInferenceDetail: jest.fn().mockReturnValue(of(stepDetail))
    }));
    component.selectView('inferences');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Not available');
    expect(fixture.nativeElement.textContent).toContain('100,25 ms');
    expect(fixture.nativeElement.textContent).toContain('trace-1');

    component.openTrace(inference as any);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Étapes d’exécution');
    expect(fixture.nativeElement.textContent).toContain('request-validation');
    expect(fixture.nativeElement.textContent).toContain('groq-inference');
    expect(data.getInferenceDetail).toHaveBeenCalledWith('trace-1');
  });

  it('renders document counts and links upload to the existing generator flow', () => {
    createComponent(dashboardService({
      getDocuments: jest.fn().mockReturnValue(of({
        total: 1, totalChunks: 2, limit: 25, offset: 0,
        items: [{ documentId: 7, filename: 'report.pdf', fileType: 'pdf', status: 'Success', createdAt: '2026-10-25T10:00:00.000Z', chunksCount: 2, characterCount: 90 }]
      }))
    }));
    component.selectView('documents');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('2 chunks persistés');
    expect(fixture.nativeElement.textContent).toContain('report.pdf');
    expect(fixture.nativeElement.querySelector('a[routerLink="/generator"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Re-indexer');
    expect(fixture.nativeElement.textContent).not.toContain('High Confidence');
  });

  it('queries form metadata without rendering or exporting payload content', () => {
    createComponent(dashboardService({
      getFormSubmissions: jest.fn().mockReturnValue(of({
        total: 1, limit: 25, offset: 0,
        items: [{ id: 21, createdAt: '2026-10-26T11:00:00.000Z', status: 'submitted' }]
      }))
    }));
    component.selectView('forms');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('#21');
    expect(text).toContain('métadonnées');
    expect(text).not.toContain('form_data');
    expect(text).not.toContain('email');
    component.applySubmissionSearch('2026-10');
    expect(data.getFormSubmissions).toHaveBeenLastCalledWith(25, 0, '2026-10');
  });

  it('displays unknown CI status instead of fabricated success on unavailable data', () => {
    createComponent();
    component.ciStatus.set({ status: 'unknown', message: 'GitHub Actions unavailable', loading: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Unavailable in tests');
    expect(fixture.nativeElement.textContent).not.toContain('All Tests Passing');
  });

  it('derives chart points from actual API series and handles one-day and empty datasets', () => {
    createComponent();
    const singleDay = [{
      date: '2026-10-27', requestCount: 4, averageLatencyMs: 120,
      estimatedCostUsd: null, pricedRequestCount: 0, unpricedRequestCount: 4
    }];
    expect(component.chartHeight(120, singleDay)).toBe(100);
    expect(component.chartPosition(0, 1)).toBe(50);
    expect(component.latencyChartPoints(singleDay)).toBe('296,45');
    expect(component.totalRequests(singleDay)).toBe(4);
    expect(component.totalPricedRequests(singleDay)).toBe(0);
    expect(component.latencyChartPoints([])).toBe('');
    expect(component.chartHeight(null, singleDay)).toBe(0);
  });
});
