import { TranslocoPipe } from '@jsverse/transloco';
import { UiLanguageService } from './i18n/ui-language.service';
import { ErrorService } from './services/error.service';
import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './layout/sidebar.component';
import { LucideMenu } from '@lucide/angular';


@Component({
  selector: 'app-root',
  standalone: true,
 imports: [RouterOutlet, SidebarComponent, LucideMenu, TranslocoPipe],
  styles: [`
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
    }
  `],
  template: `
    <div class="min-h-screen bg-[var(--canvas)] lg:grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]" [style.--sidebar-width]="sidebarExpanded() ? '16rem' : '5.5rem'">
      <app-sidebar [expanded]="sidebarExpanded()" [mobileOpen]="mobileOpen()"
        (expandedChange)="sidebarExpanded.set($event)" (mobileOpenChange)="mobileOpen.set($event)"></app-sidebar>

      <div class="flex min-h-screen min-w-0 flex-col">
        <header class="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-[var(--line)] bg-white/90 px-4 backdrop-blur-sm sm:px-7">
          <div class="flex min-w-0 items-center gap-3">
            <button type="button" class="rounded-xl p-2 text-slate-600 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-violet-500 lg:hidden" [attr.aria-label]="'shell.openNavigation' | transloco" [attr.aria-expanded]="mobileOpen()" (click)="mobileOpen.set(true)">
              <svg lucideMenu class="h-5 w-5"></svg>
            </button>
            <div class="min-w-0">
              <p class="truncate text-xs font-semibold text-slate-800 sm:text-sm">{{ 'brand.name' | transloco }}</p>
              <p class="hidden text-[10px] text-slate-600 sm:block">{{ 'brand.subtitle' | transloco }}</p>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <div role="group" [attr.aria-label]="'shell.language' | transloco" [attr.aria-busy]="languages.loading()" class="flex rounded-full border border-violet-100 bg-white p-0.5">
              <button type="button" (click)="languages.use('fr')" [attr.aria-pressed]="languages.language() === 'fr'" [attr.aria-label]="'shell.french' | transloco" [style.background-color]="languages.language() === 'fr' ? 'var(--brand)' : null" [class.text-white]="languages.language() === 'fr'" class="min-h-9 min-w-10 rounded-full px-2 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-violet-500">FR</button>
              <button type="button" (click)="languages.use('en')" [attr.aria-pressed]="languages.language() === 'en'" [attr.aria-label]="'shell.english' | transloco" [style.background-color]="languages.language() === 'en' ? 'var(--brand)' : null" [class.text-white]="languages.language() === 'en'" class="min-h-9 min-w-10 rounded-full px-2 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-violet-500">EN</button>
            </div>
            <span class="hidden rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-800 md:inline-flex">{{ 'shell.localDemo' | transloco }}</span>
            @if (languages.loading()) { <span role="status" class="sr-only">{{ 'shell.languageLoading' | transloco }}</span> }
          </div>
        </header>

        @if (languages.loadFailed()) { <p role="alert" class="mx-3 mt-2 rounded-xl bg-amber-50 p-2 text-sm text-amber-900">{{ 'shell.languageError' | transloco }}</p> }
        <main class="min-w-0 flex-1 p-3 sm:p-5 xl:p-6">
          @if (errors.currentError(); as message) {
            <div role="alert" class="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <p>{{ errors.presentation() ? (errors.presentation()!.key | transloco: errors.presentation()!.params) : message }}</p><button type="button" (click)="errors.clearError()" [attr.aria-label]="'shell.closeNotification' | transloco" class="shrink-0 rounded-lg px-2 py-1 font-semibold focus-visible:ring-2 focus-visible:ring-violet-500">{{ 'shell.close' | transloco }}</button>
            </div>
          }
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `
})
export class AppComponent {
  readonly languages = inject(UiLanguageService);
  readonly errors = inject(ErrorService);
  sidebarExpanded = signal(true);
  mobileOpen = signal(false);
}