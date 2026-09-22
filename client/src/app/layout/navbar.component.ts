import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <nav class="bg-slate-900 border-b border-slate-800 shadow-md">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <span class="text-2xl">⚡</span>
          <span class="text-white font-bold text-lg tracking-wide">AI Form Engine</span>
        </div>
        <div class="flex space-x-4">
          <a routerLink="/generator" 
             routerLinkActive="bg-indigo-600 text-white" 
             [routerLinkActiveOptions]="{exact: true}"
             class="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition">
            ✨ Générateur IA
          </a>
          <a routerLink="/dashboard" 
             routerLinkActive="bg-indigo-600 text-white"
             class="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition">
            📊 Dashboard BDD
          </a>
        </div>
      </div>
    </nav>
  `
})
export class NavbarComponent {}