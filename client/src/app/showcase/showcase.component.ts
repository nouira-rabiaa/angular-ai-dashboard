import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { UiLanguageService } from '../i18n/ui-language.service';
@Component({selector:'app-root',standalone:true,imports:[RouterOutlet,RouterLink,RouterLinkActive,TranslocoPipe],template:`
  <a class="skip" href="#showcase-content">{{ 'showcase.skip' | transloco }}</a>
  <header class="public-header">
    <a class="brand" routerLink="/" (click)="menuOpen.set(false)"><span class="brand-icon" aria-hidden="true">◇</span><span>Enterprise AI Dashboard<small>& Support Agent Studio</small></span></a>
    <button type="button" class="menu" aria-controls="public-navigation" [attr.aria-expanded]="menuOpen()" (click)="menuOpen.set(!menuOpen())">{{ 'showcase.menu' | transloco }}</button>
    <nav id="public-navigation" [class.open]="menuOpen()" [attr.aria-label]="'showcase.nav' | transloco" (keydown.escape)="closeMenu(menuButton)" #menuButton>
      <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}" ariaCurrentWhenActive="page" (click)="menuOpen.set(false)">{{ 'showcase.home' | transloco }}</a>
      <a routerLink="/features" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="menuOpen.set(false)">{{ 'showcase.capabilities' | transloco }}</a>
      <a routerLink="/" fragment="scope" (click)="menuOpen.set(false)">{{ 'showcase.scope' | transloco }}</a>
      <a routerLink="/guided-demo" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="menuOpen.set(false)">{{ 'nav.guidedDemo' | transloco }}</a>
      <a routerLink="/architecture" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="menuOpen.set(false)">{{ 'nav.architecture' | transloco }}</a>
    </nav>
    <div class="languages" role="group" [attr.aria-label]="'showcase.language' | transloco" [attr.aria-busy]="languages.loading()">
      <button type="button" [attr.aria-pressed]="languages.language()==='fr'" (click)="languages.use('fr')">FR</button>
      <button type="button" [attr.aria-pressed]="languages.language()==='en'" (click)="languages.use('en')">EN</button>
    </div>
  </header>
  @if(languages.loadFailed()){<p role="alert">{{ 'showcase.error' | transloco }}</p>}
  <main class="public-main" id="showcase-content" tabindex="-1"><router-outlet /></main>
  <footer class="public-footer">{{ 'showcase.footer' | transloco }}</footer>
`})
export class ShowcaseComponent {
  readonly languages=inject(UiLanguageService);
  readonly menuOpen=signal(false);
  closeMenu(nav: HTMLElement) { this.menuOpen.set(false); (nav.previousElementSibling as HTMLElement)?.focus(); }
}
