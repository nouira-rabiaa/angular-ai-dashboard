import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarkdownComponent } from 'ngx-markdown';
import { ApiService } from '../../services/api.service';
import { DynamicFormComponent } from '../dynamic-form/dynamic-form.component';
import { DynamicFormSchema } from '../../models/dynamic-form.model';

interface Message {
  sender: 'user' | 'ai';
  text?: string;
  tokens?: number;
  sentiment?: { label: string; score: number };
  documentName?: string;
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
  liveTokenCount = signal<number | null>(null);

  sendMessage() {
    const text = this.userPrompt().trim();
    if (!text || this.isLoading()) return;

    this.messages.update(msgs => [...msgs, { sender: 'user', text }]);
    this.userPrompt.set('');
    this.isLoading.set(true);

    const lowerText = text.toLowerCase();

    if (lowerText.includes('formulaire') || lowerText.includes('form')) {
      this.apiService.generateFormSchema(text).subscribe({
        next: (res) => {
          this.messages.update(msgs => [
            ...msgs,
            { 
              sender: 'ai', 
              text: 'Voici le formulaire généré sur mesure :', 
              formSchema: res.schema 
            }
          ]);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Erreur:', err);
          this.isLoading.set(false);
        }
      });
    } else {
      setTimeout(() => {
        this.messages.update(msgs => [
          ...msgs,
          { sender: 'ai', text: `Réponse pour : "${text}"` }
        ]);
        this.isLoading.set(false);
      }, 500);
    }
  }

  onFormSubmit(formData: any) {
  console.log('Envoi des données du formulaire au serveur...', formData);
  
  this.apiService.submitDynamicForm(formData).subscribe({
    next: (res) => {
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
      this.messages.update(msgs => [
        ...msgs,
        { sender: 'ai', text: '❌ Erreur lors de l\'enregistrement des données du formulaire.' }
      ]);
    }
  });
}

  onInputChange() {
    // Logique de tokens en direct si nécessaire
  }

  onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (file) {
      this.attachedDocument.set(file);
    }
  }

  removeDocument() {
    this.attachedDocument.set(null);
  }
}