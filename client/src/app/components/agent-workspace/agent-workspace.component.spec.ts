import { provideUiI18nTesting } from '../../i18n/ui-i18n.testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AgentWorkspaceComponent } from './agent-workspace.component';
import { AgentService } from '../../services/agent.service';
import { DashboardDataService } from '../../services/dashboard-data.service';
import { SupportAgent, emptySupportAgent } from '../../models/support-agent.model';

describe('AgentWorkspaceComponent — Studio shell', () => {
  const agent: SupportAgent = { ...emptySupportAgent(), id: 'agent', name: 'Assistance', status: 'active', version: 1, createdAt: '', updatedAt: '' };
  beforeEach(() => TestBed.configureTestingModule({ imports: [AgentWorkspaceComponent], providers: [...provideUiI18nTesting(),
    { provide: AgentService, useValue: { listAgents: () => of({ items: [agent], total: 1, limit: 50, offset: 0 }),
      listConversations: () => of({ items: [], total: 0 }), getAgent: () => of(agent), getAgentDocuments: () => of({ documentIds: [], documents: [], scopeVersion: 'scope' }) } },
    { provide: DashboardDataService, useValue: { getDocuments: () => of({ items: [], total: 0, limit: 25, offset: 0 }) } }
  ] }));
  it('renders only Support Agent Studio, without legacy execution controls', () => {
    const fixture = TestBed.createComponent(AgentWorkspaceComponent);fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-agent-configuration')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Studio d’agents de support');
    expect(fixture.nativeElement.textContent).not.toContain('Outils d’exploitation');
    expect(fixture.nativeElement.querySelector('.run-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('#agent-goal')).toBeNull();
    expect('run' in TestBed.inject(AgentService)).toBe(false);
  });
  it('preserves the four existing spaces, adds Tickets and keeps the configuration form mounted', () => {
    const fixture = TestBed.createComponent(AgentWorkspaceComponent);fixture.detectChanges();
    fixture.nativeElement.querySelector('.studio-agent').click();fixture.detectChanges();
    const form = fixture.nativeElement.querySelector('#studio-config-panel');
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('nav[aria-label="Espaces du Support Agent Studio"] button')) as HTMLButtonElement[];
    expect(buttons.map(button => button.textContent?.trim())).toEqual(['Configuration', 'Base documentaire', 'Tester l’agent', 'Conversations', 'Tickets', 'Automatisation des workflows']);
    buttons[1].click();fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('Aucun document sélectionné');
    buttons[2].click();fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('Prévisualisation documentaire');
    buttons[3].click();fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('Aucun échange');
    buttons[0].click();fixture.detectChanges();expect(fixture.nativeElement.querySelector('#studio-config-panel')).toBe(form);expect(form.hidden).toBe(false);
  });
});
