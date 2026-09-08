import { DynamicFormSchema } from '../models/dynamic-form.model';
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface DocumentParseResponse {
  filename: string;
  text: string;
  characterCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:3000/api';

  isLoading = signal(false);
  lastTokenCount = signal<number | null>(null);

  sendChatPrompt(prompt: string): Observable<{ reply: string }> {
    this.isLoading.set(true);
    return this.http.post<{ reply: string }>(`${this.baseUrl}/chat`, { prompt }).pipe(
      tap(() => this.isLoading.set(false))
    );
  }

  countTokens(text: string): Observable<{ tokens: number }> {
    return this.http.post<{ tokens: number }>(`${this.baseUrl}/tokens`, { text }).pipe(
      tap(res => this.lastTokenCount.set(res.tokens))
    );
  }

  uploadDocument(file: File): Observable<DocumentParseResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<DocumentParseResponse>(`${this.baseUrl}/document/parse`, formData);
  }

  generateFormSchema(prompt: string): Observable<{ schema: DynamicFormSchema }> {
  return this.http.post<{ schema: DynamicFormSchema }>(`${this.apiUrl}/generate-form`, { prompt });
}
}