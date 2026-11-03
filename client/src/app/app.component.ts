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
    <div class="min-h-screen bg-[#F3F6FC] lg:grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]" [style.--sidebar-width]="sidebarExpanded() ? '18rem' : '5.5rem'">
      <app-sidebar [expanded]="sidebarExpanded()" [mobileOpen]="mobileOpen()"
        (expandedChange)="sidebarExpanded.set($event)" (mobileOpenChange)="mobileOpen.set($event)"></app-sidebar>

      <div class="flex min-h-screen min-w-0 flex-col">
        <header class="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-7">
          <div class="flex min-w-0 items-center gap-3">
            <button type="button" class="rounded-xl p-2 text-slate-600 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-400 lg:hidden" aria-label="Ouvrir le menu de navigation" [attr.aria-expanded]="mobileOpen()" (click)="mobileOpen.set(true)">
              <svg lucideMenu class="h-5 w-5"></svg>
            </button>
            <div class="min-w-0">
              <p class="truncate text-xs font-semibold text-slate-800 sm:text-sm">Enterprise AI Dashboard</p>
              <p class="hidden text-[10px] text-slate-600 sm:block">AI Operations & FinOps Platform</p>
            </div>
          </div>
          <span class="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">Local demo</span>
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