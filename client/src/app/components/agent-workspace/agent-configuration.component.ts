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
  imports: [CommonModule, ReactiveFormsModule, AgentKnowledgeComponent, AgentConversationsComponent],
  templateUrl: './agent-configuration.component.html',
  styleUrl: './agent-configuration.component.scss'
})
export class AgentConfigurationComponent implements OnInit {
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
  readonly activeSpace = signal<'configuration' | 'knowledge' | 'test' | 'conversations'>('configuration');
  readonly spaces = [{ id: 'configuration', label: 'Configuration' }, { id: 'knowledge', label: 'Knowledge Base' }, { id: 'test', label: 'Tester l’agent' }, { id: 'conversations', label: 'Conversations' }] as const;
  readonly knowledgeDirty = signal(false);
  readonly workspaceBusy = signal(false);
  readonly navigationMessage = signal('');
  selectSpace(space: 'configuration' | 'knowledge' | 'test' | 'conversations'): void {
    if (space === this.activeSpace() || !this.mayLeaveDraft()) return;
    this.navigationMessage.set('');this.activeSpace.set(space);
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
  beforeUnload(event: BeforeUnloadEvent): void { if (this.form.dirty || this.knowledgeDirty()) event.preventDefault(); }

  private mayLeaveDraft(): boolean {
    if (this.knowledgeDirty()) { this.navigationMessage.set('Modifications documentaires non enregistrées : enregistrez ou annulez avant de changer d’espace ou d’agent.');return false; }
    if (this.workspaceBusy()) { this.navigationMessage.set('Attendez la fin de l’opération en cours.');return false; }
    if (this.form.dirty) { this.message.set('Modifications non enregistrées : enregistrez ou annulez avant de changer d’agent.');this.navigationMessage.set('Enregistrez ou annulez la configuration avant de changer d’espace.'); return false; }
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
    this.selected.set(null);this.activeSpace.set('configuration');this.navigationMessage.set('');this.form.reset(emptySupportAgent());this.message.set('Nouvelle configuration, non enregistrée.');this.error.set('');
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
    this.selected.set(agent);
    const { id, version, createdAt, updatedAt, ...config } = agent;
    this.form.reset(config);
  }
  cancel(): void {
    if (this.saving() || this.loadingDetail()) return;
    const agent = this.selected();if (agent) this.apply(agent);else this.form.reset(emptySupportAgent());
    this.navigationMessage.set('');this.error.set('');this.message.set('Modifications annulées. Aucune nouvelle donnée enregistrée.');
  }
  save(): void {
    if (this.saving() || this.loadingDetail()) return;
    this.form.markAllAsTouched();if (this.form.invalid) { this.error.set('Vérifiez les champs obligatoires et leurs limites.');return; }
    const agent = this.selected();
    const config: SupportAgentConfig = this.form.getRawValue();
    this.saving.set(true);this.error.set('');this.message.set('');
    const request = agent ? this.api.updateAgent(agent.id, config, agent.version) : this.api.createAgent(config);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: current => { this.apply(current);this.saving.set(false);this.message.set('Configuration enregistrée dans SQLite.');this.load(0); },
      error: error => { this.saving.set(false);this.error.set(this.errorText(error)); }
    });
  }
  toggleStatus(): void {
    const agent = this.selected();if (!agent || !this.mayLeaveDraft()) return;
    this.saving.set(true);this.message.set('');this.error.set('');
    this.api.setAgentStatus(agent.id, agent.status === 'active' ? 'inactive' : 'active', agent.version)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: current => { this.apply(current);this.saving.set(false);this.message.set(current.status === 'active' ? 'Configuration activée.' : 'Configuration désactivée.');this.load(0); },
        error: error => { this.saving.set(false);this.error.set(this.errorText(error)); }
      });
  }
  invalid(name: keyof SupportAgentConfig): boolean { const field = this.form.controls[name];return field.invalid && field.touched; }
  private errorText(error: HttpErrorResponse): string {
    if (error.status === 403) return 'Accès refusé : la configuration exige le mode local DASHBOARD_TELEMETRY_LOCAL_ONLY=true.';
    if (error.status === 409) return 'Cet agent a été modifié ailleurs. Annulez vos modifications puis rechargez avant de réessayer.';
    if (error.status === 400) return 'Configuration refusée : vérifiez les valeurs et les limites des champs.';
    if (error.status === 404) return 'Cet agent est introuvable. Rechargez la liste.';
    return 'Enregistrement ou chargement impossible. Vérifiez le serveur local et réessayez. Vos saisies sont conservées.';
  }
}
