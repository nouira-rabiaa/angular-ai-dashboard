import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

// Interface pour typer tes soumissions/logs
export interface Submission {
  id: number | string;
  type?: string;
  title: string;
  createdAt?: string;
  created_at?: string;
  chunks_count?: number;
  status?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  
  // ─── ÉTATS & SIGNALS POUR L'HISTORIQUE ET LE BFF ───
  submissions = signal<Submission[]>([]);
  loading = signal<boolean>(false);
  searchQuery = signal<string>('');

  // Service d'erreur simulé / géré localement (ou via ton ErrorService global si tu l'injectes)
  errorService = {
    currentError: signal<string | null>(null),
    clearError: () => this.errorService.currentError.set(null),
    setError: (msg: string) => this.errorService.currentError.set(msg)
  };

  // ─── COMPUTED POUR LA RECHERCHE EN TEMPS RÉEL ───
  filteredSubmissions = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const list = this.submissions();
    
    if (!query) return list;

    return list.filter(sub => {
      const idMatch = String(sub.id).toLowerCase().includes(query);
      const titleMatch = String(sub.title || '').toLowerCase().includes(query);
      const typeMatch = String(sub.type || '').toLowerCase().includes(query);
      const dateMatch = String(sub.createdAt || sub.created_at || '').toLowerCase().includes(query);
      
      return idMatch || titleMatch || typeMatch || dateMatch;
    });
  });

  ngOnInit(): void {
    this.loadSubmissions();
  }

  // ─── CHARGEMENT DES DONNÉES (BFF / SQLite) ───
  loadSubmissions(): void {
    this.loading.set(true);
    this.errorService.clearError();

    // Simulation d'appel API vers ton BFF Node.js / SQLite (Remplace par ton service réel si tu en as un)
    setTimeout(() => {
      try {
        // Exemples de données mockées robustes connectées à ton architecture
        const mockData: Submission[] = [
          {
            id: 104,
            type: 'form',
            title: '{\n  "companyName": "TechCorp SAS",\n  "budget": "50000-100000",\n  "useCase": "RAG Enterprise Pipeline"\n}',
            createdAt: '2026-10-06 10:15:00',
            status: 'completed'
          },
          {
            id: 103,
            type: 'pdf',
            title: 'Architecture_Securite_Cloud_2026.pdf',
            chunks_count: 24,
            createdAt: '2026-10-05 16:42:10',
            status: 'Indexed'
          },
          {
            id: 102,
            type: 'form',
            title: '{\n  "projectName": "GenUI Dashboard",\n  "framework": "Angular 19 / Tailwind v4"\n}',
            createdAt: '2026-10-04 09:30:22',
            status: 'completed'
          }
        ];
        
        this.submissions.set(mockData);
        this.loading.set(false);
      } catch (err) {
        this.errorService.setError('Impossible de charger l’historique depuis le serveur SQLite.');
        this.loading.set(false);
      }
    }, 400);
  }

  // ─── GESTION DE LA RECHERCHE ───
  onSearchInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.searchQuery.set(inputElement.value);
  }

  // ─── EXPORT CSV ───
  exportToCSV(): void {
    const data = this.filteredSubmissions();
    if (data.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,ID,Type,Date,Contenu/Titre\r\n";
    
    data.forEach(sub => {
      const row = [
        sub.id,
        sub.type || 'form',
        sub.createdAt || sub.created_at || '',
        `"${(sub.title || '').replace(/"/g, '""')}"`
      ];
      csvContent += row.join(",") + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `historique_soumissions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  // Permet de faire un scroll fluide vers le registre des soumissions
  scrollToRegistre(): void {
    window.scrollTo({ top: 500, behavior: 'smooth' });
  }
}