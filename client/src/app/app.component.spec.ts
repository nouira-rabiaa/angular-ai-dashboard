import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AppComponent } from './app.component';
import { routes } from './app.routes';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('opens the accessible mobile drawer and does not claim an unverified backend connection', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Connecté au Backend');
    expect(fixture.nativeElement.textContent).toContain('Enterprise AI Dashboard');
    expect(fixture.nativeElement.textContent).toContain('AI Operations & FinOps Platform');
    expect(fixture.nativeElement.textContent).not.toContain('AI Control Center');
    const openButton = fixture.nativeElement.querySelector('button[aria-label="Ouvrir le menu de navigation"]') as HTMLButtonElement;
    expect(openButton.getAttribute('aria-expanded')).toBe('false');
    openButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('aside[role="dialog"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('button[aria-label="Fermer la navigation"]')).not.toBeNull();
  });

  it('uses a high-contrast color for the shared header subtitle', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const paragraphs = Array.from(fixture.nativeElement.querySelectorAll('header p')) as HTMLParagraphElement[];
    const subtitle = paragraphs.find(paragraph => paragraph.textContent?.includes('AI Operations & FinOps Platform'));
    expect(subtitle).toBeDefined();
    expect(subtitle!.classList.contains('text-slate-600')).toBe(true);
  });

  it('navigates to the lazy Architecture Explorer route and highlights its sidebar link', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/architecture');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/architecture');
    expect(fixture.nativeElement.textContent).toContain('Explorez les flux réels du système');
    expect(fixture.nativeElement.querySelectorAll('main')).toHaveLength(1);
    const architectureLink = fixture.nativeElement.querySelector('a[routerLink="/architecture"]') as HTMLAnchorElement;
    expect(architectureLink.getAttribute('aria-current')).toBe('page');
  });

  it('lazy-loads Guided Demo without triggering network requests and preserves existing routes', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    const http = TestBed.inject(HttpTestingController);
    await router.navigateByUrl('/guided-demo');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/guided-demo');
    expect(fixture.nativeElement.textContent).toContain('Une IA utile, avec de la visibilité');
    expect(fixture.nativeElement.querySelectorAll('main')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('a[routerLink="/guided-demo"]')?.getAttribute('aria-current')).toBe('page');
    http.expectNone(() => true);
  });

  it('exits Guided Demo to the existing Generator route', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/guided-demo');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const generatorLinks = Array.from(fixture.nativeElement.querySelectorAll('a[routerLink="/generator"]')) as HTMLAnchorElement[];
    const exitLink = generatorLinks.find(link => link.textContent?.includes('Quitter la démo'));
    expect(exitLink).toBeDefined();
    exitLink!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/generator');
    expect(fixture.nativeElement.textContent).toContain('Commencez par envoyer un prompt');
  });
});