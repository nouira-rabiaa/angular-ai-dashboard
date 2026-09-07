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
  sentiment?: { label: string; score: number };
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

  onInputChange() {
    if (this.userPrompt.trim().length > 0) {
      this.apiService.countTokens(this.userPrompt).subscribe();
    }
  }

  async sendMessage() {
  if (!this.userPrompt.trim() || this.isLoading()) return;

  const currentText = this.userPrompt;
  const currentTokens = this.liveTokenCount() ?? 0;

  // Typage explicite de la variable
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
      sentiment: sentimentResult 
    }
  ]);

  this.userPrompt = '';

  this.apiService.sendChatPrompt(currentText).subscribe({
    next: (res) => {
      this.messages.update(msgs => [
        ...msgs, 
        { sender: 'ai', text: res.reply }
      ]);
    }
  });
}
}