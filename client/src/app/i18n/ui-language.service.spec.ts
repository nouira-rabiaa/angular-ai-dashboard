import french from './catalogs/fr.json';
import { TestBed } from '@angular/core/testing';
import { TRANSLOCO_LOADER, TranslocoService } from '@jsverse/transloco';
import { of, Subject, throwError } from 'rxjs';
import { provideUiI18n } from './ui-i18n.providers';
import { UI_LANGUAGE_STORAGE, UI_LANGUAGE_STORAGE_KEY, UiLanguageService } from './ui-language.service';
import english from './catalogs/en.json';

describe('UI language infrastructure', () => {
  beforeEach(() => { localStorage.removeItem(UI_LANGUAGE_STORAGE_KEY);TestBed.configureTestingModule({ providers: [...provideUiI18n()] }); });
  afterEach(() => localStorage.removeItem(UI_LANGUAGE_STORAGE_KEY));

  it('defaults to French without browser-language detection and sets document lang', async () => {
    const service = TestBed.inject(UiLanguageService);await service.ready;
    expect(service.language()).toBe('fr');expect(document.documentElement.lang).toBe('fr');
    expect(TestBed.inject(TranslocoService).translate('nav.generator')).toBe('Générateur IA');
  });
  it('switches immediately after catalog loading, persists and returns to French', async () => {
    const service = TestBed.inject(UiLanguageService);await service.use('en');
    expect(service.language()).toBe('en');expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(TestBed.inject(TranslocoService).translate('nav.generator')).toBe('AI Generator');
    await service.use('fr');expect(service.language()).toBe('fr');expect(localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)).toBe('fr');
  });
  it('restores the persisted choice when the application injector is reconstructed', async () => {
    await TestBed.inject(UiLanguageService).use('en');TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...provideUiI18n()] });
    const restored = TestBed.inject(UiLanguageService);await restored.ready;
    expect(restored.language()).toBe('en');expect(document.documentElement.lang).toBe('en');
  });
  it('ignores invalid stored values', async () => {
    localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, 'unsupported');
    const service = TestBed.inject(UiLanguageService);await service.ready;
    expect(service.language()).toBe('fr');expect(await service.use('de' as 'fr')).toBe(false);
  });
  it('works in memory when reading or writing localStorage throws', async () => {
    TestBed.overrideProvider(UI_LANGUAGE_STORAGE, { useValue: { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('denied'); } } });
    const service = TestBed.inject(UiLanguageService);await service.ready;
    expect(service.language()).toBe('fr');expect(await service.use('en')).toBe(true);expect(service.language()).toBe('en');
  });
  it('uses French for a missing English key and never displays an unknown key', async () => {
    const service = TestBed.inject(UiLanguageService);await service.use('en');
    const transloco = TestBed.inject(TranslocoService);
    transloco.setTranslation({ nav: { main: 'Main navigation' } }, 'en', { merge: false });
    expect(transloco.translate('nav.generator')).toBe('Générateur IA');
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const unknown = transloco.translate('unknown.key');expect(unknown).not.toBe('unknown.key');expect(unknown).toBe('Label unavailable');expect(warning).toHaveBeenCalled();warning.mockRestore();
  });
  it('falls back safely on a catalog loading failure', async () => {
    TestBed.overrideProvider(TRANSLOCO_LOADER, { useValue: { getTranslation: (language: string) => language === 'fr' ? of(french) : throwError(() => new Error('offline')) } });
    const service = TestBed.inject(UiLanguageService);
    expect(await service.use('en')).toBe(false);expect(service.language()).toBe('fr');expect(service.loadFailed()).toBe(true);expect(document.documentElement.lang).toBe('fr');
  });
  it('keeps the last requested language when async loading resolves out of order', async () => {
    const service = TestBed.inject(UiLanguageService);await service.ready;const translations = TestBed.inject(TranslocoService);const pending = new Subject<typeof english>();
    jest.spyOn(translations, 'load').mockReturnValue(pending);const first = service.use('en');await service.use('fr');pending.next(english);
    expect(await first).toBe(false);expect(service.language()).toBe('fr');expect(localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)).toBe('fr');
  });
  it('localizes number, date, percentage and currency display without conversion or mutation', async () => {
    const service = TestBed.inject(UiLanguageService);const value = 1234.5;const date = new Date('2026-11-03T10:00:00Z');
    expect(service.number(value)).toBe(new Intl.NumberFormat('fr-FR').format(value));
    expect(service.percent(.8)).toContain('80');const french = service.date(date);
    await service.use('en');expect(service.number(value)).toBe('1,234.5');expect(service.percent(.8)).toBe('80%');
    expect(service.currency(value, 'USD')).toBe('$1,234.50');expect(service.date(date)).not.toBe(french);
    expect(service.date(date, { year: 'numeric' })).toBe('2026');expect(service.date(null)).toBe('Unavailable');expect(service.number(NaN)).toBe('Unavailable');
    expect(value).toBe(1234.5);expect(date.toISOString()).toBe('2026-11-03T10:00:00.000Z');
  });
  it('supports interpolation through Transloco', async () => {
    await TestBed.inject(UiLanguageService).use('en');
    expect(TestBed.inject(TranslocoService).translate('errors.http', { status: 418 })).toContain('HTTP 418');
  });
});
