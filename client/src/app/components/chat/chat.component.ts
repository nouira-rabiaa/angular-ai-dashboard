import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarkdownComponent } from 'ngx-markdown';
import { ApiService } from '../../services/api.service';
import { DynamicFormComponent } from '../dynamic-form/dynamic-form.component';
import { DynamicFormSchema } from '../../models/dynamic-form.model';

interface Message {
  sender: 'user' | 'ai';
  text?: string;
  totalTokensUsed?: number;
  sentiment?: { label: string; score: number };
  documentName?: string;
  vectorMeta?: { score: string }; 
  formSchema?: DynamicFormSchema;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, DynamicFormComponent], 
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})
export class ChatComponent {
  private apiService = inject(ApiService);

  messages = signal<Message[]>([]);
  userPrompt = signal<string>('');
  
  isLoading = signal<boolean>(false);
  isUploadingDoc = signal<boolean>(false);
  attachedDocument = signal<File | null>(null);

  // Signaux de télémétrie & observabilité Enterprise
  totalTokensUsed = signal<number>(1248);
  averageLatency = signal<number>(342); // en millisecondes
  successRate = signal<number>(100);    // en pourcentage
  estimatedCost = computed(() => (this.totalTokensUsed() * 0.000002).toFixed(4));
  
  // Compteur de tokens en direct pour le prompt en cours de saisie
  liveTokenCount = computed(() => {
    const text = this.userPrompt().trim();
    return text ? Math.ceil(text.length / 4) : null;
  });

  sendMessage() {
    const promptText = this.userPrompt().trim();
    if (!promptText || this.isLoading()) return;

    // 1. Ajouter le message de l'utilisateur dans le chat
    this.messages.update(msgs => [...msgs, { sender: 'user', text: promptText }]);
    this.userPrompt.set('');
    this.isLoading.set(true);

    const startTime = performance.now();

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
          const latency = Math.round(performance.now() - startTime);
          this.averageLatency.set(latency);

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
      this.apiService.sendChatPrompt(promptText).subscribe({
        next: (res: any) => {
          const latency = Math.round(performance.now() - startTime);
          this.averageLatency.set(latency);

          if (res.tokens) {
            this.totalTokensUsed.update(val => val + res.tokens);
          }

          this.messages.update(msgs => [
            ...msgs,
            { 
              sender: 'ai', 
              text: res.reply, 
              totalTokensUsed: res.tokens,
              documentName: res.documentName,
              vectorMeta: res.vectorMeta
            }
          ]);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Erreur chat:', err);
          this.isLoading.set(false);
        }
      });
    }
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
      this.successRate.update(rate => Math.max(0, rate - 5));
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
      next: (res: any) => {
        console.log('✅ Document uploadé et vectorisé avec succès :', res);
        this.attachedDocument.set(file);
        this.isUploadingDoc.set(false);
        
        this.messages.update(msgs => [
          ...msgs,
          { 
            sender: 'ai', 
            text: `📄 Document **${res.filename}** analysé avec succès (${res.characterCount} caractères, ${res.chunksGenerated || 'plusieurs'} chunks vectorisés). Vous pouvez maintenant l'interroger !` 
          }
        ]);
      },
      error: (err) => {
        console.error('❌ Erreur lors de l\'upload du document :', err);
        this.isUploadingDoc.set(false);
        alert('Échec du traitement du document par le serveur.');
      }
    });
  }

  removeDocument() {
    this.attachedDocument.set(null);
  }
}