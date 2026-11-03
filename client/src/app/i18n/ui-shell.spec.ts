import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AppComponent } from '../app.component';
import { routes } from '../app.routes';
import { errorInterceptor } from '../interceptors/error.interceptor';
import { emptySupportAgent } from '../models/support-agent.model';
import { AgentConfigurationComponent } from '../components/agent-workspace/agent-configuration.component';
import { AgentKnowledgeComponent } from '../components/agent-workspace/agent-knowledge.component';
import { AgentConversationsComponent } from '../components/agent-workspace/agent-conversations.component';
import { provideUiI18n } from './ui-i18n.providers';
import { UiLanguageService, UI_LANGUAGE_STORAGE_KEY } from './ui-language.service';

const base = 'http://localhost:3000/api/agents';
const agent = { ...emptySupportAgent(), id: '00000000-0000-4000-8000-000000000001', name: 'Agent métier', description: 'Description conservée', systemInstructions: 'Instructions métier conservées', status: 'active', version: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' };

describe('Bilingual application shell', () => {
  beforeEach(async () => {
    localStorage.removeItem(UI_LANGUAGE_STORAGE_KEY);
    await TestBed.configureTestingModule({ imports: [AppComponent], providers: [
      provideRouter(routes), ...provideUiI18n(), provideHttpClient(withInterceptors([errorInterceptor])), provideHttpClientTesting()
    ] }).compileComponents();
    await TestBed.inject(UiLanguageService).ready;
  });
  afterEach(() => { TestBed.inject(HttpTestingController).verify();localStorage.removeItem(UI_LANGUAGE_STORAGE_KEY); });
  const create = () => { const fixture = TestBed.createComponent(AppComponent);fixture.detectChanges();return fixture; };

  it('changes header and navigation through real buttons and keeps the shell mounted', async () => {
    const fixture = create();const sidebar = fixture.nativeElement.querySelector('app-sidebar');
    fixture.nativeElement.querySelector('button[aria-label="Anglais"]').click();await fixture.whenStable();fixture.detectChanges();
    expect(document.documentElement.lang).toBe('en');expect(fixture.nativeElement.textContent).toContain('AI Generator');
    expect(fixture.nativeElement.querySelector('button[aria-label="English"]').getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.querySelector('app-sidebar')).toBe(sidebar);
    fixture.nativeElement.querySelector('button[aria-label="French"]').click();await fixture.whenStable();fixture.detectChanges();
    expect(document.documentElement.lang).toBe('fr');expect(fixture.nativeElement.textContent).toContain('Générateur IA');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('preserves English navigation, document lang and translated browser titles across all five lazy routes', async () => {
    const fixture = create();const router = TestBed.inject(Router);const http = TestBed.inject(HttpTestingController);
    await TestBed.inject(UiLanguageService).use('en');
    for (const [path, title] of [['/dashboard', 'Dashboard'], ['/generator', 'AI Generator'], ['/guided-demo', 'Guided Demo'], ['/architecture', 'Architecture Explorer'], ['/agent-workspace', 'Support Agent Studio']]) {
      await router.navigateByUrl(path);fixture.detectChanges();
      // These are initial read-only route loads, mocked locally, never live requests.
      for (const request of http.match(() => true)) { expect(request.request.method).toBe('GET');request.flush({ error: 'Local-only fixture' }, { status: 403, statusText: 'Forbidden' }); }
      fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
      expect(document.documentElement.lang).toBe('en');expect(document.title).toBe(`${title} · Enterprise AI Dashboard`);
      expect(fixture.nativeElement.querySelector('a[routerLink="/generator"]').getAttribute('aria-label')).toBe('AI Generator');
      expect(router.url).toBe(path);http.expectNone(() => true);
    }
  });

  it('localizes HTTP errors from status rather than server wording, and updates an existing notification', async () => {
    const fixture = create();const http = TestBed.inject(HttpTestingController);
    TestBed.inject(HttpClient).get('/api/example').subscribe({ error: () => {} });
    http.expectOne('/api/example').flush({ error: 'DO_NOT_DISPLAY_SERVER_TEXT' }, { status: 404, statusText: 'Not found' });fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Ressource introuvable');
    expect(fixture.nativeElement.textContent).not.toContain('DO_NOT_DISPLAY_SERVER_TEXT');
    await TestBed.inject(UiLanguageService).use('en');fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Resource not found');
    fixture.nativeElement.querySelector('[aria-label="Dismiss notification"]').click();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();http.expectNone(() => true);
  });

  async function openStudio(fixture: ReturnType<typeof create>) {
    await TestBed.inject(Router).navigateByUrl('/agent-workspace');fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(base + '?limit=50&offset=0').flush({ items: [agent], total: 1, limit: 50, offset: 0 });fixture.detectChanges();
    fixture.nativeElement.querySelector('.studio-agent').click();
    http.expectOne(base + '/' + agent.id).flush(agent);fixture.detectChanges();
    return fixture.debugElement.query(By.directive(AgentConfigurationComponent)).componentInstance as AgentConfigurationComponent;
  }

  it('keeps a configuration draft, focusable form and agent language unchanged without a new request', async () => {
    const fixture = create();const studio = await openStudio(fixture);
    const input = fixture.nativeElement.querySelector('#support-name') as HTMLInputElement;
    input.value = 'Brouillon non enregistré';input.dispatchEvent(new Event('input'));fixture.detectChanges();
    const instructions = studio.form.controls.systemInstructions.value;
    await TestBed.inject(UiLanguageService).use('en');fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#support-name')).toBe(input);expect(input.value).toBe('Brouillon non enregistré');
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Support Agent Studio');
    expect(fixture.nativeElement.querySelector('label[for="support-instructions"]').textContent).toContain('System instructions');
    expect(Array.from(fixture.nativeElement.querySelectorAll('nav[aria-label="Support Agent Studio workspaces"] button')).map((button: any) => button.textContent.trim())).toEqual(['Configuration', 'Knowledge Base', 'Test agent', 'Conversations']);
    expect(studio.form.dirty).toBe(true);expect(studio.form.controls.language.value).toBe('fr');expect(studio.selected()?.language).toBe('fr');
    expect(studio.form.controls.systemInstructions.value).toBe(instructions);studio.selectSpace('knowledge');expect(studio.activeSpace()).toBe('configuration');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('preserves an unsaved Knowledge Base selection and its navigation guard when changing language', async () => {
    const fixture = create();const studio = await openStudio(fixture);const http = TestBed.inject(HttpTestingController);
    studio.selectSpace('knowledge');fixture.detectChanges();
    const document = (documentId: number) => ({ documentId, filename: `document-${documentId}.txt`, fileType: 'txt', createdAt: '2026-01-01', chunksCount: 1, characterCount: 100, status: 'Success' });
    http.expectOne(base + '/' + agent.id + '/documents').flush({ documentIds: [1], documents: [document(1)], scopeVersion: 'saved-scope' });
    const reads = http.match(request => request.method === 'GET');expect(reads).toHaveLength(1);
    reads[0].flush({ items: [document(1), document(2)], total: 2, totalChunks: 2, limit: 25, offset: 0 });fixture.detectChanges();
    const knowledge = fixture.debugElement.query(By.directive(AgentKnowledgeComponent)).componentInstance as AgentKnowledgeComponent;
    (fixture.nativeElement.querySelectorAll('.document-list input')[1] as HTMLInputElement).click();fixture.detectChanges();
    expect(knowledge.selection()).toEqual([1, 2]);expect(studio.knowledgeDirty()).toBe(true);
    await TestBed.inject(UiLanguageService).use('en');fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(AgentKnowledgeComponent)).componentInstance).toBe(knowledge);
    expect(fixture.nativeElement.querySelector('#associated-title').textContent).toContain('Assigned documents');
    expect(fixture.nativeElement.querySelector('#catalog-title').textContent).toBe('Available documents');
    expect(knowledge.selection()).toEqual([1, 2]);expect(knowledge.dirty()).toBe(true);
    studio.selectSpace('test');expect(studio.activeSpace()).toBe('knowledge');http.expectNone(() => true);
  });

  it('keeps the selected conversation and its stored content unchanged without inference or reload', async () => {
    const fixture = create();const studio = await openStudio(fixture);const http = TestBed.inject(HttpTestingController);
    studio.selectSpace('conversations');fixture.detectChanges();
    const conversation = { id: '00000000-0000-4000-8000-000000000002', agent_id: agent.id, title: 'Titre métier conservé', status: 'open', created_at: '2026-01-01', updated_at: '2026-01-01' };
    http.expectOne(base + '/' + agent.id + '/conversations?limit=30&offset=0').flush({ items: [conversation], total: 1, limit: 30, offset: 0 });fixture.detectChanges();
    fixture.nativeElement.querySelector('.conversation-item .select').click();
    http.expectOne(base + '/' + agent.id + '/conversations/' + conversation.id + '?limit=30').flush({ conversation, nextBefore: null, items: [{ id: 'message', sequence: 1, requestId: 'request', role: 'assistant', content: 'Texte métier conservé', status: 'completed', createdAt: '2026-01-01', sources: [], stale: false, metadata: {} }] });fixture.detectChanges();
    const chat = fixture.debugElement.query(By.directive(AgentConversationsComponent)).componentInstance as AgentConversationsComponent;
    const selected = chat.selected();const messages = chat.messages();
    await TestBed.inject(UiLanguageService).use('en');fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Your message');expect(fixture.nativeElement.querySelector('[aria-label="Saved conversations"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Texte métier conservé');
    await TestBed.inject(UiLanguageService).use('fr');fixture.detectChanges();
    expect(chat.selected()).toBe(selected);expect(chat.messages()).toBe(messages);expect(chat.messages()[0].content).toBe('Texte métier conservé');
    expect(chat.agent.language).toBe('fr');http.expectNone(() => true);
  });
});
