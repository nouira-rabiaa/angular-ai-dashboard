import { Pipe, PipeTransform, inject } from '@angular/core';
import { UiLanguageService } from './ui-language.service';

/** Display-only adapters. Never change inputs, stored values or API payloads. */
@Pipe({ name: 'uiDate', standalone: true, pure: false })
export class UiDatePipe implements PipeTransform {
  private readonly ui = inject(UiLanguageService);
  transform(value: string | number | Date | null | undefined, style = 'mediumDate'): string {
    const options: Intl.DateTimeFormatOptions = style === 'shortTime' ? { timeStyle: 'short' }
      : style === 'medium' ? { dateStyle: 'medium', timeStyle: 'medium' }
      : style === 'short' ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'medium' };
    // Keep the local timezone used by the original Angular DatePipe.
    return this.ui.date(value, { ...options, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  }
}

@Pipe({ name: 'uiStatus', standalone: true, pure: false })
export class UiStatusPipe implements PipeTransform {
  private readonly ui = inject(UiLanguageService);
  transform(value: string): string {
    const keys: Record<string, string> = {
      success: 'workspace.success', error: 'workspace.error', failed: 'workspace.failed',
      no_match: 'workspace.noResult', 'no-match': 'workspace.noResult', 'no-result': 'workspace.noResult', pending: 'workspace.pending',
      active: 'workspace.active', inactive: 'workspace.inactive', answered: 'workspace.answered', abstained: 'workspace.abstained',
      'request-validation': 'workspace.validation', 'sqlite-fts5-retrieval': 'workspace.retrieval',
      'context-preparation': 'workspace.context', 'groq-inference': 'workspace.inference',
      http: 'workspace.http', sql: 'workspace.sql', inference: 'workspace.inference', tool: 'workspace.tool', response: 'workspace.response',
      client: 'workspace.frontend', api: 'workspace.backend', ai: 'workspace.ai', data: 'workspace.data'
    };
    return keys[value] ? this.ui.text(keys[value]) : value;
  }
}
