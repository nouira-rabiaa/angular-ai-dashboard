import { UiLanguageService } from '../../i18n/ui-language.service';
import { provideUiI18nTesting } from '../../i18n/ui-i18n.testing';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { AgentKnowledgeComponent } from './agent-knowledge.component';
import { AgentService } from '../../services/agent.service';
import { DashboardDataService } from '../../services/dashboard-data.service';
import { AgentKnowledge, SupportAnswer, SupportAgent, emptySupportAgent } from '../../models/support-agent.model';

const agent: SupportAgent = { ...emptySupportAgent(), id: 'agent-a', name: 'Support A', status: 'active', version: 1, createdAt: '', updatedAt: '' };
const document = (documentId: number) => ({ documentId, filename: `document-${documentId}.txt`, fileType: 'txt', createdAt: '', chunksCount: 1, status: 'Success', characterCount: 100 });
const scope = (ids = [1]): AgentKnowledge => ({ documentIds: ids, documents: ids.map(document), scopeVersion: 'scope-token' });
const reply: SupportAnswer = { status: 'answered', reason: null, reply: 'Retours autorisés [S1].', durationMs: 20,
  sources: [{ label: 'S1', documentId: 1, chunkId: 2, filename: 'document-1.txt', excerpt: 'La politique prévoit les retours.', pageNumber: null, startOffset: 0, endOffset: 100 }],
  citationValidation: { validLabels: ['S1'], invalidLabels: [], sourceIdentityValidated: true, factualEntailmentValidated: false } };

