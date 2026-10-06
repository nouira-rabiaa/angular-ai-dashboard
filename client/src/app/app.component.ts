import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './layout/sidebar.component';


@Component({
  selector: 'app-root',
  standalone: true,
 imports: [CommonModule, RouterOutlet, SidebarComponent],
  template: `
    <div class="min-h-screen bg-slate-50 flex">
      <!-- 🗂️ Menu Latéral -->
      <app-sidebar></app-sidebar>

      <!-- 🖥️ Zone de Contenu Principal -->
      <div class="flex-1 flex flex-col min-w-0">
        <header class="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
          <h1 class="text-sm font-medium text-slate-600">Espace Professionnel - Angular 19 & Node.js</h1>
          <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            ● Connecté au Backend
          </span>
        </header>

        <main class="flex-1 p-6 overflow-y-auto">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `
})export class AppComponent {}