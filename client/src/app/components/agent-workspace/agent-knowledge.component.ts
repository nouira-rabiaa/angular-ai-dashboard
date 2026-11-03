import { CommonModule } from '@angular/common';
import { Component, DestroyRef, Input, OnChanges, Output, EventEmitter, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timeout } from 'rxjs';
import { AgentService } from '../../services/agent.service';
import { DashboardDataService, IndexedDocument } from '../../services/dashboard-data.service';
import { SupportAgent, AgentKnowledge, SupportAnswer } from '../../models/support-agent.model';

@Component({ selector: 'app-agent-knowledge', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './agent-knowledge.component.html', styleUrl: './agent-knowledge.component.scss' })
export class AgentKnowledgeComponent implements OnChanges {
  @Input({ required: true }) agent!: SupportAgent;
  @Input() mode: 'knowledge' | 'test' = 'knowledge';
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() busyChange = new EventEmitter<boolean>();
  private readonly api = inject(AgentService);
  private readonly catalog = inject(DashboardDataService);
  private readonly destroyRef = inject(DestroyRef);
  private requestId = 0;
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly knowledge = signal<AgentKnowledge | null>(null);
  readonly documents = signal<IndexedDocument[]>([]);
  readonly total = signal(0);readonly offset = signal(0);
  readonly catalogLoading = signal(false);readonly catalogError = signal('');
  readonly selection = signal<number[]>([]);readonly dirty = signal(false);readonly busy = signal(false);
  readonly error = signal('');readonly message = signal('');readonly response = signal<SupportAnswer | null>(null);
  question = ''; documentId: number | null = null;
  ngOnChanges(): void { this.question = '';this.documentId = null;this.response.set(null);this.load(); }
  load(): void {
    if (this.busy()) return;
    const request = ++this.requestId;this.state.set('loading');this.error.set('');this.message.set('');
    this.api.getAgentDocuments(this.agent.id).pipe(timeout(15000), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        if (request !== this.requestId) return;
        this.knowledge.set(data);this.selection.set([...data.documentIds]);this.setDirty(false);this.state.set('ready');
        if (this.mode === 'knowledge') this.loadCatalog(0);
      }, error: error => { if (request === this.requestId) { this.state.set('error');this.error.set(this.errorText(error)); } }
    });
  }
  loadCatalog(offset: number): void {
    const request = this.requestId;
    this.catalogLoading.set(true);this.catalogError.set('');
    this.catalog.getDocuments(25, offset).pipe(timeout(15000), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: page => { if (request === this.requestId) { this.documents.set(page.items);this.total.set(page.total);this.offset.set(page.offset);this.catalogLoading.set(false); } },
      error: () => { if (request === this.requestId) { this.catalogLoading.set(false);this.catalogError.set('Catalogue indisponible. Rechargez la liste des documents.'); } }
    });
  }
  page(direction: number): void {
    const next = this.offset() + 25 * direction;
    if (!this.catalogLoading() && next >= 0 && next < this.total()) this.loadCatalog(next);
  }
  toggle(id: number, checked: boolean): void {
    if (this.busy()) return;
    const next = checked ? [...new Set([...this.selection(), id])] : this.selection().filter(candidate => candidate !== id);
    this.selection.set(next);this.message.set('');this.error.set('');
    this.setDirty(JSON.stringify([...next].sort((a,b) => a-b)) !== JSON.stringify(this.knowledge()?.documentIds ?? []));
  }
  documentName(id: number): string { return this.documents().find(doc => doc.documentId === id)?.filename ?? this.knowledge()?.documents.find(doc => doc.documentId === id)?.filename ?? `Document #${id}`; }
  private setDirty(value: boolean): void { this.dirty.set(value);this.dirtyChange.emit(value); }
  cancel(): void {
    if (this.busy()) return;
    this.selection.set([...(this.knowledge()?.documentIds ?? [])]);this.setDirty(false);this.error.set('');this.message.set('Sélection annulée, associations enregistrées conservées.');
  }
  save(): void {
    const scope = this.knowledge();if (!scope || this.busy() || !this.dirty()) return;
    if (this.selection().length > 100) { this.error.set('Au maximum 100 documents autorisés par agent.');return; }
    this.begin();
    this.api.setAgentDocuments(this.agent.id, this.selection(), scope.scopeVersion).pipe(timeout(15000), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => { this.knowledge.set(data);this.selection.set([...data.documentIds]);this.setDirty(false);this.end();this.message.set('Périmètre documentaire enregistré dans SQLite.');this.response.set(null); },
      error: error => { this.end();this.error.set(this.errorText(error)); }
    });
  }
  ask(): void {
    if (this.busy() || this.state() !== 'ready' || this.agent.status !== 'active' || !this.question.trim() || this.question.length > 2000) return;
    this.begin();this.response.set(null);
    this.api.askAgent(this.agent.id, this.question.trim(), this.documentId ?? undefined).pipe(timeout(20000), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => { this.response.set(data);this.end(); }, error: error => { this.end();this.error.set(this.errorText(error)); }
    });
  }
  private begin(): void { this.busy.set(true);this.busyChange.emit(true);this.error.set('');this.message.set(''); }
  private end(): void { this.busy.set(false);this.busyChange.emit(false); }
  reason(value: string | null): string {
    switch (value) {
      case 'no_documents': return 'Aucun document autorisé pour cet agent.';
      case 'no_matching_context': return 'Aucun contexte lexical suffisant dans les documents autorisés.';
      case 'model_abstained': return 'Le modèle indique que les passages ne suffisent pas.';
      case 'invalid_citations': return 'Les références du modèle sont absentes ou invalides : réponse non affichée.';
      default: return 'Aucune réponse documentaire validable. Le message de secours est affiché.';
    }
  }
  private errorText(error: HttpErrorResponse): string {
    if (error.status === 409) return 'Configuration inactive ou périmètre modifié. Annulez les changements locaux et rechargez les données.';
    if (error.status === 403) return 'Accès refusé : vérifiez le mode local et le document autorisé.';
    if (error.status === 404) return 'Agent ou document introuvable. Rechargez avant de réessayer.';
    if (error.status === 400) return 'Requête refusée. Vérifiez les identifiants et la longueur de la question.';
    if (error.status === 429) return 'Un test est déjà en cours. Réessayez après sa fin.';
    if (error.status === 504) return 'Délai du fournisseur dépassé. Aucune réponse à afficher.';
    if (error.status === 502) return 'Fournisseur IA indisponible. Aucune réponse à afficher.';
    return 'Chargement ou enregistrement impossible. Vérifiez la connexion locale ; vos saisies sont conservées.';
  }
}
