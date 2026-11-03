import { Component, signal } from '@angular/core';
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
    <div class="min-h-screen bg-[var(--ui-bg)] lg:grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]" [style.--sidebar-width]="sidebarExpanded() ? '18rem' : '5.5rem'">
      <app-sidebar [expanded]="sidebarExpanded()" [mobileOpen]="mobileOpen()"
        (expandedChange)="sidebarExpanded.set($event)" (mobileOpenChange)="mobileOpen.set($event)"></app-sidebar>

      <div class="flex min-h-screen min-w-0 flex-col">
        <header class="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 backdrop-blur-xl sm:px-7">
          <div class="flex min-w-0 items-center gap-3">
            <button type="button" class="rounded-xl p-2 text-[var(--ui-muted)] outline-none transition hover:bg-[var(--ui-raised)] focus-visible:ring-2 focus-visible:ring-indigo-400 lg:hidden" aria-label="Ouvrir le menu de navigation" [attr.aria-expanded]="mobileOpen()" (click)="mobileOpen.set(true)">
              <svg lucideMenu class="h-5 w-5"></svg>
            </button>
            <div class="min-w-0">
              <p class="truncate text-xs font-semibold text-[var(--ui-text)] sm:text-sm">Enterprise AI Dashboard</p>
              <p class="hidden text-[10px] text-[var(--ui-muted)] sm:block">AI Operations & FinOps Platform</p>
            </div>
          </div>
          <span class="rounded-full border border-[var(--ui-border)] bg-[var(--ui-selected)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ui-accent)]">Local demo</span>
        </header>

        <main class="min-w-0 flex-1 p-3 sm:p-4">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `
})
export class AppComponent {
  sidebarExpanded = signal(true);
  mobileOpen = signal(false);
}