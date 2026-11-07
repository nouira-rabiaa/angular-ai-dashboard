import { ConversationTicketDraft } from '../../models/support-ticket.model';
import { UiDatePipe } from '../../i18n/ui-format.pipe';
import { TranslocoPipe } from '@jsverse/transloco';
import { UiLanguageService } from '../../i18n/ui-language.service';
import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, EventEmitter, Input, OnChanges, Output, afterRender, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AgentService } from '../../services/agent.service';
import { ConversationMessage, SupportAgent, SupportConversation } from '../../models/support-agent.model';

@Component({
  selector: 'app-agent-conversations', standalone: true, imports: [TranslocoPipe, UiDatePipe, CommonModule, ReactiveFormsModule],
  templateUrl: './agent-conversations.component.html', styleUrl: './agent-conversations.component.scss'
})
export class AgentConversationsComponent implements OnChanges {
  readonly ui = inject(UiLanguageService);
  @Input({ required: true }) agent!: SupportAgent;
  @Input() initialConversation: SupportConversation | null = null;
  @Output() readonly createTicket = new EventEmitter<ConversationTicketDraft>();
  private requestedSeen: SupportConversation | null = null;
  @Output() readonly busyChange = new EventEmitter<boolean>();
  private readonly api = inject(AgentService);
  private readonly destroyRef = inject(DestroyRef);
  readonly conversations = signal<SupportConversation[]>([]);
  readonly selected = signal<SupportConversation | null>(null);
  readonly messages = signal<ConversationMessage[]>([]);
  readonly loading = signal(false);
  readonly sending = signal(false);
  readonly error = signal('');
  readonly confirming = signal<SupportConversation | null>(null);
  readonly nextBefore = signal<number | null>(null);
  readonly total = signal(0);
  readonly question = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(2000)] });
  readonly showList = signal(true);
  private readonly messageViewport = viewChild<ElementRef<HTMLElement>>('messageViewport');
  private readonly chatTitle = viewChild<ElementRef<HTMLElement>>('chatTitle');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  updateAvailableHeight(): void {
    const host = this.host.nativeElement;
    if (!host.getClientRects().length) return;
    const layout = host.querySelector<HTMLElement>('.conversation-layout');
    if (layout) host.style.setProperty('--chat-space', `${Math.max(320, window.innerHeight - layout.getBoundingClientRect().top - 20)}px`);
  }
  private focusChat = false;
  private followLatest = true;
  private scrollSnapshot?: { conversation: string; signature: string; ids: string[]; height: number; top: number };
  selectConversation(conversation: SupportConversation): void {
    if (this.sending()) return;
    if (this.selected()?.id === conversation.id) { this.showList.set(false);this.focusChat = true;return; }
    if (this.question.dirty && this.question.value.trim()) { this.error.set('conversationChat.unsent');return; }
    this.open(conversation);this.focusChat = true;
  }
  newConversation(): void {
    if (this.question.dirty && this.question.value.trim()) { this.error.set('conversationChat.unsent');return; }
    this.focusChat = true;this.create();
  }
  onHistoryScroll(): void {
    const element = this.messageViewport()?.nativeElement;if (!element) return;
    this.followLatest = element.scrollHeight - element.clientHeight - element.scrollTop <= 48;
    if (this.scrollSnapshot) { this.scrollSnapshot.height = element.scrollHeight;this.scrollSnapshot.top = element.scrollTop; }
  }
  latestMessages(): void {
    const element = this.messageViewport()?.nativeElement;if (!element) return;
    element.scrollTop = element.scrollHeight;this.followLatest = true;this.onHistoryScroll();
  }
  syncHistoryScroll(): void {
    const conversation = this.selected();if (!conversation) { this.scrollSnapshot = undefined;return; }
    const element = this.messageViewport()?.nativeElement;if (!element || !element.clientHeight) return;
    if (this.focusChat) { this.chatTitle()?.nativeElement.focus({ preventScroll: true });this.focusChat = false; }
    const messages = this.messages(), ids = messages.map(message => message.id);
    const signature = messages.map(message => `${message.id}:${message.status}:${message.content.length}:${message.sources.length}:${message.stale}`).join('|');
    const previous = this.scrollSnapshot, key = `${this.agent.id}:${conversation.id}`;
    if (!previous || previous.conversation !== key) { element.scrollTop = element.scrollHeight;this.followLatest = true; }
    else if (previous.signature !== signature) {
      const prepended = previous.ids.length > 0 && ids.length > previous.ids.length && previous.ids.every((id, index) => id === ids[ids.length - previous.ids.length + index]);
      if (prepended) element.scrollTop = previous.top + element.scrollHeight - previous.height;
      else if (this.followLatest) element.scrollTop = element.scrollHeight;
    }
    this.scrollSnapshot = { conversation: key, signature, ids, height: element.scrollHeight, top: element.scrollTop };
  }
  private generation = 0;
  private poll?: ReturnType<typeof setTimeout>;
  private retry?: { question: string; requestId: string; conversationId: string };
  private previousAgent = '';

  constructor() { const resize = () => this.updateAvailableHeight();window.addEventListener('resize', resize);afterRender({ mixedReadWrite: () => { this.updateAvailableHeight();this.syncHistoryScroll(); } });this.destroyRef.onDestroy(() => { window.removeEventListener('resize', resize);this.generation++;clearTimeout(this.poll);this.busyChange.emit(false); }); }
  ngOnChanges(): void {
    if (this.previousAgent !== this.agent.id) {
      this.requestedSeen = null;this.loading.set(false);this.previousAgent = this.agent.id;this.generation++;clearTimeout(this.poll);this.retry = undefined;
      this.showList.set(true);this.selected.set(null);this.messages.set([]);this.conversations.set([]);this.confirming.set(null);this.question.reset();this.setSending(false);this.loadList();
    } else this.openRequested();
  }
  ticketDraft() {
    const conversation = this.selected();if (!conversation || this.sending() || this.loading()) return;
    const message = this.messages().slice().reverse().find(item => item.role === 'user');
    this.createTicket.emit({ conversation, description: message?.content.slice(0,4000) ?? '', sourceMessageId: message?.id ?? null });
  }
  private openRequested() {
    const conversation = this.initialConversation;
    if (!conversation || conversation === this.requestedSeen || conversation.agent_id !== this.agent.id) return;
    this.requestedSeen = conversation;
    if (conversation.id === this.selected()?.id) return;
    if (this.question.dirty) { this.error.set('tickets.conversationDraft');return; }
    this.open(conversation);
  }
  private setSending(value: boolean): void { this.sending.set(value);this.busyChange.emit(value); }
  loadList(more = false): void {
    if (this.loading()) return;
    const epoch = this.generation;this.loading.set(true);this.error.set('');
    this.api.listConversations(this.agent.id, more ? this.conversations().length : 0).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: page => { if (epoch !== this.generation) return;this.loading.set(false);this.total.set(page.total);this.conversations.set(more ? [...this.conversations(), ...page.items] : page.items);this.openRequested(); },
      error: () => { if (epoch !== this.generation) return;this.loading.set(false);this.error.set('conversations.conversations_indisponibles_verifiez_le_serveur_et_le'); }
    });
  }
  create(): void {
    if (this.sending() || this.loading() || this.agent.status !== 'active') return;
    const epoch = this.generation;this.setSending(true);this.error.set('');
    this.api.createConversation(this.agent.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: conversation => { if (epoch !== this.generation) return;this.setSending(false);this.conversations.update(items => [conversation, ...items]);this.total.update(total => total + 1);this.open(conversation); },
      error: () => { if (epoch !== this.generation) return;this.setSending(false);this.error.set('conversations.creation_impossible_verifiez_le_statut_de_l'); }
    });
  }
  open(conversation: SupportConversation): void {
    if (this.sending()) return;
    this.showList.set(false);this.generation++;clearTimeout(this.poll);this.retry = undefined;this.question.reset();this.selected.set(conversation);this.messages.set([]);this.nextBefore.set(null);this.read();
  }
  read(older = false): void {
    const conversation = this.selected();if (!conversation) return;
    const epoch = this.generation;this.loading.set(true);this.error.set('');
    this.api.getConversation(this.agent.id, conversation.id, older ? this.nextBefore() ?? undefined : undefined).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: history => {
        if (epoch !== this.generation) return;
        this.loading.set(false);this.nextBefore.set(history.nextBefore);this.selected.set(history.conversation);
        this.conversations.update(items => items.map(item => item.id === conversation.id ? history.conversation : item).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id)));
        this.messages.set(older ? [...history.items, ...this.messages()] : history.items);
        if (history.items.some(item => item.status === 'pending')) {
          this.setSending(true);clearTimeout(this.poll);this.poll = setTimeout(() => this.read(), 1500);
        } else this.setSending(false);
      },
      error: () => { if (epoch !== this.generation) return;this.loading.set(false);this.setSending(false);this.error.set('conversations.historique_indisponible_rechargez_pour_connaitre_le_resultat'); }
    });
  }
  send(): void {
    const conversation = this.selected();if (!conversation || this.question.invalid || this.sending() || this.loading() || this.agent.status !== 'active') return;
    const question = this.question.value.trim();const epoch = this.generation;
    if (!this.retry || this.retry.question !== question || this.retry.conversationId !== conversation.id) this.retry = { question, requestId: crypto.randomUUID(), conversationId: conversation.id };
    this.setSending(true);this.error.set('');
    this.api.sendConversationMessage(this.agent.id, conversation.id, question, this.retry.requestId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { if (epoch !== this.generation) return;this.retry = undefined;this.question.reset();this.setSending(false);this.read(); },
      error: () => { if (epoch !== this.generation) return;this.setSending(false);this.error.set('conversations.envoi_non_confirme_votre_saisie_est_conservee'); }
    });
  }
  remove(): void {
    const conversation = this.confirming();if (!conversation || this.sending()) return;
    const epoch = this.generation;this.setSending(true);this.error.set('');
    this.api.deleteConversation(this.agent.id, conversation.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { if (epoch !== this.generation) return;this.confirming.set(null);this.setSending(false);if (this.selected()?.id === conversation.id) { this.generation++;clearTimeout(this.poll);this.loading.set(false);this.selected.set(null);this.messages.set([]);this.retry = undefined;this.question.reset(); }this.loadList(); },
      error: () => { if (epoch !== this.generation) return;this.setSending(false);this.error.set('conversations.suppression_impossible_la_conversation_reste_conservee'); }
    });
  }
}
