import { InjectionToken } from '@angular/core';

/** Informational components keep operational links in the business app by default. */
export const PUBLIC_PRESENTATION = new InjectionToken<boolean>('PUBLIC_PRESENTATION', {
  providedIn: 'root', factory: () => false
});