describe('AgentKnowledgeComponent', () => {
  let fixture: ComponentFixture<AgentKnowledgeComponent>;let component: AgentKnowledgeComponent;
  let api: { getAgentDocuments: jest.Mock; setAgentDocuments: jest.Mock; askAgent: jest.Mock };
  let catalog: { getDocuments: jest.Mock };
  beforeEach(async () => {
    api = { getAgentDocuments: jest.fn().mockReturnValue(of(scope())), setAgentDocuments: jest.fn().mockReturnValue(of(scope([1, 2]))), askAgent: jest.fn().mockReturnValue(of(reply)) };
    catalog = { getDocuments: jest.fn().mockReturnValue(of({ items: [document(1), document(2)], total: 2, limit: 25, offset: 0 })) };
    await TestBed.configureTestingModule({ imports: [AgentKnowledgeComponent], providers: [...provideUiI18nTesting(), { provide: AgentService, useValue: api }, { provide: DashboardDataService, useValue: catalog }] }).compileComponents();
    fixture = TestBed.createComponent(AgentKnowledgeComponent);component = fixture.componentInstance;
    fixture.componentRef.setInput('agent', agent);
  });
  const text = () => fixture.nativeElement.textContent as string;
  it('loads real authorized selections and the existing document catalogue, with loading/empty/error states', () => {
    const pending = new Subject<AgentKnowledge>();api.getAgentDocuments.mockReturnValue(pending);fixture.detectChanges();
    expect(text()).toContain('Chargement du périmètre');pending.next(scope([]));fixture.detectChanges();
    expect(text()).toContain('Aucun document sélectionné');expect(catalog.getDocuments).toHaveBeenCalledWith(25, 0);
    expect(fixture.nativeElement.querySelectorAll('.document-list input:checked')).toHaveLength(0);
    api.getAgentDocuments.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));component.load();fixture.detectChanges();
    expect(text()).toContain('Accès refusé');expect(api.askAgent).not.toHaveBeenCalled();
  });
  it('keeps the compact catalogue keyboard reachable with native document controls', () => {
    fixture.detectChanges();
    const region = fixture.nativeElement.querySelector('[aria-label="Catalogue des documents"]') as HTMLElement;
    region.focus();expect(globalThis.document.activeElement).toBe(region);
    expect(region.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('#associated-title').textContent).toContain('Documents associés');
  });
  it('explains the empty response area without making an inference when opening the tester', () => {
    fixture.componentRef.setInput('mode', 'test');fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.result-panel').textContent).toContain('Aucun résultat n’est généré avant votre envoi');
    expect(fixture.nativeElement.querySelector('.question-panel textarea')).not.toBeNull();
    expect(api.askAgent).not.toHaveBeenCalled();
  });
  it('saves associations only after server success and restores saved selection on cancel', () => {
    fixture.detectChanges();const changes = jest.fn();component.dirtyChange.subscribe(changes);
    const checkboxes = fixture.nativeElement.querySelectorAll('.document-list input') as NodeListOf<HTMLInputElement>;
    checkboxes[1].click();fixture.detectChanges();expect(component.selection()).toEqual([1, 2]);expect(changes).toHaveBeenLastCalledWith(true);
    const pending = new Subject<AgentKnowledge>();api.setAgentDocuments.mockReturnValue(pending);component.save();fixture.detectChanges();
    expect(api.setAgentDocuments).toHaveBeenCalledWith('agent-a', [1, 2], 'scope-token');expect(component.busy()).toBe(true);
    expect(text()).not.toContain('Périmètre documentaire enregistré');pending.next(scope([1, 2]));fixture.detectChanges();
    expect(text()).toContain('Périmètre documentaire enregistré');expect(component.dirty()).toBe(false);
    component.toggle(1, false);expect(component.selection()).toEqual([2]);component.cancel();expect(component.selection()).toEqual([1, 2]);
  });
  it('preserves the document draft on save conflicts and errors instead of claiming success', () => {
    fixture.detectChanges();component.toggle(2, true);
    api.setAgentDocuments.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));component.save();fixture.detectChanges();
    expect(component.selection()).toEqual([1, 2]);expect(component.dirty()).toBe(true);expect(text()).not.toContain('Périmètre documentaire enregistré');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    catalog.getDocuments.mockReturnValue(throwError(() => new Error('offline')));component.loadCatalog(0);fixture.detectChanges();expect(text()).toContain('Catalogue indisponible');
  });
  it('tests the saved active agent through the rendered form and exposes real citation excerpts', async () => {
    fixture.componentRef.setInput('mode', 'test');fixture.detectChanges();await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('#support-question') as HTMLTextAreaElement;input.value = 'retour article';input.dispatchEvent(new Event('input'));fixture.detectChanges();await fixture.whenStable();
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));fixture.detectChanges();
    expect(api.askAgent).toHaveBeenCalledWith('agent-a', 'retour article', undefined);
    expect(text()).toContain('Réponse documentaire');expect(text()).toContain('Retours autorisés [S1]');expect(text()).toContain(reply.sources[0].excerpt);
    expect(text()).toContain('ils ne prouvent pas l’exactitude');expect(text()).toContain('sans conversation persistante');
  });
  it('shows honest abstention for missing documents independently of network errors', () => {
    fixture.componentRef.setInput('mode', 'test');api.getAgentDocuments.mockReturnValue(of(scope([])));fixture.detectChanges();
    api.askAgent.mockReturnValue(of({ ...reply, status: 'abstained', reason: 'no_documents', reply: 'Message de secours configuré.', sources: [], citationValidation: null }));
    component.question = 'retour article';component.ask();fixture.detectChanges();expect(text()).toContain('Abstention');expect(text()).toContain('Aucun document autorisé');
    expect(fixture.nativeElement.querySelector('.citations')).toBeNull();expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    api.askAgent.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 504 })));component.ask();fixture.detectChanges();
    expect(text()).toContain('Délai du fournisseur dépassé');expect(component.response()).toBeNull();
  });
  it('clears the previous agent preview when changing the selected agent', () => {
    fixture.componentRef.setInput('mode', 'test');fixture.detectChanges();component.question = 'retour article';component.ask();fixture.detectChanges();
    expect(component.response()?.reply).toContain('[S1]');
    api.getAgentDocuments.mockReturnValue(of(scope([])));fixture.componentRef.setInput('agent', { ...agent, id: 'agent-b', name: 'Support B' });fixture.detectChanges();
    expect(component.response()).toBeNull();expect(component.question).toBe('');expect(component.knowledge()?.documentIds).toEqual([]);
    expect(text()).not.toContain('Retours autorisés [S1]');
  });

  it('blocks inactive/blank tests, locks generation and cancels requests on destruction', () => {
    fixture.componentRef.setInput('mode', 'test');fixture.componentRef.setInput('agent', { ...agent, status: 'inactive' });fixture.detectChanges();
    component.question = 'retour article';component.ask();expect(api.askAgent).not.toHaveBeenCalled();expect(text()).toContain('Activez et enregistrez');
    fixture.componentRef.setInput('agent', agent);fixture.detectChanges();component.ask();expect(api.askAgent).not.toHaveBeenCalled();
    const pending = new Subject<SupportAnswer>();api.askAgent.mockReturnValue(pending);component.question = 'retour article';component.ask();fixture.detectChanges();
    expect(text()).toContain('Génération…');expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    component.ask();expect(api.askAgent).toHaveBeenCalledTimes(1);expect(pending.observed).toBe(true);fixture.destroy();expect(pending.observed).toBe(false);
  });
  it('distinguishes saved authorisations from the current unsaved selection', () => {
    fixture.detectChanges();
    component.toggle(2, true);fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#associated-title').textContent).toContain('1');
    expect(fixture.nativeElement.querySelector('.selection-summary').textContent).toContain('2');
    const saved: HTMLDetailsElement = fixture.nativeElement.querySelector('.saved-documents');
    expect(saved.open).toBe(false);saved.open = true;fixture.detectChanges();
    expect(saved.querySelectorAll('li')).toHaveLength(1);
    expect(component.dirty()).toBe(true);
    expect(api.setAgentDocuments).not.toHaveBeenCalled();expect(api.askAgent).not.toHaveBeenCalled();
    component.cancel();fixture.detectChanges();expect(component.selection()).toEqual([1]);
  });
  it('preserves question and document scope when opening help and switching language without inference', async () => {
    fixture.componentRef.setInput('mode', 'test');fixture.detectChanges();await fixture.whenStable();
    component.question = 'Original question';component.documentId = 1;fixture.detectChanges();await fixture.whenStable();
    const input: HTMLTextAreaElement = fixture.nativeElement.querySelector('#support-question');
    const reads = api.getAgentDocuments.mock.calls.length;
    const help: HTMLDetailsElement = fixture.nativeElement.querySelector('.context-help');
    expect(help.open).toBe(false);help.open = true;fixture.detectChanges();
    await TestBed.inject(UiLanguageService).use('en');fixture.detectChanges();await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#support-question')).toBe(input);
    expect(component.question).toBe('Original question');expect(component.documentId).toBe(1);
    expect(fixture.nativeElement.querySelector('button[type=submit]').textContent).toContain('Test agent');
    expect(api.getAgentDocuments).toHaveBeenCalledTimes(reads);
    expect(api.askAgent).not.toHaveBeenCalled();expect(api.setAgentDocuments).not.toHaveBeenCalled();
  });

});
