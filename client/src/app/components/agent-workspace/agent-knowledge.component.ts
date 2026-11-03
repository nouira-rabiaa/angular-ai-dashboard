import { TranslocoPipe } from '@jsverse/transloco';
import { UiLanguageService } from '../../i18n/ui-language.service';
import { CommonModule } from '@angular/common';
import { Component, DestroyRef, Input, OnChanges, Output, EventEmitter, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timeout } from 'rxjs';
import { AgentService } from '../../services/agent.service';
import { DashboardDataService, IndexedDocument } from '../../services/dashboard-data.service';
import { SupportAgent, AgentKnowledge, SupportAnswer } from '../../models/support-agent.model';

@Component({ selector: 'app-agent-knowledge', standalone: true, imports: [TranslocoPipe, CommonModule, FormsModule],
  templateUrl: './agent-knowledge.component.html', styleUrl: './agent-knowledge.component.scss' })
export class AgentKnowledgeComponent implements OnChanges {
  readonly ui = inject(UiLanguageService);
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
      error: () => { if (request === this.requestId) { this.catalogLoading.set(false);this.catalogError.set('knowledge.catalogue_indisponible_rechargez_la_liste_des_documents'); } }
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
    this.selection.set([...(this.knowledge()?.documentIds ?? [])]);this.setDirty(false);this.error.set('');this.message.set('knowledge.selection_annulee_associations_enregistrees_conservees');
  }
  save(): void {
    const scope = this.knowledge();if (!scope || this.busy() || !this.dirty()) return;
    if (this.selection().length > 100) { this.error.set('knowledge.au_maximum_100_documents_autorises_par_agent');return; }
    this.begin();
    this.api.setAgentDocuments(this.agent.id, this.selection(), scope.scopeVersion).pipe(timeout(15000), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => { this.knowledge.set(data);this.selection.set([...data.documentIds]);this.setDirty(false);this.end();this.message.set('knowledge.perimetre_documentaire_enregistre_dans_sqlite');this.response.set(null); },
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
      case 'no_documents': return this.ui.text('knowledge.aucun_document_autorise_pour_cet_agent');
      case 'no_matching_context': return this.ui.text('knowledge.aucun_contexte_lexical_suffisant_dans_les_documents');
      case 'model_abstained': return this.ui.text('knowledge.le_modele_indique_que_les_passages_ne');
      case 'invalid_citations': return this.ui.text('knowledge.les_references_du_modele_sont_absentes_ou');
      default: return this.ui.text('knowledge.aucune_reponse_documentaire_validable_le_message_de');
    }
  }
  private errorText(error: HttpErrorResponse): string {
    if (error.status === 409) return 'knowledge.configuration_inactive_ou_perimetre_modifie_annulez_les';
    if (error.status === 403) return 'knowledge.acces_refuse_verifiez_le_mode_local_et';
    if (error.status === 404) return 'knowledge.agent_ou_document_introuvable_rechargez_avant_de';
    if (error.status === 400) return 'knowledge.requete_refusee_verifiez_les_identifiants_et_la';
    if (error.status === 429) return 'knowledge.un_test_est_deja_en_cours_reessayez';
    if (error.status === 504) return 'knowledge.delai_du_fournisseur_depasse_aucune_reponse_a';
    if (error.status === 502) return 'knowledge.fournisseur_ia_indisponible_aucune_reponse_a_afficher';
    return 'knowledge.chargement_ou_enregistrement_impossible_verifiez_la_connexion';
  }
}
