import { ApplicationConfig, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, Router, Routes, withInMemoryScrolling } from '@angular/router';
import { provideUiI18n } from '../i18n/ui-i18n.providers';
import { UiLanguageService } from '../i18n/ui-language.service';
import { PUBLIC_PRESENTATION } from '../presentation-mode';
import { ShowcaseHomeComponent } from './showcase-home.component';

// This entry point deliberately provides neither HttpClient nor business routes.
export const showcaseRoutes: Routes = [
  { path: '', pathMatch: 'full', component: ShowcaseHomeComponent },
  { path: 'features', loadComponent: () => import('./showcase-features.component').then(m => m.ShowcaseFeaturesComponent) },
  { path: 'guided-demo', loadComponent: () => import('../components/guided-demo/guided-demo.component').then(m => m.GuidedDemoComponent) },
  { path: 'architecture', loadComponent: () => import('../components/architecture-explorer/architecture-explorer.component').then(m => m.ArchitectureExplorerComponent) },
  { path: '**', redirectTo: () => inject(Router).parseUrl('/') }
];
export const showcaseConfig: ApplicationConfig = { providers: [
  { provide: PUBLIC_PRESENTATION, useValue: true }, ...provideUiI18n(), provideAppInitializer(() => inject(UiLanguageService).ready),
  provideZoneChangeDetection({ eventCoalescing: true }), provideRouter(showcaseRoutes, withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }))
] };
