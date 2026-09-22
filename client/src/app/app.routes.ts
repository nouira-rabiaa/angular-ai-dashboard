import { Routes } from '@angular/router';
import { ChatComponent } from './components/chat/chat.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';

export const routes: Routes = [
  { path: '', redirectTo: 'generator', pathMatch: 'full' },
  { path: 'generator', component: ChatComponent, title: 'IA Form Generator' },
  { path: 'dashboard', component: DashboardComponent, title: 'Dashboard & Historique' },
  { path: '**', redirectTo: 'generator' }
];