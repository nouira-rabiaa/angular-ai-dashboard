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
  imports: [CommonModule, FormsModule, MarkdownComponent, DynamicFormComponent],
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
  estimatedCost = computed(() => (this.totalTokensUsed() * 0.000002).toFixed(4)); // Calcul basé sur un tarif moyen LLM
  
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

  // 2. Appel vers ton serveur Node.js (qui contient le RAG)
  this.apiService.sendChatPrompt(promptText).subscribe({
    next: (res: any) => {
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      // Mettre à jour les métriques globales
      this.averageLatency.set(latency);
      if (res.tokens) {
        this.totalTokensUsed.update(val => val + res.tokens);
      }

      // 3. ICI : On récupère bien les données RAG renvoyées par le serveur (documentName et vectorMeta)
      this.messages.update(msgs => [
        ...msgs,
        { 
          sender: 'ai', 
          text: res.reply, 
          totalTokensUsed: res.tokens,
          documentName: res.documentName, // <--- Transmet le nom du fichier source
          vectorMeta: res.vectorMeta     // <--- Transmet le score Cosine Similarity
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

  onFormSubmit(formData: any) {
    console.log('Envoi des données du formulaire au serveur...', formData);
    
    this.apiService.submitDynamicForm(formData).subscribe({
      next: (res: any) => {
        this.messages.update(msgs => [
          ...msgs,
          { 
            sender: 'ai', 
            text: `✅ ${res.message}\n\`\`\`json\n${JSON.stringify(res.data, null, 2)}\n\`\`\`` 
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

    // Appel réel au serveur Node.js pour parser et vectoriser le document (RAG)
    this.apiService.uploadDocument(file).subscribe({
      next: (res: any) => {
        console.log('✅ Document uploadé et vectorisé avec succès par le serveur :', res);
        this.attachedDocument.set(file);
        this.isUploadingDoc.set(false);
        
        // Optionnel : Ajouter un petit message système dans le chat pour confirmer
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