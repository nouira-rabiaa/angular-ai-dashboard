import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarkdownComponent } from 'ngx-markdown';
import { ApiService } from '../../services/api.service';
import { SentimentService, SentimentResult } from '../../services/sentiment.service';

interface Message {
  sender: 'user' | 'ai';
  text: string;
  tokens?: number;
  sentiment?: SentimentResult;
  documentName?: string;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownComponent],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})
export class ChatComponent {
  private apiService = inject(ApiService);
  private sentimentService = inject(SentimentService);

  userPrompt = '';
  messages = signal<Message[]>([]);
  isLoading = this.apiService.isLoading;
  liveTokenCount = this.apiService.lastTokenCount;

  // État du document attaché
  attachedDocument = signal<{ name: string; text: string } | null>(null);
  isUploadingDoc = signal(false);

  onInputChange() {
    if (this.userPrompt.trim().length > 0) {
      this.apiService.countTokens(this.userPrompt).subscribe();
    }
  }
  onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  const file = input.files[0];
  console.log('1. Fichier sélectionné :', file.name);

  this.isUploadingDoc.set(true);

  this.apiService.uploadDocument(file).subscribe({
    next: (res) => {
      console.log('2. Réponse API reçue :', res);
      
      // Force la mise à jour du Signal avec un nouvel objet
      this.attachedDocument.set({
        name: res.filename,
        text: res.text
      });

      this.isUploadingDoc.set(false);
      
      // Réinitialiser le champ file input pour permettre d'uploader à nouveau
      input.value = '';
    },
    error: (err) => {
      console.error('Erreur lors de l\'upload du fichier :', err);
      this.isUploadingDoc.set(false);
    }
  });
}
  removeDocument() {
    this.attachedDocument.set(null);
  }

  async sendMessage() {
    if (!this.userPrompt.trim() || this.isLoading()) return;

    let fullPrompt = this.userPrompt;
    const doc = this.attachedDocument();

    // Injection RAG : ajout du contenu du fichier dans le prompt envoyé au LLM
    if (doc) {
      fullPrompt = `[Contexte du document "${doc.name}"]:\n${doc.text}\n\n[Question de l'utilisateur]:\n${this.userPrompt}`;
    }

    const currentText = this.userPrompt;
    const currentTokens = this.liveTokenCount() ?? 0;

    let sentimentResult: SentimentResult | undefined = undefined;
    try {
      const results = await this.sentimentService.analyze(currentText);
      if (results && results.length > 0) {
        sentimentResult = results[0];
      }
    } catch (e) {
      console.warn('Erreur sentiment:', e);
    }

    this.messages.update(msgs => [
      ...msgs, 
      { 
        sender: 'user', 
        text: currentText, 
        tokens: currentTokens,
        sentiment: sentimentResult,
        documentName: doc?.name
      }
    ]);

    this.userPrompt = '';
    this.attachedDocument.set(null); // Réinitialise après envoi

    this.apiService.sendChatPrompt(fullPrompt).subscribe({
      next: (res) => {
        this.messages.update(msgs => [
          ...msgs, 
          { sender: 'ai', text: res.reply }
        ]);
      }
    });
  }
}