import { ErrorService } from '../../services/error.service';
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { ChatCostEstimate, ChatErrorResponse, ChatExecutionTrace, ChatSource, ChatUsage, ChatResponse } from '../../services/api.service';
import { DynamicFormComponent } from '../dynamic-form/dynamic-form.component';
import { DynamicFormSchema } from '../../models/dynamic-form.model';

interface Message {
  sender: 'user' | 'ai';
  text?: string;
  sentiment?: { label: string; score: number };
  documentName?: string;
  vectorMeta?: { score: string }; 
  chatResponse?: boolean;
  sources?: ChatSource[];
  citationValidation?: ChatResponse['citationValidation'];
  usage?: ChatUsage;
  cost?: ChatCostEstimate;
  executionTrace?: ChatExecutionTrace;
  formSchema?: DynamicFormSchema;
}

type RetrievalScope = 'active' | 'all';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, DynamicFormComponent], 
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})
export class ChatComponent {
  private apiService = inject(ApiService);
  private readonly errors = inject(ErrorService);

  messages = signal<Message[]>([]);
  userPrompt = signal<string>('');
  
  isLoading = signal<boolean>(false);
  isUploadingDoc = signal<boolean>(false);
  attachedDocument = signal<File | null>(null);
  activeDocumentId = signal<number | null>(null);
  retrievalScope = signal<RetrievalScope>('all');

  sendMessage() {
    const promptText = this.userPrompt().trim();
    if (!promptText || this.isLoading()) return;

    // 1. Ajouter le message de l'utilisateur dans le chat
    this.messages.update(msgs => [...msgs, { sender: 'user', text: promptText }]);
    this.userPrompt.set('');
    this.isLoading.set(true);

    const normalizedPrompt = promptText
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const isFormRequest =
      /\b(form|formulaire|formulaire)\b/.test(normalizedPrompt) ||
      normalizedPrompt.includes('cree un formulaire') ||
      normalizedPrompt.includes('genere un formulaire') ||
      normalizedPrompt.includes('creer un formulaire');

    if (isFormRequest) {
      // 2A. Appel vers la route dédiée aux schémas de formulaires JSON
      this.apiService.generateFormSchema(promptText).subscribe({
        next: (res: any) => {
          const formSchema = res.schema || res;

          // On injecte formSchema pour activer <app-dynamic-form> dans le HTML
          this.messages.update(msgs => [
            ...msgs,
            { 
              sender: 'ai', 
              text: `Voici le formulaire généré selon votre demande :`,
              formSchema: formSchema 
            }
          ]);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Erreur génération formulaire:', err);
          this.isLoading.set(false);
        }
      });

    } else {
      // 2B. Appel classique vers le Chat RAG (/api/chat)
      const documentId = this.retrievalScope() === 'active' ? this.activeDocumentId() : null;
      this.apiService.sendChatPrompt(promptText, documentId).subscribe({
        next: (res: ChatResponse) => {
          this.messages.update(msgs => [
            ...msgs,
            { 
              sender: 'ai', 
              text: res.reply, 
              totalTokensUsed: res.tokens,
              documentName: res.documentName ?? undefined,
              vectorMeta: res.vectorMeta ?? undefined,
              chatResponse: true,
              sources: res.sources ?? [],
              citationValidation: res.citationValidation,
              usage: res.usage,
              cost: this.toCostEstimate(res),
              executionTrace: res.executionTrace
            }
          ]);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Erreur chat:', err);
          const errorResponse = err.error as ChatErrorResponse | undefined;
          this.messages.update(msgs => [...msgs, {
            sender: 'ai',
            text: errorResponse?.error || 'La requête IA a échoué.',
            chatResponse: true,
            sources: [],
            executionTrace: errorResponse?.executionTrace
          }]);
          this.isLoading.set(false);
        }
      });
    }
  }

  private toCostEstimate(response: ChatResponse): ChatCostEstimate | undefined {
    if (response.estimatedCostUsd === undefined) return undefined;
    return {
      estimatedCostUsd: response.estimatedCostUsd,
      currency: response.currency ?? 'USD',
      pricingModelId: response.pricingModelId ?? null,
      pricingSource: response.pricingSource ?? null,
      isEstimate: true,
      unavailableReason: response.unavailableReason ?? null
    };
  }

  formatTraceStepName(name: string): string {
    switch (name) {
      case 'request-validation': return 'Validation de la requête';
      case 'sqlite-fts5-retrieval': return 'Recherche SQLite FTS5';
      case 'context-preparation': return 'Préparation du contexte';
      case 'groq-inference': return 'Inférence Groq';
      default: return name;
    }
  }

  getStepDuration(trace: ChatExecutionTrace, name: string): string {
    const step = trace.steps.find(item => item.name === name);
    return step ? this.formatDuration(step.durationMs) : 'Indisponible';
  }

  formatDuration(durationMs: number): string {
    if (!Number.isFinite(durationMs) || durationMs < 0) return 'Indisponible';
    return `${durationMs.toLocaleString(undefined, { maximumFractionDigits: 2 })} ms`;
  }

  formatCost(cost?: number | null): string {
    return typeof cost === 'number' && Number.isFinite(cost)
      ? `$${cost.toFixed(8)} USD`
      : 'Indisponible';
  }

  onFormSubmit(formData: any) {
  console.log('Envoi des données du formulaire au serveur...', formData);
  
  this.apiService.submitDynamicForm(formData).subscribe({
    next: (res: any) => {
      // 🟢 Transformation propre du JSON en texte structuré
      const dataEntries = res.data ? Object.entries(res.data) : [];
      const formattedDetails = dataEntries.map(([key, value]) => `• **${key}** : ${value}`).join('\n');

      this.messages.update(msgs => [
        ...msgs,
        { 
          sender: 'ai', 
          text: `✅ ${res.message}\n\n**Données enregistrées :**\n${formattedDetails}` 
        }
      ]);
    },
    error: (err) => {
      console.error('Erreur lors de la soumission', err);
      this.messages.update(msgs => [
        ...msgs,
        { sender: 'ai', text: '❌ Erreur lors de l\'enregistrement des données du formulaire.' }
      ]);
    }
  });
}

  onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    this.isUploadingDoc.set(true);

    this.apiService.uploadDocument(file).subscribe({
      next: (res) => {
        console.log('✅ Document importé et indexé avec succès :', res);
        this.attachedDocument.set(file);
        this.activeDocumentId.set(res.documentId);
        this.retrievalScope.set('active');
        this.isUploadingDoc.set(false);
        
        this.messages.update(msgs => [
          ...msgs,
          { 
            sender: 'ai', 
            text: `📄 Document **${res.filename}** analysé avec succès (${res.characterCount} caractères, ${res.chunksGenerated ?? 'indisponible'} chunks indexés). Vous pouvez maintenant l'interroger !`
          }
        ]);
      },
      error: (err) => {
        console.error('❌ Erreur lors de l\'upload du document :', err);
        this.isUploadingDoc.set(false);
        this.errors.showError('Échec du traitement du document par le serveur.');
      }
    });
  }

  removeDocument() {
    this.attachedDocument.set(null);
    this.activeDocumentId.set(null);
    this.retrievalScope.set('all');
  }

  setRetrievalScope(scope: RetrievalScope): void {
    if (scope === 'active' && this.activeDocumentId() === null) return;
    this.retrievalScope.set(scope);
  }
}
