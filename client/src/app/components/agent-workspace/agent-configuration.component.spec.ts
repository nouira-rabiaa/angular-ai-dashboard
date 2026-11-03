import { DashboardDataService } from '../../services/dashboard-data.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { AgentConfigurationComponent } from './agent-configuration.component';
import { AgentService } from '../../services/agent.service';
import { SupportAgent, SupportAgentPage, emptySupportAgent } from '../../models/support-agent.model';

const record = (overrides: Partial<SupportAgent> = {}): SupportAgent => ({ ...emptySupportAgent(),
  id: '00000000-0000-4000-8000-000000000001', name: 'Assistance boutique',
  systemInstructions: 'Répondre avec les documents autorisés.', version: 1,
  createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z', ...overrides });
const page = (items: SupportAgent[] = []): SupportAgentPage => ({ items, total: items.length, offset: 0, limit: 50 });

describe('AgentConfigurationComponent', () => {
  let fixture: ComponentFixture<AgentConfigurationComponent>;
  let component: AgentConfigurationComponent;
  let api: Record<'listAgents' | 'getAgent' | 'createAgent' | 'updateAgent' | 'setAgentStatus' | 'getAgentDocuments', jest.Mock>;
  beforeEach(async () => {
    api = { getAgentDocuments: jest.fn().mockReturnValue(of({ documentIds: [], documents: [], scopeVersion: 'scope' })), listAgents: jest.fn().mockReturnValue(of(page())), getAgent: jest.fn().mockReturnValue(of(record())),
      createAgent: jest.fn().mockReturnValue(of(record())), updateAgent: jest.fn().mockReturnValue(of(record({ version: 2 }))),
      setAgentStatus: jest.fn().mockReturnValue(of(record({ status: 'active', version: 2 }))) };
    await TestBed.configureTestingModule({ imports: [AgentConfigurationComponent], providers: [{ provide: AgentService, useValue: api }, { provide: DashboardDataService, useValue: { getDocuments: jest.fn().mockReturnValue(of({ items: [], total: 0, offset: 0, limit: 25 })) } }] }).compileComponents();
    fixture = TestBed.createComponent(AgentConfigurationComponent);component = fixture.componentInstance;
  });
  const text = () => fixture.nativeElement.textContent as string;
  const button = (label: string) => (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
    .find(candidate => candidate.textContent?.trim() === label)!;
  function fillDraft() {
    component.form.patchValue({ name: 'Mon agent', systemInstructions: 'Instructions de test' });component.form.markAsDirty();fixture.detectChanges();
  }

  it('shows genuine loading, empty and unavailable catalogue states without claiming a save', () => {
    const pending = new Subject<SupportAgentPage>();api.listAgents.mockReturnValue(pending);
    fixture.detectChanges();expect(text()).toContain('Chargement des configurations');expect(text()).not.toContain('Configuration enregistrée dans SQLite');
    pending.next(page());fixture.detectChanges();expect(text()).toContain('Aucune configuration enregistrée');
    api.listAgents.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    component.reload();fixture.detectChanges();expect(text()).toContain('Catalogue indisponible');
  });

  it('validates required text, field limits and integer model limits before any request', () => {
    fixture.detectChanges();button('Enregistrer').click();fixture.detectChanges();
    expect(api.createAgent).not.toHaveBeenCalled();expect(text()).toContain('Le nom est obligatoire');
    fillDraft();component.form.patchValue({ name: '   ', temperature: 2.1, maxOutputTokens: 1.5 });
    expect(component.form.invalid).toBe(true);
    component.save();expect(api.createAgent).not.toHaveBeenCalled();
    component.form.patchValue({ name: 'x'.repeat(101), systemInstructions: 'x'.repeat(12001), fallbackMessage: '' });
    expect(component.form.controls.name.invalid).toBe(true);expect(component.form.controls.systemInstructions.invalid).toBe(true);
    expect(component.form.controls.fallbackMessage.invalid).toBe(true);
  });

  it('creates through the rendered form, locks pending edits and confirms only the server result', () => {
    const pending = new Subject<SupportAgent>();api.createAgent.mockReturnValue(pending);
    fixture.detectChanges();fillDraft();
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));fixture.detectChanges();
    expect(api.createAgent).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mon agent', model: 'openai/gpt-oss-120b' }));
    expect(text()).toContain('Enregistrement…');expect(text()).not.toContain('Configuration enregistrée dans SQLite');
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    component.cancel();expect(component.form.controls.name.value).toBe('Mon agent');
    pending.next(record({ name: 'Mon agent' }));fixture.detectChanges();
    expect(text()).toContain('Configuration enregistrée dans SQLite');expect(component.form.pristine).toBe(true);
    expect(component.selected()?.id).toBe(record().id);expect(api.listAgents).toHaveBeenLastCalledWith(50, 0);
  });

  it('loads selected configurations, updates with a version and preserves literal HTML as text', () => {
    api.listAgents.mockReturnValue(of(page([record({ name: '<script>not executable</script>' })])));
    fixture.detectChanges();expect(fixture.nativeElement.querySelector('script')).toBeNull();
    const select = fixture.nativeElement.querySelector('.studio-agent') as HTMLButtonElement;select.focus();expect(document.activeElement).toBe(select);
    select.click();fixture.detectChanges();expect(api.getAgent).toHaveBeenCalledWith(record().id);
    expect(component.form.controls.name.value).toBe(record().name);
    component.form.patchValue({ name: 'Nouveau nom' });component.form.markAsDirty();button('Enregistrer').click();
    expect(api.updateAgent).toHaveBeenCalledWith(record().id, expect.objectContaining({ name: 'Nouveau nom' }), 1);
  });

  it('warns about unsaved changes, blocks agent switches, and cancellation restores the saved snapshot', () => {
    fixture.detectChanges();component.openAgent(record());component.form.patchValue({ name: 'Brouillon' });component.form.markAsDirty();
    component.openAgent(record({ id: 'another' }));component.newAgent();fixture.detectChanges();
    expect(api.getAgent).toHaveBeenCalledTimes(1);expect(text()).toContain('Modifications non enregistrées');
    const event = new Event('beforeunload', { cancelable: true });component.beforeUnload(event as BeforeUnloadEvent);expect(event.defaultPrevented).toBe(true);
    button('Annuler').click();fixture.detectChanges();expect(component.form.controls.name.value).toBe(record().name);
    expect(component.form.pristine).toBe(true);expect(api.updateAgent).not.toHaveBeenCalled();
    button('+ Créer un agent').click();fixture.detectChanges();expect(component.selected()).toBeNull();
    fillDraft();button('Annuler').click();expect(component.form.controls.name.value).toBe('');
  });

  it('activates and deactivates configurations through the status endpoint, without running inference', () => {
    fixture.detectChanges();component.openAgent(record());fixture.detectChanges();button('Activer').click();fixture.detectChanges();
    expect(api.setAgentStatus).toHaveBeenCalledWith(record().id, 'active', 1);expect(text()).toContain('Configuration activée.');
    api.setAgentStatus.mockReturnValue(of(record({ status: 'inactive', version: 3 })));
    button('Désactiver').click();fixture.detectChanges();expect(api.setAgentStatus).toHaveBeenLastCalledWith(record().id, 'inactive', 2);
    expect(text()).toContain('Configuration désactivée.');expect(text()).toContain('Les sauvegardes ne lancent aucune inférence');
  });

  it.each([400, 403, 404, 409, 500, 0])('keeps a failed save editable without false success for HTTP %s', status => {
    fixture.detectChanges();fillDraft();api.createAgent.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    button('Enregistrer').click();fixture.detectChanges();
    expect(component.saving()).toBe(false);expect(component.form.controls.name.value).toBe('Mon agent');
    expect(component.form.dirty).toBe(true);expect(fixture.nativeElement.querySelector('form [role="alert"]')).not.toBeNull();
    expect(text()).not.toContain('Configuration enregistrée dans SQLite');
  });

  it('keeps the 5A form mounted across three spaces and protects configuration and document drafts', () => {
    fixture.detectChanges();component.openAgent(record());fixture.detectChanges();
    const name = fixture.nativeElement.querySelector('#support-name');
    component.selectSpace('knowledge');fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#studio-config-panel').hidden).toBe(true);
    expect(fixture.nativeElement.querySelector('#support-name')).toBe(name);
    expect(text()).toContain('Knowledge Base');
    component.knowledgeDraft(true);component.selectSpace('test');expect(component.activeSpace()).toBe('knowledge');
    component.knowledgeDraft(false);component.selectSpace('test');fixture.detectChanges();expect(text()).toContain('Prévisualisation documentaire');
    component.selectSpace('configuration');fixture.detectChanges();
    fillDraft();component.selectSpace('knowledge');fixture.detectChanges();expect(component.activeSpace()).toBe('configuration');
    expect(component.form.controls.name.value).toBe('Mon agent');
  });

  it('does not let an older catalogue response hide a newly saved agent', () => {
    const older = new Subject<SupportAgentPage>();api.listAgents.mockReturnValueOnce(older);
    fixture.detectChanges();fillDraft();api.listAgents.mockReturnValue(of(page([record()])));
    component.save();fixture.detectChanges();expect(component.agents()).toHaveLength(1);
    older.next(page());fixture.detectChanges();expect(component.agents()).toHaveLength(1);
  });

  it('handles failed detail/status requests and cancels pending subscriptions on destruction', () => {
    fixture.detectChanges();api.getAgent.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    component.openAgent(record());fixture.detectChanges();expect(text()).toContain('introuvable');expect(component.loadingDetail()).toBe(false);
    api.getAgent.mockReturnValue(of(record()));component.openAgent(record());
    api.setAgentStatus.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    component.toggleStatus();fixture.detectChanges();expect(text()).toContain('modifié ailleurs');expect(component.selected()?.status).toBe('inactive');
    const pending = new Subject<SupportAgentPage>();api.listAgents.mockReturnValue(pending);component.load();expect(pending.observed).toBe(true);
    fixture.destroy();expect(pending.observed).toBe(false);
  });
});
