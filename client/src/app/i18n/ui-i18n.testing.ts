import { inject, provideEnvironmentInitializer } from '@angular/core';
import { TRANSLOCO_LOADER, TranslocoService } from '@jsverse/transloco';
import { of } from 'rxjs';
import { provideUiI18n } from './ui-i18n.providers';
import french from './catalogs/fr.json';
import english from './catalogs/en.json';

/** Synchronous catalogs for DOM tests; production uses the real lazy loader. */
export function provideUiI18nTesting() {
  return [
    ...provideUiI18n(),
    { provide: TRANSLOCO_LOADER, useValue: { getTranslation: (lang: string) => of(lang === 'en' ? english : french) } },
    provideEnvironmentInitializer(() => {
      localStorage.removeItem('enterprise-ai-dashboard.ui-language');
      const translations = inject(TranslocoService);
      translations.setTranslation(french, 'fr');
      translations.setTranslation(english, 'en');
      translations.setActiveLang('fr');
    })
  ];
}
