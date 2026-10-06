import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <aside 
      [class.w-64]="isOpen()" 
      [class.w-20]="!isOpen()"
      class="bg-slate-900 text-slate-300 h-screen transition-all duration-300 flex flex-col justify-between border-r border-slate-800 shadow-2xl sticky top-0">
      
      <div class="overflow-y-auto flex-1 overflow-x-hidden">
        
        <!-- ⚡ En-tête Pro -->
        <div class="h-16 flex items-center justify-between px-4 border-b border-slate-800">
          @if (isOpen()) {
            <div class="flex items-center space-x-3">
              <span class="text-xl">⚡</span>
              <span class="text-white font-semibold text-sm tracking-wide">Data & AI Workspace</span>
            </div>
          } @else {
            <span class="text-xl mx-auto">⚡</span>
          }
        </div>

        <!-- 📂 Catégories du Menu -->
        <div class="p-4 space-y-6">
          
          <!-- SECTION 1 : PRINCIPAL -->
          <div>
            @if (isOpen()) {
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">Principal</p>
            }
            <div class="space-y-1">
              <a routerLink="/dashboard" 
                 routerLinkActive="bg-indigo-600 text-white font-semibold shadow-md"
                 class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800 transition text-sm">
                <span class="text-lg">📊</span>
                @if (isOpen()) { <span>Dashboard BDD</span> }
              </a>
              <a routerLink="/generator" 
                 routerLinkActive="bg-indigo-600 text-white font-semibold shadow-md" 
                 [routerLinkActiveOptions]="{exact: true}"
                 class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800 transition text-sm">
                <span class="text-lg">✨</span>
                @if (isOpen()) { <span>Générateur IA</span> }
              </a>
            </div>
          </div>

          <!-- SECTION 2 : MOTEUR RAG & DOCUMENTS -->
          <div>
            @if (isOpen()) {
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">Moteur RAG</p>
            }
            <div class="space-y-1">
              <a routerLink="/rag/documents" 
                 routerLinkActive="bg-indigo-600 text-white font-semibold shadow-md"
                 class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800 transition text-sm">
                <span class="text-lg">📂</span>
                @if (isOpen()) { <span>Documents & Ingestion</span> }
              </a>
              <a routerLink="/rag/vectorstore" 
                 routerLinkActive="bg-indigo-600 text-white font-semibold shadow-md"
                 class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800 transition text-sm">
                <span class="text-lg">🧠</span>
                @if (isOpen()) { <span>Base Vectorielle</span> }
              </a>
            </div>
          </div>

          <!-- SECTION 3 : SYSTÈMES & MONITORING -->
          <div>
            @if (isOpen()) {
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">Système</p>
            }
            <div class="space-y-1">
              <a routerLink="/system/logs" 
                 routerLinkActive="bg-indigo-600 text-white font-semibold shadow-md"
                 class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800 transition text-sm">
                <span class="text-lg">🛡️</span>
                @if (isOpen()) { <span>Logs & Erreurs</span> }
              </a>
            </div>
          </div>

        </div>
      </div>

      <!-- 🎛️ Bouton de réduction / expansion en bas -->
      <div class="p-4 border-t border-slate-800">
        <button 
          (click)="toggle()" 
          class="w-full flex items-center justify-center py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-sm font-medium shadow-sm">
          <span>{{ isOpen() ? '◀ Réduire' : '▶' }}</span>
        </button>
      </div>
    </aside>
  `
})
export class SidebarComponent {
  isOpen = signal<boolean>(true);

  toggle() {
    this.isOpen.update(val => !val);
  }
}