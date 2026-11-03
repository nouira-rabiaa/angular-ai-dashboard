import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, isDevMode } from '@angular/core';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoLoader, TranslocoMissingHandler, TranslocoMissingHandlerData, TranslocoService, provideTransloco, provideTranslocoMissingHandler } from '@jsverse/transloco';
import { from, map, throwError } from 'rxjs';
import { UiLanguageService } from './ui-language.service';

@Injectable()
export class UiCatalogLoader implements TranslocoLoader {
  getTranslation(language: string) {
    if (language === 'fr') return from(import('./catalogs/fr.json')).pipe(map(module => module.default));
    if (language === 'en') return from(import('./catalogs/en.json')).pipe(map(module => module.default));
    return throwError(() => new Error('Unsupported UI language.'));
  }
}

@Injectable()
export class SafeMissingTranslation implements TranslocoMissingHandler {
  handle(key: string, config: TranslocoMissingHandlerData): string {
    if (isDevMode()) console.warn(`[i18n] Missing translation: ${key}`);
    return config.activeLang === 'en' ? 'Label unavailable' : 'Libellé indisponible';
  }
}

@Injectable()
export class UiTitleStrategy extends TitleStrategy {
  private readonly languages = inject(UiLanguageService);
  private readonly translations = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);
  private snapshot?: RouterStateSnapshot;
  constructor() { super();effect(() => { this.languages.language();this.update(); }); }
  override updateTitle(snapshot: RouterStateSnapshot): void { this.snapshot = snapshot;this.update(); }
  private update(): void {
    if (!this.snapshot) return;
    const path = this.snapshot.url.split(/[?#]/)[0];
    const keys: Record<string, string> = { '/dashboard': 'nav.dashboard', '/generator': 'nav.generator', '/guided-demo': 'nav.guidedDemo', '/architecture': 'nav.architecture', '/agent-workspace': 'nav.studio' };
    const key = keys[path];
    this.document.title = key ? this.translations.translate('common.pageTitle', { page: this.translations.translate(key) }) : this.translations.translate('brand.name');
  }
}

export function provideUiI18n() {
  return [
    ...provideTransloco({ config: {
      availableLangs: ['fr', 'en'], defaultLang: 'fr', fallbackLang: 'fr', reRenderOnLangChange: true,
      prodMode: !isDevMode(), failedRetries: 0,
      missingHandler: { allowEmpty: false, useFallbackTranslation: true, logMissingKey: isDevMode() }
    }, loader: UiCatalogLoader }),
    provideTranslocoMissingHandler(SafeMissingTranslation),
    { provide: TitleStrategy, useClass: UiTitleStrategy }
  ];
}
