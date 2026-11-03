import { TranslocoPipe } from '@jsverse/transloco';
import { UiLanguageService } from '../i18n/ui-language.service';
import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideBot,
  LucideLayoutDashboard,
  LucidePanelLeftClose,
  LucidePanelLeftOpen,
  LucideSparkles,
  LucideWorkflow
} from '@lucide/angular';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    TranslocoPipe,
    RouterLink,
    RouterLinkActive,
    LucideBot,
    LucideLayoutDashboard,
    LucidePanelLeftClose,
    LucidePanelLeftOpen,
    LucideSparkles,
    LucideWorkflow
  ],
  template: `
    @if (mobileOpen) {
      <button type="button" class="fixed inset-0 z-40 bg-slate-950/60 lg:hidden" [attr.aria-label]="'nav.closeNavigation' | transloco" (click)="closeMobile()"></button>
    }
    <aside
      [class.w-64]="expanded || mobileOpen"
      [class.w-[5.5rem]]="!expanded && !mobileOpen"
      [class.-translate-x-full]="!mobileOpen"
      [class.invisible]="!mobileOpen"
      class="fixed inset-y-0 left-0 z-50 flex h-dvh flex-col border-r border-white/10 bg-[var(--nav)] text-slate-300 shadow-2xl transition-[width,transform] duration-300 motion-reduce:transition-none lg:visible lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:translate-x-0"
      [attr.role]="mobileOpen ? 'dialog' : null"
      [attr.aria-modal]="mobileOpen ? 'true' : null"
      [attr.aria-label]="mobileOpen ? ('nav.main' | transloco) : null"
      (keydown)="onMobileDialogKeydown($event)">
      <div class="flex h-full min-h-0 flex-col">
        <div class="flex h-[5.25rem] shrink-0 items-center gap-3 border-b border-white/10 px-5">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg shadow-indigo-950/40">
            <svg lucideBot class="h-5 w-5"></svg>
          </div>
          @if (expanded || mobileOpen) {
            <div class="min-w-0 flex-1">
              <p class="text-sm font-bold leading-tight text-white">{{ 'brand.name' | transloco }}</p>
              <p class="mt-0.5 text-[10px] font-medium leading-snug text-slate-300">{{ 'brand.subtitle' | transloco }}</p>
            </div>
          }
          <button type="button" data-mobile-focus class="ml-auto rounded-lg p-2 text-blue-100 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 lg:hidden" [attr.aria-label]="'nav.closeMenu' | transloco" (click)="closeMobile()">
            <svg lucidePanelLeftClose class="h-4 w-4"></svg>
          </button>
        </div>

        <nav class="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-4" [attr.aria-label]="'nav.main' | transloco">
          <div>
            @if (expanded || mobileOpen) { <p class="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">{{ 'nav.workspace' | transloco }}</p> }
            <div class="space-y-1.5">
              <a routerLink="/dashboard" [attr.aria-label]="'nav.dashboard' | transloco" data-mobile-focus routerLinkActive="!bg-[var(--brand)] !text-white !shadow-md" [routerLinkActiveOptions]="{exact: true}" ariaCurrentWhenActive="page" (click)="closeMobile()" class="group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-blue-100 outline-none transition duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-300 motion-reduce:transition-none">
                <svg lucideLayoutDashboard class="h-[18px] w-[18px] shrink-0 text-blue-200 transition group-hover:text-white"></svg>
                @if (expanded || mobileOpen) { <span class="min-w-0 whitespace-normal leading-snug">{{ 'nav.dashboard' | transloco }}</span> }
              </a>
              <a routerLink="/generator" [attr.aria-label]="'nav.generator' | transloco" data-mobile-focus routerLinkActive="!bg-[var(--brand)] !text-white !shadow-md" [routerLinkActiveOptions]="{exact: true}" ariaCurrentWhenActive="page" (click)="closeMobile()" class="group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-blue-100 outline-none transition duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-300 motion-reduce:transition-none">
                <svg lucideSparkles class="h-[18px] w-[18px] shrink-0 text-blue-200 transition group-hover:text-white"></svg>
                @if (expanded || mobileOpen) { <span class="min-w-0 whitespace-normal leading-snug">{{ 'nav.generator' | transloco }}</span> }
              </a>
              <a routerLink="/guided-demo" [attr.aria-label]="'nav.guidedDemo' | transloco" data-mobile-focus routerLinkActive="!bg-[var(--brand)] !text-white !shadow-md" [routerLinkActiveOptions]="{exact: true}" ariaCurrentWhenActive="page" (click)="closeMobile()" class="group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-blue-100 outline-none transition duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-300 motion-reduce:transition-none">
                <svg lucideWorkflow class="h-[18px] w-[18px] shrink-0 text-blue-200 transition group-hover:text-white"></svg>
                @if (expanded || mobileOpen) { <span class="min-w-0 whitespace-normal leading-snug">{{ 'nav.guidedDemo' | transloco }}</span> }
              </a>
              <a routerLink="/architecture" [attr.aria-label]="'nav.architecture' | transloco" data-mobile-focus routerLinkActive="!bg-[var(--brand)] !text-white !shadow-md" [routerLinkActiveOptions]="{exact: true}" ariaCurrentWhenActive="page" (click)="closeMobile()" class="group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-blue-100 outline-none transition duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-300 motion-reduce:transition-none">
                <svg lucideWorkflow class="h-[18px] w-[18px] shrink-0 text-blue-200 transition group-hover:text-white"></svg>
                @if (expanded || mobileOpen) { <span class="min-w-0 whitespace-normal leading-snug">{{ 'nav.architecture' | transloco }}</span> }
              </a>
              <a routerLink="/agent-workspace" [attr.aria-label]="'nav.studio' | transloco" data-mobile-focus routerLinkActive="!bg-[var(--brand)] !text-white !shadow-md" ariaCurrentWhenActive="page" (click)="closeMobile()" class="group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-blue-100 outline-none transition duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-300 motion-reduce:transition-none">
                <svg lucideBot class="h-[18px] w-[18px] shrink-0 text-blue-200 transition group-hover:text-white"></svg>
                @if (expanded || mobileOpen) { <span class="min-w-0 whitespace-normal leading-snug">{{ 'nav.studio' | transloco }}</span> }
              </a>
            </div>
          </div>
        </nav>

        <div class="hidden shrink-0 border-t border-white/10 p-3 lg:block">
          <button type="button" data-desktop-focus (click)="toggleExpanded()" [attr.aria-expanded]="expanded" [attr.aria-label]="(expanded ? 'nav.collapseLabel' : 'nav.expandLabel') | transloco" class="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl px-3 text-xs font-semibold text-blue-100 outline-none transition hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-300">
            @if (expanded) { <svg lucidePanelLeftClose class="h-4 w-4"></svg><span>{{ 'nav.collapse' | transloco }}</span> }
            @else { <svg lucidePanelLeftOpen class="h-4 w-4"></svg> }
          </button>
        </div>
      </div>
    </aside>
  `
})
export class SidebarComponent implements OnChanges, OnDestroy {
  readonly languages = inject(UiLanguageService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private focusReturnTarget: HTMLElement | null = null;
  private focusFrame: number | null = null;

  @Input() expanded = true;
  @Input() mobileOpen = false;
  @Output() expandedChange = new EventEmitter<boolean>();
  @Output() mobileOpenChange = new EventEmitter<boolean>();

  ngOnChanges(changes: SimpleChanges): void {
    const mobileOpenChange = changes['mobileOpen'];
    if (!mobileOpenChange) return;

    if (mobileOpenChange.currentValue) {
      if (!mobileOpenChange.previousValue) {
        const activeElement = document.activeElement;
        this.focusReturnTarget = activeElement instanceof HTMLElement ? activeElement : null;
      }
      this.scheduleFocus(() => this.focusFirstMobileControl());
      return;
    }

    if (mobileOpenChange.previousValue) {
      this.scheduleFocus(() => this.restoreFocus());
    }
  }

  ngOnDestroy(): void {
    if (this.focusFrame !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.focusFrame);
    }
  }

