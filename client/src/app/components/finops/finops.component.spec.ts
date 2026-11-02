import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { FinopsComponent } from './finops.component';
import { FinopsService, FinopsSummary } from '../../services/finops.service';

const summary = (overrides: Partial<FinopsSummary> = {}): FinopsSummary => ({
  currency: 'USD', isEstimate: true, today: '2026-10-11', monthStart: '2026-10-01', monthDays: 31,
  sample: { from: '2026-10-01', to: '2026-10-10', days: 10, activeDays: 10, requestCount: 20, pricedRequestCount: 20, unpricedRequestCount: 0 },
  status: 'ready', reason: null, dailyRateUsd: 2, projected7DaysUsd: 14, projected30DaysUsd: 60,
  observedMonthUsd: 25, monthRequestCount: 22, monthPricedRequestCount: 22, monthCoverageComplete: true,
  projectedMonthEndUsd: 65, monthlyBudgetUsd: 100,
  observedBudget: { percent: 25, level: 'ok' }, projectedBudget: { percent: 65, level: 'ok' },
  historical: [{ date: '2026-10-10', estimatedCostUsd: 2 }], projected: [{ date: '2026-10-11', estimatedCostUsd: 2 }],
  models: [{ model: 'model', requestCount: 22, pricedRequestCount: 22, estimatedCostUsd: 25 }],
  pricing: [{ model: 'model', inputUsdPerMillion: 2, outputUsdPerMillion: 4 }], ...overrides
});

