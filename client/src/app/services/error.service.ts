import { Injectable, signal } from '@angular/core';

export type GlobalErrorKey = 'errors.generic' | 'errors.network' | 'errors.badRequest' | 'errors.unauthorized' | 'errors.forbidden' | 'errors.notFound' | 'errors.conflict' | 'errors.rateLimited' | 'errors.server' | 'errors.http' | 'errors.upload';
export interface ErrorPresentation { key: GlobalErrorKey; params?: { status: number }; }

@Injectable({
  providedIn: 'root'
})
export class ErrorService {
  currentError = signal<string | null>(null);

  readonly presentation = signal<ErrorPresentation | null>(null);

  showError(message: string, presentation: ErrorPresentation | null = null) {
    this.presentation.set(presentation);
    this.currentError.set(message);
  }

  clearError() {
    this.currentError.set(null);
    this.presentation.set(null);
  }
}