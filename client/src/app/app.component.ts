import { ErrorService } from './services/error.service';
import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './layout/sidebar.component';
import { LucideMenu } from '@lucide/angular';


@Component({
  selector: 'app-root',
  standalone: true,
 imports: [RouterOutlet, SidebarComponent, LucideMenu],
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
            <button type="button" class="rounded-xl p-2 text-slate-600 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-400 lg:hidden" aria-label="Ouvrir le menu de navigation" [attr.aria-expanded]="mobileOpen()" (click)="mobileOpen.set(true)">
              <svg lucideMenu class="h-5 w-5"></svg>
            </button>
            <div class="min-w-0">
              <p class="truncate text-xs font-semibold text-slate-800 sm:text-sm">Enterprise AI Dashboard</p>
              <p class="hidden text-[10px] text-slate-600 sm:block">AI Operations & FinOps Platform</p>
            </div>
          </div>
          <span class="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">Local demo</span>
        </header>

        <main class="min-w-0 flex-1 p-3 sm:p-5 xl:p-6">
          @if (errors.currentError(); as message) {
            <div role="alert" class="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <p>{{ message }}</p><button type="button" (click)="errors.clearError()" aria-label="Fermer la notification" class="shrink-0 rounded-lg px-2 py-1 font-semibold focus-visible:ring-2 focus-visible:ring-blue-600">Fermer</button>
            </div>
          }
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `
})
export class AppComponent {
  readonly errors = inject(ErrorService);
  sidebarExpanded = signal(true);
  mobileOpen = signal(false);
}