import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ErrorService {
  currentError = signal<string | null>(null);

  showError(message: string) {
    this.currentError.set(message);
  }

  clearError() {
    this.currentError.set(null);
  }
}