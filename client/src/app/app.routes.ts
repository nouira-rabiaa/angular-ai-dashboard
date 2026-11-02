import { Routes } from '@angular/router';


export const routes: Routes = [
  { path: '', redirectTo: 'generator', pathMatch: 'full' },
  {
    path: 'generator',
    loadComponent: () => import('./components/chat/chat.component')
      .then(module => module.ChatComponent),
    title: 'IA Form Generator'
  },
  {
    path: 'guided-demo',
    loadComponent: () => import('./components/guided-demo/guided-demo.component')
      .then(module => module.GuidedDemoComponent),
    title: 'Guided Demo'
  },
  {
    path: 'agent-workspace',
    loadComponent: () => import('./components/agent-workspace/agent-workspace.component')
      .then(module => module.AgentWorkspaceComponent),
    title: 'Agent Workspace'
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./components/dashboard/dashboard.component')
      .then(module => module.DashboardComponent),
    title: 'Dashboard BDD'
  },
  {
    path: 'architecture',
    loadComponent: () => import('./components/architecture-explorer/architecture-explorer.component')
      .then(module => module.ArchitectureExplorerComponent),
    title: 'Architecture Explorer'
  },
  { path: '**', redirectTo: 'generator' }
];