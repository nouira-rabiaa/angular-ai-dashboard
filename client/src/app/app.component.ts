import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './layout/navbar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent],
  template: `
    <div class="min-h-screen bg-slate-50 flex flex-col font-sans">
      <app-navbar />
      <main class="flex-1 max-w-7xl w-full mx-auto p-6">
        <router-outlet />
      </main>
    </div>
  `
})export class AppComponent {}