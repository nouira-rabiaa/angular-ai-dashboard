import { timeout } from 'rxjs';
import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { FormsModule, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe } from '@jsverse/transloco';
import { UiLanguageService } from '../../i18n/ui-language.service';
import { UiDatePipe } from '../../i18n/ui-format.pipe';
import { SupportTicketService } from '../../services/support-ticket.service';
import { AgentService } from '../../services/agent.service';
import { SupportAgent, SupportConversation } from '../../models/support-agent.model';
import { ConversationTicketDraft, SupportTicket, TicketEvent, TicketFilters, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, TicketCategory, TicketPriority, TicketStatus } from '../../models/support-ticket.model';

@Component({ selector: 'app-agent-tickets', standalone: true, imports: [TranslocoPipe, UiDatePipe, FormsModule, ReactiveFormsModule],
  templateUrl: './agent-tickets.component.html', styleUrl: './agent-tickets.component.scss' })
export class AgentTicketsComponent implements OnChanges {
  @Input({ required: true }) agent!: SupportAgent;
  @Input() conversationDraft: ConversationTicketDraft | null = null;
  @Output() readonly dirtyChange = new EventEmitter<boolean>();
  @Output() readonly busyChange = new EventEmitter<boolean>();
  @Output() readonly openConversation = new EventEmitter<SupportConversation>();
  readonly ui = inject(UiLanguageService);
  private readonly api = inject(SupportTicketService);
  private readonly agents = inject(AgentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly categories = TICKET_CATEGORIES;readonly priorities = TICKET_PRIORITIES;readonly statuses = TICKET_STATUSES;
  readonly form = this.fb.group({ title: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(160)]],
    description: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(4000)]], conversationId: [''], rules: [true], category: ['other' as TicketCategory], priority: ['medium' as TicketPriority] });
  readonly edit = this.fb.group({ status: ['open' as TicketStatus], priority: ['medium' as TicketPriority], category: ['other' as TicketCategory] });
  filters: TicketFilters = { status: '', priority: '', category: '', search: '', conversationId: '' };
  readonly items = signal<SupportTicket[]>([]);readonly total = signal(0);readonly offset = signal(0);
  readonly counts = signal<Record<TicketStatus, number> | null>(null);
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');readonly busy = signal(false);
  readonly mode = signal<'none' | 'create' | 'detail'>('none');readonly selected = signal<SupportTicket | null>(null);
  readonly events = signal<TicketEvent[]>([]);readonly eventTotal = signal(0);readonly eventLoading = signal(false);readonly eventError = signal(false);
  readonly conversations = signal<SupportConversation[]>([]);readonly conversationError = signal(false);readonly conversationLoading = signal(false);
  readonly confirming = signal(false);readonly error = signal('');readonly message = signal('');readonly sourceMessageId = signal<string | null>(null);
  private agentId = '';private epoch = 0;private listRequest = 0;private detailRequest = 0;
  private retry?: { payload: string; requestId: string };
  private eventRequest = 0;
  private lastDraft: ConversationTicketDraft | null = null;
  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.notifyDirty());
    this.edit.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.notifyDirty());
    this.destroyRef.onDestroy(() => { this.epoch++;this.dirtyChange.emit(false);this.busyChange.emit(false); });
  }
  ngOnChanges() {
    if (this.agentId !== this.agent.id) {
      this.agentId = this.agent.id;this.epoch++;this.detailRequest++;this.listRequest++;
      this.reset();this.filters = { status: '', priority: '', category: '', search: '', conversationId: '' };
      this.items.set([]);this.counts.set(null);this.offset.set(0);this.load();
    }
    if (this.conversationDraft && this.conversationDraft !== this.lastDraft && this.conversationDraft.conversation.agent_id === this.agent.id) {
      this.lastDraft = this.conversationDraft;this.newTicket(this.conversationDraft);
    }
  }
  dirty() { return this.mode() === 'create' ? this.form.dirty : this.mode() === 'detail' && this.edit.dirty; }
  private notifyDirty() { this.dirtyChange.emit(this.dirty()); }
  private setBusy(value: boolean) { this.busy.set(value);this.busyChange.emit(value); }
  private reset() {
    this.form.reset({ title: '', description: '', conversationId: '', rules: true, category: 'other', priority: 'medium' });
    this.edit.reset({ status: 'open', priority: 'medium', category: 'other' });this.mode.set('none');this.selected.set(null);this.confirming.set(false);
    this.sourceMessageId.set(null);this.error.set('');this.message.set('');this.events.set([]);this.eventTotal.set(0);this.eventError.set(false);this.eventLoading.set(false);
    this.conversations.set([]);this.conversationLoading.set(false);this.conversationError.set(false);this.retry = undefined;this.setBusy(false);this.notifyDirty();
  }
  load(offset = this.offset()) {
    const epoch = this.epoch, request = ++this.listRequest;this.state.set('loading');
    this.api.list(this.agent.id, { ...this.filters }, offset).pipe(timeout(15000), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: page => { if (epoch !== this.epoch || request !== this.listRequest) return;this.items.set(page.items);this.total.set(page.total);this.offset.set(page.offset);this.counts.set(page.counts);this.state.set('ready'); },
      error: () => { if (epoch === this.epoch && request === this.listRequest) this.state.set('error'); }
    });
  }
  applyFilters() { this.load(0); }
  page(direction: number) { const next = this.offset() + direction * 25;if (next >= 0 && next < this.total() && this.state() !== 'loading') this.load(next); }
  newTicket(draft?: ConversationTicketDraft) {
    if (this.busy() || this.dirty()) { this.error.set('tickets.unsaved');return; }
    this.detailRequest++;this.reset();this.mode.set('create');
    if (draft) {
      this.form.patchValue({ title: draft.conversation.title.slice(0,160), description: draft.description.slice(0,4000), conversationId: draft.conversation.id });
      this.sourceMessageId.set(draft.sourceMessageId);this.form.markAsDirty();this.notifyDirty();
    }
    this.loadConversations();
  }
  loadConversations() {
    const epoch = this.epoch;this.conversationError.set(false);this.conversationLoading.set(true);
    this.agents.listConversations(this.agent.id, 0, 50).pipe(timeout(15000), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: page => { if (epoch !== this.epoch) return;this.conversations.set(page.items);this.conversationLoading.set(false); },
      error: () => { if (epoch === this.epoch) { this.conversationError.set(true);this.conversationLoading.set(false); } }
    });
  }
  changeConversation() { this.sourceMessageId.set(null); }
  review() { this.form.markAllAsTouched();if (this.form.valid && !this.busy() && !this.conversationLoading() && !this.conversationError()) this.confirming.set(true); }
  create() {
    if (!this.confirming() || this.form.invalid || this.busy()) return;
    const value = this.form.getRawValue();const data = { title: value.title.trim(), description: value.description.trim(), conversationId: value.conversationId || null,
      sourceMessageId: this.sourceMessageId(), ...(!value.rules ? { category: value.category, priority: value.priority } : {}) };
    const payload = JSON.stringify(data);if (this.retry?.payload !== payload) this.retry = { payload, requestId: crypto.randomUUID() };
    const epoch = this.epoch;this.setBusy(true);this.error.set('');
    this.api.create(this.agent.id, { ...data, requestId: this.retry.requestId }).pipe(timeout(15000), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ticket => { if (epoch !== this.epoch) return;this.retry = undefined;this.form.markAsPristine();this.confirming.set(false);this.setBusy(false);this.applyTicket(ticket);this.message.set('tickets.created');this.load(0);this.loadEvents(); },
      error: e => { if (epoch === this.epoch) { this.setBusy(false);this.error.set(this.errorKey(e)); } }
    });
  }
  open(ticket: SupportTicket) {
    if (this.busy() || this.dirty()) { this.error.set('tickets.unsaved');return; }
    const epoch = this.epoch, request = ++this.detailRequest;this.setBusy(true);this.error.set('');this.message.set('');
    this.api.get(this.agent.id, ticket.id).pipe(timeout(15000), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: value => { if (epoch !== this.epoch || request !== this.detailRequest) return;this.applyTicket(value);this.setBusy(false);this.loadEvents(); },
      error: e => { if (epoch === this.epoch && request === this.detailRequest) { this.setBusy(false);this.error.set(this.errorKey(e)); } }
    });
  }
  private applyTicket(ticket: SupportTicket) {
    this.eventRequest++;this.eventLoading.set(false);this.events.set([]);this.eventTotal.set(0);this.eventError.set(false);
    this.selected.set(ticket);this.mode.set('detail');this.edit.reset({ status: ticket.status, priority: ticket.priority, category: ticket.category });this.notifyDirty();
  }
  cancel() {
    if (this.busy()) return;
    if (this.confirming()) { this.confirming.set(false);return; }
    const selected = this.selected();if (this.mode() === 'detail' && selected) this.applyTicket(selected);else this.reset();this.error.set('');
  }
  save() {
    const ticket = this.selected();if (!ticket || this.busy() || !this.edit.dirty) return;
    const epoch = this.epoch;this.setBusy(true);this.error.set('');this.message.set('');
    this.api.update(this.agent.id, ticket.id, { version: ticket.version, ...this.edit.getRawValue() }).pipe(timeout(15000), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => { if (epoch !== this.epoch) return;this.setBusy(false);this.applyTicket(updated);this.message.set('tickets.saved');this.load();this.loadEvents(); },
      error: e => { if (epoch === this.epoch) { this.setBusy(false);this.error.set(this.errorKey(e)); } }
    });
  }
  loadEvents(more = false) {
    const ticket = this.selected();if (!ticket || this.eventLoading()) return;
    const epoch = this.epoch, request = ++this.eventRequest;this.eventLoading.set(true);this.eventError.set(false);
    this.api.events(this.agent.id, ticket.id, more ? this.events().length : 0).pipe(timeout(15000), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: page => { if (epoch !== this.epoch || request !== this.eventRequest || this.selected()?.id !== ticket.id) return;this.events.set(more ? [...this.events(), ...page.items] : page.items);this.eventTotal.set(page.total);this.eventLoading.set(false); },
      error: () => { if (epoch === this.epoch && request === this.eventRequest && this.selected()?.id === ticket.id) { this.eventLoading.set(false);this.eventError.set(true); } }
    });
  }
  goToConversation() {
    const ticket = this.selected();if (!ticket?.conversationId || this.busy() || this.dirty()) return;
    const epoch = this.epoch;this.setBusy(true);this.error.set('');
    this.agents.getConversation(this.agent.id, ticket.conversationId).pipe(timeout(15000), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: history => { if (epoch !== this.epoch) return;this.setBusy(false);if (history.conversation.agent_id === this.agent.id) this.openConversation.emit(history.conversation); },
      error: e => { if (epoch === this.epoch) { this.setBusy(false);this.error.set(this.errorKey(e)); } }
    });
  }
  private errorKey(error: HttpErrorResponse) {
    if (error.status === 409) return 'tickets.conflict';if (error.status === 404) return 'tickets.notFound';if (error.status === 403) return 'tickets.forbidden';if (error.status === 400) return 'tickets.invalid';return 'tickets.failed';
  }
  reason(reason: string) {
    if (reason === 'manual' || reason === 'manual_override') return this.ui.text('tickets.manualReason');
    const [cat, pri] = reason.split(';').map(part => part.split(':'));
    return this.ui.text('tickets.ruleReason', { category: this.label('category', cat?.[0] ?? 'other'), priority: this.label('priority', pri?.[0] ?? 'medium'), categoryMatch: this.ui.text(cat?.[1] === 'keywords' ? 'tickets.keywords' : 'tickets.defaultRule'), priorityMatch: this.ui.text(pri?.[1] === 'keywords' ? 'tickets.keywords' : 'tickets.defaultRule') });
  }
  label(kind: 'category' | 'priority' | 'status' | 'source', code: string) { return this.ui.text(`tickets.${kind}.${code}`); }
  eventValue(event: TicketEvent, value: string | null): string {
    if (!value) return '—';
    if (event.type === 'classified') return this.reason(value);
    if (event.type === 'created') { try { const data = JSON.parse(value);return ['status','category','priority'].map(kind => this.label(kind as 'status'|'category'|'priority', data[kind])).join(' · '); } catch { return '—'; } }
    const kind = event.type === 'status_changed' ? 'status' : event.type === 'priority_changed' ? 'priority' : event.type === 'category_changed' ? 'category' : event.type === 'classification_changed' ? 'source' : null;
    return kind ? this.label(kind, value) : value;
  }
}
