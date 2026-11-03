import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { provideUiI18nTesting } from './ui-i18n.testing';
import { UiLanguageService } from './ui-language.service';
import { ChatComponent } from '../components/chat/chat.component';
import { DynamicFormComponent } from '../components/dynamic-form/dynamic-form.component';
import { FinopsComponent } from '../components/finops/finops.component';
import { DashboardComponent } from '../components/dashboard/dashboard.component';
import { GuidedDemoComponent } from '../components/guided-demo/guided-demo.component';
import { ArchitectureExplorerComponent } from '../components/architecture-explorer/architecture-explorer.component';
import { AgentKnowledgeComponent } from '../components/agent-workspace/agent-knowledge.component';
import { ApiService } from '../services/api.service';
import { FinopsService, FinopsSummary } from '../services/finops.service';
import { DashboardDataService } from '../services/dashboard-data.service';
import { AgentService } from '../services/agent.service';
import { emptySupportAgent } from '../models/support-agent.model';
import { DynamicFormSchema } from '../models/dynamic-form.model';

const summary: FinopsSummary = {
  currency: 'USD', isEstimate: true, today: '2026-11-10', monthStart: '2026-11-01', monthDays: 30,
  sample: { from: '2026-11-01', to: '2026-11-09', days: 9, activeDays: 3, requestCount: 1000, pricedRequestCount: 1000, unpricedRequestCount: 0 },
  status: 'ready', reason: null, dailyRateUsd: 12.3, projected7DaysUsd: 86.1, projected30DaysUsd: 369,
  observedMonthUsd: 80, monthRequestCount: 1000, monthPricedRequestCount: 1000, monthCoverageComplete: true,
  projectedMonthEndUsd: 100, monthlyBudgetUsd: 100, observedBudget: { percent: 80, level: 'warning' }, projectedBudget: { percent: 100, level: 'exceeded' },
  historical: [{ date: '2026-11-09', estimatedCostUsd: 12.3 }], projected: [{ date: '2026-11-10', estimatedCostUsd: 12.3 }],
  models: [{ model: 'openai/gpt-oss-120b', requestCount: 1000, pricedRequestCount: 1000, estimatedCostUsd: 80 }],
  pricing: [{ model: 'openai/gpt-oss-120b', inputUsdPerMillion: .15, outputUsdPerMillion: .6 }]
};
const schema: DynamicFormSchema = { title: 'Titre métier conservé', description: 'Description métier', fields: [
  { name: 'business_value', label: 'Libellé issu du modèle', type: 'text', placeholder: 'Texte du modèle', required: true },
  { name: 'choice', label: 'Choix métier', type: 'select', options: [{ label: 'Valeur métier', value: 'unchanged_code' }] }
] };

