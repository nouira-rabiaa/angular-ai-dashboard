const usdFr = (value: number, decimals: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
import { provideUiI18nTesting } from '../../i18n/ui-i18n.testing';
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
      providers: [...provideUiI18nTesting(),
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
      this.ciStatus.set({ status: 'unknown', message: 'dashboard.statut_indisponible', loading: false });
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
    expect(text).toContain(usdFr(0.00, 2));
    expect(component.metrics()?.estimatedCostUsd).toBe(0.0012);
    expect(component.formatCost(0.0012)).toBe(usdFr(0.00120000, 8));
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
    expect(labels).toEqual(['Vue d’ensemble', 'Historique IA', 'Documents', 'Soumissions de formulaires']);

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
      getInferences: jest.fn().mockReturnValue(of({ total: 51, limit: 25, offset: 0, items: [inference] })),
      getInferenceDetail: jest.fn().mockReturnValue(of(stepDetail))
    }));
    component.selectView('inferences');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Indisponible');
    expect(fixture.nativeElement.textContent).toContain('100,25 ms');
    expect(fixture.nativeElement.textContent).toContain('trace-1');

    (fixture.nativeElement.querySelector('button[aria-label="Page suivante"]') as HTMLButtonElement).click();
    expect(data.getInferences).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 }));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button[aria-label="Page précédente"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(data.getInferences).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }));
    (fixture.nativeElement.querySelector('tbody button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Étapes d’exécution');
    expect(fixture.nativeElement.textContent).toContain('Validation de la requête');
    expect(fixture.nativeElement.textContent).toContain('Inférence');
    expect(data.getInferenceDetail).toHaveBeenCalledWith('trace-1');
    (fixture.nativeElement.querySelector('button[aria-label="Fermer les détails"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
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
    const search = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = '2026-10';
    search.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    expect(data.getFormSubmissions).toHaveBeenLastCalledWith(25, 0, '2026-10');
  });

  it('displays unknown CI status instead of fabricated success on unavailable data', () => {
    createComponent();
    component.ciStatus.set({ status: 'unknown', message: 'dashboard.github_actions_indisponible', loading: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Statut indisponible');
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

  it('combines period metrics with FinOps in one headline row and preserves period controls', () => {
    createComponent();fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent).toBe('Tableau de bord');
    const headline = root.querySelector('.finops-kpis')!;
    expect(headline.querySelectorAll('article')).toHaveLength(4);
    expect(headline.textContent).toContain('Requêtes IA');
    expect(headline.textContent).toContain('Tokens consommés');
    expect(headline.textContent).toContain('Coût observé estimé');
    expect(headline.textContent).toContain('Estimation de fin de mois');
    expect(headline.textContent).not.toContain('Latence moyenne');
    expect(root.querySelector('.dashboard-secondary')?.textContent).toContain('Latence moyenne');
    expect(root.querySelector('.dashboard-secondary')?.textContent).toContain('Coût estimé · période');
    expect(root.textContent).toContain('Tokens consommés');
    expect(root.textContent).toContain('Couverture des tests : non publiée');
    const dates = root.querySelectorAll<HTMLInputElement>('input[type="date"]');
    dates[0].value = '2026-10-01';dates[1].value = '2026-10-27';
    root.querySelector<HTMLButtonElement>('.dashboard-period button')!.click();
    expect(data.getMetrics).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-27' });
    expect(data.getTimeseries).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-27' });
    expect(data.getInferences).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-10-01', to: '2026-10-27', offset: 0 }));
  });

  it('keeps FinOps independent from unavailable overview metrics and wires rendered filters', () => {
    createComponent();fixture.detectChanges();
    component.overviewState.set('error');fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-finops')).not.toBeNull();
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLButtonElement>;
    tabs[1].click();fixture.detectChanges();
    const filters = fixture.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>;
    filters[0].value = 'error';filters[0].dispatchEvent(new Event('change'));fixture.detectChanges();
    filters[1].value = 'document';filters[1].dispatchEvent(new Event('change'));fixture.detectChanges();
    expect(data.getInferences).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error', scope: 'document', offset: 0 }));
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('exports only existing submission metadata from the rendered export button', async () => {
    createComponent(dashboardService({ getFormSubmissions: jest.fn().mockReturnValue(of({ total: 1, limit: 25, offset: 0,
      items: [{ id: 21, createdAt: '2026-10-26T11:00:00.000Z', status: 'submitted' }] })) }));
    component.selectView('forms');fixture.detectChanges();
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const create = jest.fn().mockReturnValue('blob:metadata-export');const revoke = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
      buttons.find(button => button.textContent?.includes('Exporter'))!.click();
      expect(create).toHaveBeenCalledTimes(1);expect(revoke).toHaveBeenCalledWith('blob:metadata-export');
      const csv = await new Promise<string>(resolve => { const reader = new FileReader();reader.onload = () => resolve(String(reader.result));reader.readAsText(create.mock.calls[0][0]); });
      expect(csv).toBe('ID,Date,Status\r\n"21","2026-10-26T11:00:00.000Z","submitted"');
    } finally {
      if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);else delete (URL as any).createObjectURL;
      if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);else delete (URL as any).revokeObjectURL;
    }
  });

  it('keeps real secondary metrics mounted inside closed advanced analytics', () => {
    createComponent();fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    const advanced=root.querySelector<HTMLDetailsElement>('.finops-advanced')!;
    expect(advanced.open).toBe(false);
    const secondary=root.querySelector('.dashboard-secondary');
    expect(advanced.contains(secondary)).toBe(true);
    expect(root.querySelectorAll('.finops-kpis article')).toHaveLength(4);
    advanced.open=true;fixture.detectChanges();advanced.open=false;fixture.detectChanges();
    expect(root.querySelector('.dashboard-secondary')).toBe(secondary);
    expect(root.querySelector('.dashboard-ci-link')).not.toBeNull();
  });

  it('projects the real date filter into the same toolbar as FinOps refresh', () => {
    createComponent();fixture.detectChanges();const root=fixture.nativeElement as HTMLElement;
    const toolbar=root.querySelector('.toolbar')!;
    const dates=toolbar.querySelectorAll<HTMLInputElement>('input[type=date]');expect(dates).toHaveLength(2);
    expect(dates[0].value).toBe(component.dateRange().from);expect(dates[1].value).toBe(component.dateRange().to);
    expect(toolbar.querySelector('.refresh')).not.toBeNull();
    const apply=jest.spyOn(component,'setDateRange').mockImplementation(()=>{});
    dates[0].value='2026-10-01';dates[1].value='2026-10-15';
    (Array.from(toolbar.querySelectorAll('button')).find(button=>button.textContent?.includes('Appliquer')) as HTMLButtonElement).click();
    expect(apply).toHaveBeenCalledWith('2026-10-01','2026-10-15');
  });
  it('distinguishes zero tokens and requests from unavailable metrics', () => {
    createComponent(dashboardService({getMetrics:jest.fn().mockReturnValue(of({...metrics,requestCount:0,totalTokens:0}))}));fixture.detectChanges();
    const cards=fixture.nativeElement.querySelectorAll('.dashboard-kpi');
    expect(cards[0].querySelector('[data-state]').getAttribute('data-state')).toBe('available');
    expect(cards[1].querySelector('[data-state]').getAttribute('data-state')).toBe('available');
    component.metrics.set({...metrics,totalTokens:null});fixture.detectChanges();
    expect(cards[1].querySelector('[data-state]').getAttribute('data-state')).toBe('unavailable');
  });

  it('preserves accessible active states across all four Premium tabs and shared history controls', () => {
    createComponent();fixture.detectChanges();
    for(const view of component.views) {
      const buttons=Array.from(fixture.nativeElement.querySelectorAll('.dashboard-tabs button')) as HTMLButtonElement[];
      const index=component.views.findIndex(item=>item.id===view.id);
      buttons[index].focus();buttons[index].click();fixture.detectChanges();
      expect(component.activeView()).toBe(view.id);
      expect(buttons.filter(button=>button.getAttribute('aria-selected')==='true')).toHaveLength(1);
      expect(buttons[index].getAttribute('aria-selected')).toBe('true');
      expect(buttons.every(button=>!button.classList.contains('bg-blue-600'))).toBe(true);
      if(view.id==='inferences') {
        const selects=fixture.nativeElement.querySelectorAll('select');
        expect(selects).toHaveLength(2);
        expect(selects[0].classList.contains('studio-control')).toBe(true);
        expect(selects[1].classList.contains('studio-control')).toBe(true);
        expect(Array.from(selects[0].options).map((option:any)=>option.value)).toEqual(['','success','no_match','error']);
        expect(Array.from(selects[1].options).map((option:any)=>option.value)).toEqual(['','document','all']);
      }
    }
  });

});
