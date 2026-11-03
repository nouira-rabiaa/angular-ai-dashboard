import { UiLanguageService } from './i18n/ui-language.service';
import { provideUiI18n } from './i18n/ui-i18n.providers';
import { ApplicationConfig, LOCALE_ID, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { errorInterceptor } from './interceptors/error.interceptor';

registerLocaleData(localeFr, 'fr-FR');

export const appConfig: ApplicationConfig = {
  providers: [
    ...provideUiI18n(),
    provideAppInitializer(() => inject(UiLanguageService).ready),
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: LOCALE_ID, useValue: 'fr-FR' },
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([errorInterceptor]) // <--- Enregistrement global ici
    )
  ]
};

