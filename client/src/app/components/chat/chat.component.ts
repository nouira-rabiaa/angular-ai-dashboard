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
    const text = this.userPrompt().trim();
    if (!text || this.isLoading()) return;

    this.messages.update(msgs => [...msgs, { sender: 'user', text }]);
    this.userPrompt.set('');
    this.isLoading.set(true);

    const startTime = performance.now();
    const lowerText = text.toLowerCase();

    if (lowerText.includes('formulaire') || lowerText.includes('form')) {
      this.apiService.generateFormSchema(text).subscribe({
        next: (res: any) => {
          const endTime = performance.now();
          const latency = Math.round(endTime - startTime);
          
          // Mise à jour propre des métriques
          this.averageLatency.set(latency);
          const tokens = res.tokens || 150; // Valeur par défaut si l'API ne renvoie pas encore les tokens exacts
          this.totalTokensUsed.update(val => val + tokens);

          this.messages.update(msgs => [
            ...msgs,
            { 
              sender: 'ai', 
              text: 'Voici le formulaire généré sur mesure :', 
              formSchema: res.schema,
              totalTokensUsed: tokens
            }
          ]);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Erreur:', err);
          this.successRate.set(85); // Exemple de baisse du taux de succès en cas d'erreur
          this.isLoading.set(false);
        }
      });
    } else {
      setTimeout(() => {
        const tokens = Math.ceil(text.length / 4) + 25;
        this.totalTokensUsed.update(val => val + tokens);

        this.messages.update(msgs => [
          ...msgs,
          { sender: 'ai', text: `Réponse pour : "${text}"`, totalTokensUsed: tokens }
        ]);
        this.isLoading.set(false);
      }, 500);
    }
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
    if (file) {
      this.attachedDocument.set(file);
      this.isUploadingDoc.set(true);
      
      // Simulation d'un traitement d'embedding & chunking asynchrone
      setTimeout(() => {
        this.isUploadingDoc.set(false);
      }, 1000);
    }
  }

  removeDocument() {
    this.attachedDocument.set(null);
  }
}