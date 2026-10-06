import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { inject } from '@angular/core';
import { ErrorService } from '../services/error.service';

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
      errorService.showError(errorMessage);

      return throwError(() => new Error(errorMessage));
    })
  );
};