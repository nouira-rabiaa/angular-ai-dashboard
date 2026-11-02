
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { map } from 'rxjs/operators';


export interface DocumentParseResponse {
  documentId: number;
  filename: string;
  text: string;
  characterCount: number;
  chunksGenerated?: number;
}

export interface ChatSource {
  chunkId: number;
  documentId: number;
  filename: string;
  label: string;
  excerpt: string;
  excerptTruncated?: boolean;
  pageNumber?: number;
  startOffset?: number | null;
  endOffset?: number | null;
  rank?: number;
  lexicalRank?: number;
  cited?: boolean;
}

export interface ExecutionTraceStep {
  name: string;
  status: 'success' | 'no_match' | 'error';
  durationMs: number;
}

export interface ChatExecutionTrace {
  traceId: string;
  status: 'success' | 'no_match' | 'error';
  totalDurationMs: number;
  steps: ExecutionTraceStep[];
  retrieval: {
    strategy: 'sqlite-fts5';
    retrievedChunkCount: number;
    scope: 'document' | 'all';
    documentId: number | null;
  };
  modelIdentifier: string | null;
  timestamp: string;
}

export interface ChatUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  source: 'provider' | 'unavailable';
}

export interface ChatCostEstimate {
  estimatedCostUsd: number | null;
  currency: 'USD';
  pricingModelId: string | null;
  pricingSource: 'configured' | null;
  isEstimate: true;
  unavailableReason: string | null;
}

export interface ChatResponse {
  reply: string;
  tokens?: number;
  documentName?: string | null;
  vectorMeta?: { score: string } | null;
  retrievalMeta?: { strategy: string; resultCount: number };
  sources?: ChatSource[];
  citationValidation?: {
    validLabels: string[];
    invalidLabels: string[];
    sourceIdentityValidated: boolean;
    factualEntailmentValidated: boolean;
  };
  usage?: ChatUsage;
  estimatedCostUsd?: number | null;
  currency?: 'USD';
  pricingModelId?: string | null;
  pricingSource?: 'configured' | null;
  isEstimate?: true;
  unavailableReason?: string | null;
  executionTrace?: ChatExecutionTrace;
}

export interface ChatErrorResponse {
  error?: string;
  executionTrace?: ChatExecutionTrace;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:3000/api';

  isLoading = signal(false);
  lastTokenCount = signal<number | null>(null);

  sendChatPrompt(prompt: string, documentId?: number | null): Observable<ChatResponse> {
    this.isLoading.set(true);
    const body = documentId === undefined ? { prompt } : { prompt, documentId };
    return this.http.post<ChatResponse>(`${this.baseUrl}/chat`, body).pipe(
      tap(() => this.isLoading.set(false))
    );
  }

  countTokens(text: string): Observable<{ tokens: number }> {
    return this.http.post<{ tokens: number }>(`${this.baseUrl}/tokens`, { text }).pipe(
      tap(res => this.lastTokenCount.set(res.tokens))
    );
  }

 // 3. Upload et parsing du document pour le RAG (Appelle le serveur)
  uploadDocument(file: File): Observable<DocumentParseResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<DocumentParseResponse>(`${this.baseUrl}/document/parse`, formData);
  }

  


generateFormSchema(prompt: string) {
  return this.http.post<any>(`${this.baseUrl}/generate-form`, { prompt }).pipe(
    map(response => {
      // Si le backend renvoie directement la structure ou un texte brut encapsulé
      let schema = response.schema || response;
      
      // Si c'est du string (parfois le LLM renvoie une string JSON), on parse
      if (typeof schema === 'string') {
        try {
          // On nettoie les éventuelles balises ```json ... ```
          const cleanStr = schema.replace(/```json/gi, '').replace(/```/g, '').trim();
          schema = JSON.parse(cleanStr);
        } catch (e) {
          console.error("Erreur de parsing du JSON brut :", e);
        }
      }
      return { schema, tokens: response.tokens };
    })
  );
}

submitDynamicForm(formData: any): Observable<any> {
  return this.http.post<any>(`${this.baseUrl}/submit-form`, formData);
}

// Récupérer toutes les soumissions de la base de données
getSubmissions(): Observable<any[]> {
  return this.http.get<any[]>(`${this.baseUrl}/dashboard/history`);
}
}