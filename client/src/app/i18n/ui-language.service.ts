import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import french from './catalogs/shell-fr.json';

export type UiLanguage = 'fr' | 'en';
export const UI_LANGUAGE_STORAGE_KEY = 'enterprise-ai-dashboard.ui-language';
export const UI_LANGUAGE_STORAGE = new InjectionToken<Pick<Storage, 'getItem' | 'setItem'> | null>('UI language storage', {
  providedIn: 'root', factory: () => {
    try { return inject(DOCUMENT).defaultView?.localStorage ?? null; } catch { return null; }
  }
});

@Injectable({ providedIn: 'root' })
export class UiLanguageService {
  private readonly translations = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(UI_LANGUAGE_STORAGE);
  private readonly active = signal<UiLanguage>('fr');
  readonly language = this.active.asReadonly();
  readonly locale = computed(() => this.language() === 'fr' ? 'fr-FR' : 'en-US');
  readonly loading = signal(false);
  readonly loadFailed = signal(false);
  readonly ready: Promise<boolean>;
  private request = 0;

  constructor() {
    this.translations.setActiveLang('fr');this.document.documentElement.lang = 'fr';
    inject(DestroyRef).onDestroy(() => { this.request++; });
    let saved: string | null = null;
    try { saved = this.storage?.getItem(UI_LANGUAGE_STORAGE_KEY) ?? null; } catch { /* Private browsing may deny storage. */ }
    this.ready = this.use(saved === 'en' ? 'en' : 'fr', false);
  }

  async use(language: UiLanguage, persist = true): Promise<boolean> {
    if (language !== 'fr' && language !== 'en') return false;
    const request = ++this.request;this.loading.set(true);this.loadFailed.set(false);
    try {
      if (!this.translations.getTranslation('fr')['workspace.noItems']) {
        await firstValueFrom(this.translations.load('fr'));
      }
      if (language === 'en') {
        await firstValueFrom(this.translations.load('en'));
        if (!Object.keys(this.translations.getTranslation('en')).length) throw new Error('English catalog unavailable.');
      }
      if (request !== this.request) return false;
      this.translations.setActiveLang(language);this.active.set(language);this.document.documentElement.lang = language;
      if (persist) { try { this.storage?.setItem(UI_LANGUAGE_STORAGE_KEY, language); } catch { /* Language still works in memory. */ } }
      this.loading.set(false);return true;
    } catch {
      if (request !== this.request) return false;
      if (!Object.keys(this.translations.getTranslation('fr')).length) this.translations.setTranslation(french, 'fr');
      this.translations.setActiveLang('fr');this.active.set('fr');this.document.documentElement.lang = 'fr';
      this.loading.set(false);this.loadFailed.set(true);return false;
    }
  }

  text(key: string, params: Record<string, unknown> = {}): string {
    this.language();
    return key ? this.translations.translate(key, params) : '';
  }

  number(value: number | null | undefined, options: Intl.NumberFormatOptions = {}): string {
    return typeof value === 'number' && Number.isFinite(value)
      ? new Intl.NumberFormat(this.locale(), options).format(value)
      : this.translations.translate('common.unavailable');
  }
  currency(value: number | null | undefined, currency = 'USD', options: Intl.NumberFormatOptions = {}): string {
    return this.number(value, { style: 'currency', ...options, currency });
  }
  percent(ratio: number | null | undefined, options: Intl.NumberFormatOptions = {}): string {
    return this.number(ratio, { style: 'percent', ...options });
  }
  date(value: string | number | Date | null | undefined, options: Intl.DateTimeFormatOptions = {}): string {
    if (value === null || value === undefined) return this.translations.translate('common.unavailable');
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat(this.locale(), { timeZone: 'UTC', ...(Object.keys(options).length ? options : { dateStyle: 'medium' }) }).format(date)
      : this.translations.translate('common.unavailable');
  }
}
