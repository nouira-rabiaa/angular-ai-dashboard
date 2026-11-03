import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AgentService } from '../../services/agent.service';
import { ConversationMessage, SupportAgent, SupportConversation } from '../../models/support-agent.model';

@Component({
  selector: 'app-agent-conversations', standalone: true, imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './agent-conversations.component.html', styleUrl: './agent-conversations.component.scss'
})
export class AgentConversationsComponent implements OnChanges {
  @Input({ required: true }) agent!: SupportAgent;
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
  private generation = 0;
  private poll?: ReturnType<typeof setTimeout>;
  private retry?: { question: string; requestId: string; conversationId: string };
  private previousAgent = '';

  constructor() { this.destroyRef.onDestroy(() => { this.generation++;clearTimeout(this.poll);this.busyChange.emit(false); }); }
  ngOnChanges(): void {
    if (this.previousAgent !== this.agent.id) {
      this.loading.set(false);this.previousAgent = this.agent.id;this.generation++;clearTimeout(this.poll);this.retry = undefined;
      this.selected.set(null);this.messages.set([]);this.conversations.set([]);this.confirming.set(null);this.question.reset();this.setSending(false);this.loadList();
    }
  }
  private setSending(value: boolean): void { this.sending.set(value);this.busyChange.emit(value); }
  loadList(more = false): void {
    if (this.loading()) return;
    const epoch = this.generation;this.loading.set(true);this.error.set('');
    this.api.listConversations(this.agent.id, more ? this.conversations().length : 0).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: page => { if (epoch !== this.generation) return;this.loading.set(false);this.total.set(page.total);this.conversations.set(more ? [...this.conversations(), ...page.items] : page.items); },
      error: () => { if (epoch !== this.generation) return;this.loading.set(false);this.error.set('Conversations indisponibles. Vérifiez le serveur et le mode local, puis rechargez.'); }
    });
  }
  create(): void {
    if (this.sending() || this.loading() || this.agent.status !== 'active') return;
    const epoch = this.generation;this.setSending(true);this.error.set('');
    this.api.createConversation(this.agent.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: conversation => { if (epoch !== this.generation) return;this.setSending(false);this.conversations.update(items => [conversation, ...items]);this.total.update(total => total + 1);this.open(conversation); },
      error: () => { if (epoch !== this.generation) return;this.setSending(false);this.error.set('Création impossible. Vérifiez le statut de l’agent et la limite de 50 conversations.'); }
    });
  }
  open(conversation: SupportConversation): void {
    if (this.sending()) return;
    this.generation++;clearTimeout(this.poll);this.retry = undefined;this.question.reset();this.selected.set(conversation);this.messages.set([]);this.nextBefore.set(null);this.read();
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
      error: () => { if (epoch !== this.generation) return;this.loading.set(false);this.setSending(false);this.error.set('Historique indisponible. Rechargez pour connaître le résultat avant de renvoyer un message.'); }
    });
  }
  send(): void {
    const conversation = this.selected();if (!conversation || this.question.invalid || this.sending() || this.loading() || this.agent.status !== 'active') return;
    const question = this.question.value.trim();const epoch = this.generation;
    if (!this.retry || this.retry.question !== question || this.retry.conversationId !== conversation.id) this.retry = { question, requestId: crypto.randomUUID(), conversationId: conversation.id };
    this.setSending(true);this.error.set('');
    this.api.sendConversationMessage(this.agent.id, conversation.id, question, this.retry.requestId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { if (epoch !== this.generation) return;this.retry = undefined;this.question.reset();this.setSending(false);this.read(); },
      error: () => { if (epoch !== this.generation) return;this.setSending(false);this.error.set('Envoi non confirmé. Votre saisie est conservée ; réessayer la même question réutilise le même identifiant. Rechargez l’historique pour vérifier le résultat.'); }
    });
  }
  remove(): void {
    const conversation = this.confirming();if (!conversation || this.sending()) return;
    const epoch = this.generation;this.setSending(true);this.error.set('');
    this.api.deleteConversation(this.agent.id, conversation.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { if (epoch !== this.generation) return;this.confirming.set(null);this.setSending(false);if (this.selected()?.id === conversation.id) { this.generation++;clearTimeout(this.poll);this.loading.set(false);this.selected.set(null);this.messages.set([]);this.retry = undefined;this.question.reset(); }this.loadList(); },
      error: () => { if (epoch !== this.generation) return;this.setSending(false);this.error.set('Suppression impossible. La conversation reste conservée.'); }
    });
  }
}
