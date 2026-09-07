import { Injectable, signal } from '@angular/core';
import { pipeline } from '@xenova/transformers';

export interface SentimentResult {
  label: string;
  score: number;
}

@Injectable({
  providedIn: 'root'
})
export class SentimentService {
  private classifier: any = null;
  isInitializing = signal(false);
  isReady = signal(false);

  async initModel() {
    if (this.classifier || this.isInitializing()) return;

    this.isInitializing.set(true);
    this.classifier = await pipeline('sentiment-analysis', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english');
    
    this.isInitializing.set(false);
    this.isReady.set(true);
  }

  async analyze(text: string): Promise<SentimentResult[]> {
    if (!this.classifier) {
      await this.initModel();
    }
    return await this.classifier(text);
  }
}