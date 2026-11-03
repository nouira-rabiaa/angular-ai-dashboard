import { UiLanguageService } from '../i18n/ui-language.service';
import { provideUiI18n } from '../i18n/ui-i18n.providers';
import { UI_LANGUAGE_STORAGE_KEY } from '../i18n/ui-language.service';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SidebarComponent } from './sidebar.component';

@Component({ standalone: true, template: '<p>page</p>' })
class TestPageComponent {}

describe('SidebarComponent', () => {
  let fixture: ComponentFixture<SidebarComponent>;
  let component: SidebarComponent;
  let router: Router;

  beforeEach(async () => {
    localStorage.removeItem(UI_LANGUAGE_STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [...provideUiI18n(), provideRouter([
        { path: 'dashboard', component: TestPageComponent },
        { path: 'generator', component: TestPageComponent },
        { path: 'guided-demo', component: TestPageComponent },
        { path: 'architecture', component: TestPageComponent },
        { path: 'agent-workspace', component: TestPageComponent }
      ])]
    }).compileComponents();
    await TestBed.inject(UiLanguageService).ready;
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('preserves all existing navigation routes and marks the active dashboard link', async () => {
    await router.navigateByUrl('/dashboard');
    fixture.detectChanges();

    const links = Array.from(fixture.nativeElement.querySelectorAll('nav a')) as HTMLAnchorElement[];
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/dashboard', '/generator', '/guided-demo', '/architecture', '/agent-workspace']);
    expect(links[0].getAttribute('aria-current')).toBe('page');
  });

  it('emits desktop expand/collapse state and reflects ARIA', () => {
    fixture.detectChanges();
    const changes: boolean[] = [];
    component.expandedChange.subscribe(value => changes.push(value));

    const toggle = fixture.nativeElement.querySelector('button[aria-label="Réduire le menu latéral"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();

    expect(changes).toEqual([false]);
  });

  it('keeps all navigation links named when the desktop sidebar is collapsed', () => {
    component.expanded = false;
    fixture.detectChanges();

    const links = Array.from(fixture.nativeElement.querySelectorAll('nav a')) as HTMLAnchorElement[];
    expect(links.map(link => link.getAttribute('aria-label'))).toEqual([
      'Tableau de bord',
      'Générateur IA',
      'Démo guidée',
      'Explorateur d’architecture',
      'Studio d’agents de support'
    ]);
    expect(links.every(link => link.textContent?.trim() === '')).toBe(true);
  });

  it('moves focus into the mobile dialog, traps Tab, closes with Escape and restores the opener focus', async () => {
    const trigger = document.createElement('button');
    trigger.setAttribute('aria-label', 'Open sidebar trigger');
    document.body.appendChild(trigger);
    trigger.focus();

    const mobileChanges: boolean[] = [];
    component.mobileOpenChange.subscribe(value => mobileChanges.push(value));
    fixture.componentRef.setInput('mobileOpen', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const drawer = fixture.nativeElement.querySelector('aside[role="dialog"]') as HTMLElement;
    const closeButton = fixture.nativeElement.querySelector('button[aria-label="Fermer le menu"]') as HTMLButtonElement;
    const navigationLinks = Array.from(fixture.nativeElement.querySelectorAll('nav a')) as HTMLAnchorElement[];
    expect(document.activeElement).toBe(closeButton);

    const backwardTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    closeButton.dispatchEvent(backwardTab);
    expect(backwardTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(navigationLinks.at(-1));

    const forwardTab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    navigationLinks.at(-1)!.dispatchEvent(forwardTab);
    expect(forwardTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(closeButton);

    closeButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(mobileChanges).toEqual([false]);
    fixture.componentRef.setInput('mobileOpen', false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(trigger);
    expect(drawer.getAttribute('aria-modal')).toBeNull();
    trigger.remove();
  });

  it('closes the mobile dialog when the viewport reaches the desktop breakpoint', () => {
    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn(() => ({ matches: true }))
    });
    component.mobileOpen = true;
    const changes: boolean[] = [];
    component.mobileOpenChange.subscribe(value => changes.push(value));
    try {
      component.closeMobileDrawerAtDesktopWidth();
      expect(changes).toEqual([false]);
    } finally {
      if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
      else delete (window as Window & { matchMedia?: typeof window.matchMedia }).matchMedia;
    }
  });

  it('exposes an accessible mobile drawer, closes with Escape, and closes after navigation', async () => {
    component.mobileOpen = true;
    fixture.detectChanges();

    const drawer = fixture.nativeElement.querySelector('aside') as HTMLElement;
    expect(drawer.getAttribute('role')).toBe('dialog');
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    const mobileChanges: boolean[] = [];
    component.mobileOpenChange.subscribe(value => mobileChanges.push(value));

    drawer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(mobileChanges).toEqual([false]);

    const dashboardLink = fixture.nativeElement.querySelector('a[routerLink="/dashboard"]') as HTMLAnchorElement;
    dashboardLink.click();
    expect(mobileChanges).toEqual([false, false]);
  });
});
