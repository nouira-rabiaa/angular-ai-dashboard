import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, tap, throwError } from 'rxjs';

export interface TokenCountResponse {
  text: string;
  tokenCount: number;
  model: string;
}

export interface ChatResponse {
  reply: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:3000/api';

  // Signals pour gérer l'état global réactif de l'application
  readonly isLoading = signal<boolean>(false);
  readonly lastTokenCount = signal<number | null>(null);
  readonly error = signal<string | null>(null);

  /**
   * Appelle la route tiktoken du serveur Express BFF
   */
  countTokens(text: string, model: string = 'gpt-4o'): Observable<TokenCountResponse> {
    this.isLoading.set(true);
    this.error.set(null);

    return this.http.post<TokenCountResponse>(`${this.baseUrl}/tokens/count`, { text, model }).pipe(
      tap((res) => {
        this.lastTokenCount.set(res.tokenCount);
        this.isLoading.set(false);
      }),
      catchError((err) => {
        this.isLoading.set(false);
        this.error.set('Erreur lors du calcul des tokens');
        return throwError(() => err);
      })
    );
  }

  /**
   * Appelle le proxy Groq sur le serveur Express BFF
   */
  sendChatPrompt(prompt: string): Observable<ChatResponse> {
    this.isLoading.set(true);
    this.error.set(null);

    return this.http.post<ChatResponse>(`${this.baseUrl}/chat`, { prompt }).pipe(
      tap(() => this.isLoading.set(false)),
      catchError((err) => {
        this.isLoading.set(false);
        this.error.set('Erreur de communication avec le serveur IA');
        return throwError(() => err);
      })
    );
  }
}