describe('UX-3B workspace localization without business mutations', () => {
  let finops: { getSummary: jest.Mock; saveBudget: jest.Mock; simulate: jest.Mock };
  let api: { sendChatPrompt: jest.Mock; generateFormSchema: jest.Mock; uploadDocument: jest.Mock; submitDynamicForm: jest.Mock };
  let agents: { getAgentDocuments: jest.Mock; askAgent: jest.Mock };
  beforeEach(() => {
    finops = { getSummary: jest.fn().mockReturnValue(of(summary)), saveBudget: jest.fn(), simulate: jest.fn() };
    api = { sendChatPrompt: jest.fn(), generateFormSchema: jest.fn(), uploadDocument: jest.fn(), submitDynamicForm: jest.fn() };
    agents = { getAgentDocuments: jest.fn().mockReturnValue(of({ documentIds: [], documents: [], scopeVersion: 'scope' })), askAgent: jest.fn() };
    jest.spyOn(DashboardComponent.prototype, 'fetchCiStatus').mockImplementation(() => {});
    TestBed.configureTestingModule({ imports: [ChatComponent, FinopsComponent, DashboardComponent, GuidedDemoComponent, ArchitectureExplorerComponent, AgentKnowledgeComponent], providers: [
      ...provideUiI18nTesting(), provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: FinopsService, useValue: finops }, { provide: ApiService, useValue: api }, { provide: AgentService, useValue: agents },
      { provide: DashboardDataService, useValue: {
        getMetrics: () => of({ requestCount: 1234, successCount: 1234, noMatchCount: 0, errorCount: 0, totalTokens: null, inputTokens: null, outputTokens: null, averageLatencyMs: null, estimatedCostUsd: null, pricedRequestCount: 0, unpricedRequestCount: 1234 }),
        getTimeseries: () => of({ items: [] }), getInferences: () => of({ items: [], total: 0 }), getDocuments: () => of({ items: [], total: 0, totalChunks: 0 }), getFormSubmissions: () => of({ items: [], total: 0 })
      } }
    ] });
  });
  afterEach(() => { TestBed.inject(HttpTestingController).verify();jest.restoreAllMocks(); });
  const ui = () => TestBed.inject(UiLanguageService);
  const noCalls = () => { for (const mock of Object.values(api)) expect(mock).not.toHaveBeenCalled();TestBed.inject(HttpTestingController).expectNone(() => true); };
  const noKeys = (root: HTMLElement) => expect(root.textContent).not.toMatch(/(?:dashboard|finops|generator|configuration|knowledge|conversations|demo|architecture|workspace)\.[a-z_]+/);

  it('keeps the generator composer, active document, AI reply, citations and generated form draft mounted in FR/EN', async () => {
    const fixture = TestBed.createComponent(ChatComponent), c = fixture.componentInstance;
    const reply = { sender: 'ai' as const, text: 'Réponse du fournisseur à conserver [S1].', chatResponse: true,
      formSchema: schema, sources: [{ label: 'S1', filename: 'policy-fr.txt', chunkId: 1, documentId: 7, excerpt: 'Extrait métier à conserver.', cited: true }] };
    c.messages.set([{ sender: 'user', text: 'Question métier française' }, reply]);c.userPrompt.set('Brouillon français');c.activeDocumentId.set(7);c.retrievalScope.set('active');fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#generator-prompt');
    const form = fixture.debugElement.query(By.directive(DynamicFormComponent)).componentInstance as DynamicFormComponent;
    form.formGroup()!.get('business_value')!.setValue('Saisie conservée');form.formGroup()!.markAsDirty();const group = form.formGroup();
    for (const lang of ['en', 'fr'] as const) {
      await ui().use(lang);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('h1').textContent).toBe(lang === 'en' ? 'AI Generator' : 'Générateur IA');
      expect(fixture.nativeElement.querySelector('#generator-prompt')).toBe(input);expect(input.value).toBe('Brouillon français');
      expect(c.messages()[1]).toBe(reply);expect(c.activeDocumentId()).toBe(7);expect(c.retrievalScope()).toBe('active');
      expect(form.formGroup()).toBe(group);expect(group!.dirty).toBe(true);expect(group!.value.business_value).toBe('Saisie conservée');
      expect(fixture.nativeElement.textContent).toContain(reply.text);expect(fixture.nativeElement.textContent).toContain('Extrait métier à conserver.');
      expect(fixture.nativeElement.textContent).toContain('Libellé issu du modèle');expect(fixture.nativeElement.textContent).toContain('Valeur métier');noKeys(fixture.nativeElement);noCalls();
    }
  });

  it('updates existing generator UI notifications but never translates a provider response or sends again', async () => {
    const fixture = TestBed.createComponent(ChatComponent), c = fixture.componentInstance;
    api.sendChatPrompt.mockReturnValue(throwError(() => ({ error: { error: 'FREE_SERVER_TEXT_NOT_FOR_UI' } })));
    c.userPrompt.set('question');c.sendMessage();fixture.detectChanges();const messages = c.messages();
    expect(fixture.nativeElement.textContent).toContain('La requête IA a échoué.');
    await ui().use('en');fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('The AI request failed.');
    expect(fixture.nativeElement.textContent).not.toContain('FREE_SERVER_TEXT_NOT_FOR_UI');expect(c.messages()).toBe(messages);expect(api.sendChatPrompt).toHaveBeenCalledTimes(1);
    expect(api.generateFormSchema).not.toHaveBeenCalled();
  });

  it.each(['fr', 'en'] as const)('renders all dashboard views and unavailable states in %s without fake metrics', async lang => {
    await ui().use(lang);const fixture = TestBed.createComponent(DashboardComponent);fixture.detectChanges();
    const c = fixture.componentInstance, root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')!.textContent).toBe(lang === 'en' ? 'Dashboard' : 'Tableau de bord');
    expect(root.textContent).toContain(new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'fr-FR').format(1234));
    for (const view of c.views) { c.selectView(view.id);fixture.detectChanges();expect(root.textContent).toContain(ui().text(view.label));noKeys(root); }
    c.errorMessage.set('dashboard.impossible_de_charger_le_detail_d_execution');fixture.detectChanges();expect(root.querySelector('[role="alert"]')!.textContent).toBe(lang === 'en' ? 'Unable to load execution details.' : 'Impossible de charger le détail d’exécution.');
    noCalls();
  });

  it('localizes FinOps observed/projected alerts and currency while retaining budget and scenario values', async () => {
    const fixture = TestBed.createComponent(FinopsComponent), c = fixture.componentInstance;fixture.detectChanges();await fixture.whenStable();
    c.budget = 1234.56789;c.scenario.inputTokens = 2345;c.scenario.requestsPerDay = 123;c.budgetMessage.set('finops.budget_enregistre_2');
    const budget = fixture.nativeElement.querySelector('input[name="monthlyBudget"]');const scenario = c.scenario;
    for (const lang of ['en', 'fr'] as const) {
      await ui().use(lang);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
      const alerts = fixture.nativeElement.querySelectorAll('.finops-budget-alert');expect(alerts).toHaveLength(2);
      expect(alerts[0].textContent).toContain(lang === 'en' ? '80% alert' : 'Alerte 80 %');expect(alerts[1].textContent).toContain(lang === 'en' ? '100% alert' : 'Alerte 100 %');
      expect(alerts[0].querySelector('progress').value).toBe(80);expect(alerts[1].querySelector('progress').value).toBe(100);
      expect(c.cost(1234.5, 2)).toBe(new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'fr-FR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234.5));
      expect(c.budget).toBe(1234.56789);expect(c.scenario).toBe(scenario);expect(c.scenario.inputTokens).toBe(2345);expect(fixture.nativeElement.querySelector('input[name="monthlyBudget"]')).toBe(budget);
      expect(finops.getSummary).toHaveBeenCalledTimes(1);expect(finops.saveBudget).not.toHaveBeenCalled();expect(finops.simulate).not.toHaveBeenCalled();noKeys(fixture.nativeElement);
    }
  });

  it.each(['fr', 'en'] as const)('localizes FinOps empty, insufficient, unavailable, loading and error states in %s', async lang => {
    await ui().use(lang);const fixture = TestBed.createComponent(FinopsComponent), c = fixture.componentInstance;fixture.detectChanges();
    c.summary.set({ ...summary, status: 'insufficient_data', sample: { ...summary.sample, requestCount: 0 }, monthRequestCount: 0, historical: [], projected: [], observedMonthUsd: null, projectedMonthEndUsd: null, pricing: [], observedBudget: { level: 'unavailable', percent: null }, projectedBudget: { level: 'unavailable', percent: null } });fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(lang === 'en' ? 'Insufficient data' : 'Données insuffisantes');
    const alerts = fixture.nativeElement.querySelectorAll('.finops-budget-alert');for (const alert of alerts) { expect(alert.textContent).toContain(lang === 'en' ? 'Evaluation unavailable' : 'Évaluation indisponible');expect(alert.querySelector('progress')).toBeNull(); }
    c.state.set('loading');fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain(lang === 'en' ? 'Loading FinOps' : 'Chargement FinOps');
    c.state.set('error');fixture.detectChanges();expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(lang === 'en' ? 'FinOps unavailable' : 'FinOps indisponible');noCalls();
  });

  it.each(['fr', 'en'] as const)('translates all six demo steps and confirmations in %s with no requests', async lang => {
    await ui().use(lang);const fixture = TestBed.createComponent(GuidedDemoComponent), c = fixture.componentInstance;fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('.demo-step');
    for (let i = 0; i < c.steps.length; i++) {
      buttons[i].click();fixture.detectChanges();expect(fixture.nativeElement.querySelector('h2').textContent).toBe(ui().text(c.steps[i].title));
      expect(fixture.nativeElement.textContent).toContain(ui().text(c.steps[i].completionCriteria));
      (fixture.nativeElement.querySelector('.demo-validation button') as HTMLButtonElement).click();fixture.detectChanges();expect(c.stepStatuses()[c.steps[i].id]).toBe('user-confirmed');noKeys(fixture.nativeElement);
    }
    expect(fixture.nativeElement.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('6');noCalls();
  });

  it.each(['fr', 'en'] as const)('translates four architecture flows, diagrams, nodes and inspection in %s', async lang => {
    await ui().use(lang);const fixture = TestBed.createComponent(ArchitectureExplorerComponent), c = fixture.componentInstance;fixture.detectChanges();
    for (const flow of c.flows) {
      const selector = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
      selector.find(button => button.getAttribute('aria-label') === ui().text('workspace.selectFlow', { title: ui().text(flow.title) }))!.click();fixture.detectChanges();
      expect(c.activeFlow().id).toBe(flow.id);expect(fixture.nativeElement.textContent).toContain(ui().text(flow.purpose));
      for (const node of c.diagramNodes()) {
        fixture.nativeElement.querySelector(`[data-node-id="${node.id}"]`).click();fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('#node-details-title').textContent).toBe(ui().text(node.name));expect(fixture.nativeElement.textContent).toContain(ui().text(node.description));
      }
      expect(fixture.nativeElement.querySelectorAll('svg.architecture-map path[data-edge-id]')).toHaveLength(flow.edgeIds.length);noKeys(fixture.nativeElement);
    }
    noCalls();
  });

  it('localizes the independent tester without changing question, authorized scope, reply or citations', async () => {
    const fixture = TestBed.createComponent(AgentKnowledgeComponent), c = fixture.componentInstance;
    const agent = { ...emptySupportAgent(), id: 'agent', name: 'Nom métier français', version: 1, status: 'active', createdAt: '', updatedAt: '' };
    fixture.componentRef.setInput('agent', agent);fixture.componentRef.setInput('mode', 'test');fixture.detectChanges();
    c.question = 'Brouillon de question';c.documentId = 7;
    const answer = { status: 'abstained' as const, reason: 'no_matching_context', reply: 'Message métier non traduit', durationMs: 0, sources: [], citationValidation: { validLabels: [], invalidLabels: [], sourceIdentityValidated: true, factualEntailmentValidated: false } };
    c.response.set(answer);fixture.detectChanges();const textarea = fixture.nativeElement.querySelector('textarea');
    await ui().use('en');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h2').textContent).toBe('Test agent');expect(fixture.nativeElement.textContent).toContain('No sufficient lexical context');
    expect(c.question).toBe('Brouillon de question');expect(c.documentId).toBe(7);expect(c.response()).toBe(answer);expect(c.agent).toBe(agent);
    expect(fixture.nativeElement.querySelector('textarea')).toBe(textarea);expect(fixture.nativeElement.textContent).toContain(answer.reply);expect(agents.getAgentDocuments).toHaveBeenCalledTimes(1);expect(agents.askAgent).not.toHaveBeenCalled();noCalls();
  });
  it('localizes generated-form UI and validation while retaining schema labels, options and control values', async () => {
    const fixture = TestBed.createComponent(DynamicFormComponent), c = fixture.componentInstance;
    fixture.componentRef.setInput('schema', schema);fixture.detectChanges();const group = c.formGroup();group!.markAllAsTouched();
    for (const lang of ['en', 'fr'] as const) {
      await ui().use(lang);fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.error-msg').textContent).toContain(lang === 'en' ? 'This field is required.' : 'Ce champ est obligatoire.');
      expect(fixture.nativeElement.querySelector('.btn-submit').textContent).toContain(lang === 'en' ? 'Submit form' : 'Soumettre le formulaire');
      expect(c.schema).toBe(schema);expect(c.formGroup()).toBe(group);expect(fixture.nativeElement.querySelector('option[value="unchanged_code"]').textContent).toBe('Valeur métier');
      expect(fixture.nativeElement.querySelector('input').placeholder).toBe('Texte du modèle');noCalls();
    }
  });

  it('shows neutral observed and projected budget states in English without inventing warnings', async () => {
    await ui().use('en');const fixture = TestBed.createComponent(FinopsComponent);fixture.detectChanges();
    fixture.componentInstance.summary.set({ ...summary, observedBudget: { percent: 10, level: 'ok' }, projectedBudget: { percent: 50, level: 'ok' } });fixture.detectChanges();
    const alerts = fixture.nativeElement.querySelectorAll('.finops-budget-alert');
    expect(alerts[0].textContent).toContain('Estimated observed');expect(alerts[1].textContent).toContain('Month-end projection');
    for (const alert of alerts) { expect(alert.textContent).toContain('Below the 80% threshold');expect(alert.classList.contains('finops-warning')).toBe(false);expect(alert.classList.contains('finops-error')).toBe(false); }
    noCalls();
  });

});