describe('FinopsComponent', () => {
  let fixture: ComponentFixture<FinopsComponent>;
  let component: FinopsComponent;
  let api: { getSummary: jest.Mock; saveBudget: jest.Mock; simulate: jest.Mock };
  beforeEach(async () => {
    api = { getSummary: jest.fn().mockReturnValue(of(summary())), saveBudget: jest.fn().mockReturnValue(of({ monthlyBudgetUsd: 100 })),
      simulate: jest.fn().mockReturnValue(of({ status: 'ready', costPerRequestUsd: 0.004, monthlyCostUsd: 12.4, monthDays: 31, budget: { percent: 124, level: 'exceeded' } })) };
    await TestBed.configureTestingModule({ imports: [FinopsComponent], providers: [{ provide: FinopsService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(FinopsComponent);component = fixture.componentInstance;
  });
  const text = () => fixture.nativeElement.textContent as string;

  it('renders observed costs separately from 7/30-day and month-end estimates and sample coverage', () => {
    fixture.detectChanges();
    expect(text()).toContain('$14.00000000 USD');expect(text()).toContain('$60.00000000 USD');expect(text()).toContain('$65.00000000 USD');
    expect(text()).toContain('20 / 20');expect(text()).toContain('jamais des montants facturés');
    expect(fixture.nativeElement.querySelector('svg[role="img"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('table caption').textContent).toContain('USD');
  });

  it('renders loading and recoverable error states without fabricated values', () => {
    api.getSummary.mockReturnValue(new Observable(() => undefined));fixture.detectChanges();
    expect(text()).toContain('Chargement FinOps');
    api.getSummary.mockReturnValue(throwError(() => new Error('local telemetry disabled')));component.load();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('FinOps indisponible');
    expect(text()).not.toContain('$0.00000000');
  });

  it('shows empty, insufficient-data and missing-pricing states with no numeric forecast', () => {
    api.getSummary.mockReturnValue(of(summary({ status: 'insufficient_data', reason: 'insufficient_history', pricing: [],
      sample: { from: null, to: '2026-10-10', days: 0, activeDays: 0, requestCount: 0, pricedRequestCount: 0, unpricedRequestCount: 0 },
      monthRequestCount: 0, observedMonthUsd: null, projected7DaysUsd: null, projected30DaysUsd: null, projectedMonthEndUsd: null, historical: [], projected: [] })));
    fixture.detectChanges();
    expect(text()).toContain('Données insuffisantes');expect(text()).toContain('Aucun historique');expect(text()).toContain('aucun tarif valide');
    expect(text()).toContain('Indisponible');expect(text()).not.toContain('$0.00000000');
    expect(fixture.nativeElement.querySelector('select[name="model"]')).toBeNull();
  });

  it('shows partial-cost coverage and never bridges missing historical costs on the chart', () => {
    api.getSummary.mockReturnValue(of(summary({ status: 'unavailable', monthCoverageComplete: false, projected: [],
      projected7DaysUsd: null, projected30DaysUsd: null, projectedMonthEndUsd: null,
      historical: [{ date: '2026-10-08', estimatedCostUsd: 1 }, { date: '2026-10-09', estimatedCostUsd: null }, { date: '2026-10-10', estimatedCostUsd: 2 }] })));
    fixture.detectChanges();
    expect(text()).toContain('certains coûts historiques');expect(text()).toContain('sous-total partiel');
    expect(component.segments(false)).toHaveLength(2);
    expect(component.chart()[1].y).toBeNull();
  });

  it('distinguishes observed 80% alerts from projected 100% alerts and clamps progress', () => {
    api.getSummary.mockReturnValue(of(summary({ observedBudget: { percent: 80, level: 'warning' }, projectedBudget: { percent: 120, level: 'exceeded' } })));
    fixture.detectChanges();expect(text()).toContain('Observé estimé : Alerte 80 %');expect(text()).toContain('Projection fin de mois : Alerte 100 %');
    const progress = fixture.nativeElement.querySelectorAll('progress');expect(progress[0].value).toBe(80);expect(progress[1].value).toBe(100);
    expect(progress[0].getAttribute('aria-label')).toContain('Observé');
  });

  it('saves the budget through the rendered form and refreshes the persisted summary', async () => {
    fixture.detectChanges();await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('input[name="monthlyBudget"]') as HTMLInputElement;
    input.value = '200';input.dispatchEvent(new Event('input'));fixture.detectChanges();await fixture.whenStable();
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));fixture.detectChanges();
    expect(api.saveBudget).toHaveBeenCalledWith(200);expect(api.getSummary).toHaveBeenCalledTimes(2);expect(text()).toContain('Budget enregistré');
  });

  it('submits scenario parameters through the rendered form without an AI call', async () => {
    fixture.detectChanges();await fixture.whenStable();
    fixture.nativeElement.querySelectorAll('form')[1].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));fixture.detectChanges();
    expect(api.simulate).toHaveBeenCalledWith({ model: 'model', requestsPerDay: 100, inputTokens: 1000, outputTokens: 300, monthlyBudgetUsd: null });
    expect(text()).toContain('$0.00400000 USD');expect(text()).toContain('$12.40000000 USD');expect(text()).toContain('31 jours');
  });

  it('renders simulation loading, missing-rate, error and budget persistence failures', async () => {
    fixture.detectChanges();await fixture.whenStable();
    api.simulate.mockReturnValue(new Observable(() => undefined));component.simulate();fixture.detectChanges();
    await fixture.whenStable();fixture.detectChanges();expect(text()).toContain('Calcul de la simulation');
    const scenarioInputs = fixture.nativeElement.querySelectorAll('section[aria-labelledby="finops-simulator-title"] input, section[aria-labelledby="finops-simulator-title"] select') as NodeListOf<HTMLInputElement>;
    expect(scenarioInputs).toHaveLength(5);
    scenarioInputs.forEach(input => expect(input.disabled).toBe(true));
    api.simulate.mockReturnValue(of({ status: 'unavailable', monthlyCostUsd: null, costPerRequestUsd: null }));component.simulate();fixture.detectChanges();expect(text()).toContain('tarif non configuré');
    api.simulate.mockReturnValue(throwError(() => new Error('bad params')));component.simulate();fixture.detectChanges();expect(text()).toContain('Simulation impossible');
    api.saveBudget.mockReturnValue(throwError(() => new Error('DB unavailable')));component.saveBudget();fixture.detectChanges();expect(text()).toContain('Budget non enregistré');
  });
});
