import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { inject } from '@angular/core';
import { ErrorService, ErrorPresentation } from '../services/error.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const errorService = inject(ErrorService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'Une erreur est survenue';

      if (error.error instanceof ErrorEvent) {
        errorMessage = `Erreur réseau : ${error.error.message}`;
      } else {
        switch (error.status) {
          case 400: errorMessage = 'Requête invalide (400).'; break;
          case 401: errorMessage = 'Non autorisé (401).'; break;
          case 404: errorMessage = 'Ressource introuvable (404).'; break;
          case 500: errorMessage = 'Erreur interne du serveur Node.js (500).'; break;
          default: errorMessage = `Erreur Code ${error.status} : ${error.statusText}`;
        }
      }

      // On pousse l'erreur dans le signal global pour l'UI
      const keys: Record<number, ErrorPresentation['key']> = { 0: 'errors.network', 400: 'errors.badRequest', 401: 'errors.unauthorized', 403: 'errors.forbidden', 404: 'errors.notFound', 409: 'errors.conflict', 429: 'errors.rateLimited' };
      const key = error.error instanceof ErrorEvent ? 'errors.network' : keys[error.status] ?? (error.status >= 500 ? 'errors.server' : 'errors.http');
      errorService.showError(errorMessage, { key, ...(key === 'errors.http' ? { params: { status: error.status } } : {}) });

      return throwError(() => new Error(errorMessage));
    })
  );
};