  @HostListener('window:resize')
  closeMobileDrawerAtDesktopWidth(): void {
    if (this.mobileOpen && window.matchMedia('(min-width: 64rem)').matches) {
      this.closeMobile();
    }
  }

  toggleExpanded(): void {
    this.expandedChange.emit(!this.expanded);
  }

  closeMobile(): void {
    if (this.mobileOpen) this.mobileOpenChange.emit(false);
  }

  onMobileDialogKeydown(event: KeyboardEvent): void {
    if (!this.mobileOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeMobile();
      return;
    }
    if (event.key !== 'Tab') return;

    const controls = this.mobileFocusableElements();
    if (!controls.length) {
      event.preventDefault();
      return;
    }

    const activeIndex = controls.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && activeIndex <= 0) {
      event.preventDefault();
      controls[controls.length - 1].focus();
    } else if (!event.shiftKey && (activeIndex === -1 || activeIndex === controls.length - 1)) {
      event.preventDefault();
      controls[0].focus();
    }
  }

  private mobileFocusableElements(): HTMLElement[] {
    const controls = this.elementRef.nativeElement.querySelectorAll('[data-mobile-focus]') as NodeListOf<HTMLElement>;
    return Array.from(controls).filter(element => {
      const style = getComputedStyle(element);
      return !element.matches(':disabled') && style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  private focusFirstMobileControl(): void {
    this.mobileFocusableElements()[0]?.focus();
  }

  private restoreFocus(): void {
    const returnTarget = this.focusReturnTarget;
    const isVisible = returnTarget?.isConnected &&
      getComputedStyle(returnTarget).display !== 'none' &&
      getComputedStyle(returnTarget).visibility !== 'hidden';
    if (isVisible) returnTarget.focus();
    else (this.elementRef.nativeElement.querySelector('[data-desktop-focus]') as HTMLElement | null)?.focus();
    this.focusReturnTarget = null;
  }

  private scheduleFocus(focus: () => void): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (this.focusFrame !== null) cancelAnimationFrame(this.focusFrame);
    this.focusFrame = requestAnimationFrame(() => {
      this.focusFrame = null;
      focus();
    });
  }
}