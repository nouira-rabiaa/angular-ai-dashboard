import { AgentWorkflowsComponent } from './agent-workflows.component';
import { AgentTicketsComponent } from './agent-tickets.component';
import { ConversationTicketDraft } from '../../models/support-ticket.model';
import { SupportConversation } from '../../models/support-agent.model';
import { TranslocoPipe } from '@jsverse/transloco';
import { UiLanguageService } from '../../i18n/ui-language.service';
import { AgentConversationsComponent } from './agent-conversations.component';
import { AgentKnowledgeComponent } from './agent-knowledge.component';
import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AgentService } from '../../services/agent.service';
import { SupportAgent, SupportAgentConfig, emptySupportAgent } from '../../models/support-agent.model';

@Component({
  selector: 'app-agent-configuration', standalone: true,
  imports: [AgentWorkflowsComponent, TranslocoPipe, CommonModule, ReactiveFormsModule, AgentKnowledgeComponent, AgentConversationsComponent, AgentTicketsComponent],
  templateUrl: './agent-configuration.component.html',
  styleUrl: './agent-configuration.component.scss'
})
export class AgentConfigurationComponent implements OnInit {
  readonly ui = inject(UiLanguageService);
  private readonly api = inject(AgentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100)]],
    description: ['', Validators.maxLength(500)],
    role: ['Support client', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(200)]],
    systemInstructions: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(12000)]],
    tone: [emptySupportAgent().tone, Validators.required], language: [emptySupportAgent().language, Validators.required],
    model: [emptySupportAgent().model, Validators.required],
    temperature: [0.6, [Validators.required, Validators.min(0), Validators.max(2)]],
    maxOutputTokens: [1024, [Validators.required, Validators.min(1), Validators.max(4096), Validators.pattern(/^\d+$/)]],
    fallbackMessage: [emptySupportAgent().fallbackMessage, [Validators.required, Validators.pattern(/\S/), Validators.maxLength(2000)]],
    escalationEnabled: [false], status: [emptySupportAgent().status, Validators.required]
  });
  readonly agents = signal<SupportAgent[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly listState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly loadingDetail = signal(false);
  readonly saving = signal(false);
  readonly selected = signal<SupportAgent | null>(null);
  readonly message = signal('');
  readonly error = signal('');
  readonly pageSize = 50;
  readonly activeSpace = signal<'configuration' | 'knowledge' | 'test' | 'conversations' | 'tickets' | 'workflows'>('configuration');
  readonly spaces = [{ id: 'configuration', label: 'workspace.configuration' }, { id: 'knowledge', label: 'configuration.knowledge_base' }, { id: 'test', label: 'configuration.tester_l_agent' }, { id: 'conversations', label: 'workspace.conversations' }, { id: 'tickets', label: 'tickets.title' }, { id: 'workflows', label: 'automation.title' }] as const;
  readonly workflowDirty = signal(false);
  readonly workflowsVisited = signal(false);
  readonly ticketDirty = signal(false);
  readonly ticketsVisited = signal(false);
  readonly conversationsVisited = signal(false);
  readonly ticketDraft = signal<ConversationTicketDraft | null>(null);
  readonly requestedConversation = signal<SupportConversation | null>(null);
  readonly knowledgeDirty = signal(false);
  readonly workspaceBusy = signal(false);
  readonly navigationMessage = signal('');
  selectSpace(space: 'configuration' | 'knowledge' | 'test' | 'conversations' | 'tickets' | 'workflows'): void {
    if (space === this.activeSpace() || !this.mayLeaveDraft()) return;
    this.navigationMessage.set('');this.activeSpace.set(space);
    if (space === 'workflows') this.workflowsVisited.set(true);
    if (space === 'tickets') this.ticketsVisited.set(true);
    if (space === 'conversations') this.conversationsVisited.set(true);
  }
  knowledgeDraft(value: boolean): void { this.knowledgeDirty.set(value);if (!value) this.navigationMessage.set(''); }

  private listRequestId = 0;

  ngOnInit(): void {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.form.dirty) { this.message.set('');this.error.set(''); }
    });
    this.load();
  }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void { if (this.form.dirty || this.knowledgeDirty() || this.ticketDirty() || this.workflowDirty()) event.preventDefault(); }

  createConversationTicket(draft: ConversationTicketDraft) {
    if (draft.conversation.agent_id !== this.selected()?.id || !this.mayLeaveDraft()) return;
    this.ticketDraft.set(draft);this.selectSpace('tickets');
  }
  showConversation(conversation: SupportConversation) {
    if (conversation.agent_id !== this.selected()?.id || !this.mayLeaveDraft()) return;
    this.requestedConversation.set(conversation);this.selectSpace('conversations');
  }
  private clearTicketContext() {
    this.workflowsVisited.set(false);this.workflowDirty.set(false);this.ticketsVisited.set(false);this.conversationsVisited.set(false);this.ticketDraft.set(null);this.requestedConversation.set(null);this.ticketDirty.set(false);
  }
  private mayLeaveDraft(): boolean {
    if (this.workflowDirty()) { this.navigationMessage.set('automation.unsaved');return false; }
    if (this.ticketDirty()) { this.navigationMessage.set('tickets.unsaved');return false; }
    if (this.knowledgeDirty()) { this.navigationMessage.set('configuration.modifications_documentaires_non_enregistrees_enregistrez_ou_annulez');return false; }
    if (this.workspaceBusy()) { this.navigationMessage.set('configuration.attendez_la_fin_de_l_operation_en');return false; }
    if (this.form.dirty) { this.message.set('configuration.modifications_non_enregistrees_enregistrez_ou_annulez_avant');this.navigationMessage.set('configuration.enregistrez_ou_annulez_la_configuration_avant_de'); return false; }
    return !this.saving() && !this.loadingDetail();
  }
  load(offset = this.offset()): void {
    const requestId = ++this.listRequestId;
    this.listState.set('loading');
    this.api.listAgents(this.pageSize, offset).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: page => { if (requestId !== this.listRequestId) return;this.agents.set(page.items); this.total.set(page.total); this.offset.set(page.offset); this.listState.set('ready'); },
      error: () => { if (requestId === this.listRequestId) this.listState.set('error'); }
    });
  }
  reload(): void {
    if (!this.mayLeaveDraft() || this.listState() === 'loading') return;
    this.load();
    const agent = this.selected();if (agent) this.openAgent(agent);
  }
  page(direction: number): void {
    if (!this.mayLeaveDraft() || this.listState() === 'loading') return;
    const next = this.offset() + direction * this.pageSize;
    if (next >= 0 && next < this.total()) this.load(next);
  }
  newAgent(): void {
    if (!this.mayLeaveDraft()) return;
    this.clearTicketContext();this.selected.set(null);this.activeSpace.set('configuration');this.navigationMessage.set('');this.form.reset(emptySupportAgent());this.message.set('configuration.nouvelle_configuration_non_enregistree');this.error.set('');
  }
  openAgent(agent: SupportAgent): void {
    if (!this.mayLeaveDraft()) return;
    this.loadingDetail.set(true);this.error.set('');this.message.set('');
    this.api.getAgent(agent.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: current => { this.apply(current);this.loadingDetail.set(false); },
      error: error => { this.loadingDetail.set(false);this.error.set(this.errorText(error)); }
    });
  }
  private apply(agent: SupportAgent): void {
    if (this.selected()?.id !== agent.id) this.clearTicketContext();
    this.selected.set(agent);
    const { id, version, createdAt, updatedAt, ...config } = agent;
    this.form.reset(config);
  }
  cancel(): void {
    if (this.saving() || this.loadingDetail()) return;
    const agent = this.selected();if (agent) this.apply(agent);else this.form.reset(emptySupportAgent());
    this.navigationMessage.set('');this.error.set('');this.message.set('configuration.modifications_annulees_aucune_nouvelle_donnee_enregistree');
  }
  save(): void {
    if (this.saving() || this.loadingDetail()) return;
    this.form.markAllAsTouched();if (this.form.invalid) { this.error.set('configuration.verifiez_les_champs_obligatoires_et_leurs_limites');return; }
    const agent = this.selected();
    const config: SupportAgentConfig = this.form.getRawValue();
    this.saving.set(true);this.error.set('');this.message.set('');
    const request = agent ? this.api.updateAgent(agent.id, config, agent.version) : this.api.createAgent(config);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: current => { this.apply(current);this.saving.set(false);this.message.set('configuration.configuration_enregistree_dans_sqlite');this.load(0); },
      error: error => { this.saving.set(false);this.error.set(this.errorText(error)); }
    });
  }
  toggleStatus(): void {
    const agent = this.selected();if (!agent || !this.mayLeaveDraft()) return;
    this.saving.set(true);this.message.set('');this.error.set('');
    this.api.setAgentStatus(agent.id, agent.status === 'active' ? 'inactive' : 'active', agent.version)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: current => { this.apply(current);this.saving.set(false);this.message.set(current.status === 'active' ? 'configuration.configuration_activee' : 'configuration.configuration_desactivee');this.load(0); },
        error: error => { this.saving.set(false);this.error.set(this.errorText(error)); }
      });
  }
  invalid(name: keyof SupportAgentConfig): boolean { const field = this.form.controls[name];return field.invalid && field.touched; }
  private errorText(error: HttpErrorResponse): string {
    if (error.status === 403) return 'configuration.acces_refuse_la_configuration_exige_le_mode';
    if (error.status === 409) return 'configuration.cet_agent_a_ete_modifie_ailleurs_annulez';
    if (error.status === 400) return 'configuration.configuration_refusee_verifiez_les_valeurs_et_les';
    if (error.status === 404) return 'configuration.cet_agent_est_introuvable_rechargez_la_liste';
    return 'configuration.enregistrement_ou_chargement_impossible_verifiez_le_serveur';
  }
}
