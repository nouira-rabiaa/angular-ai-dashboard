import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

interface Message {
  sender: 'user' | 'ai';
  text: string;
  tokens?: number;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})
export class ChatComponent {
  private apiService = inject(ApiService);

  userPrompt = '';
  messages = signal<Message[]>([]);
  isLoading = this.apiService.isLoading;
  liveTokenCount = this.apiService.lastTokenCount;

  onInputChange() {
    if (this.userPrompt.trim().length > 0) {
      this.apiService.countTokens(this.userPrompt).subscribe();
    }
  }

  sendMessage() {
    if (!this.userPrompt.trim() || this.isLoading()) return;

    const currentText = this.userPrompt;
    const currentTokens = this.liveTokenCount() ?? 0;

    this.messages.update(msgs => [
      ...msgs, 
      { sender: 'user', text: currentText, tokens: currentTokens }
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