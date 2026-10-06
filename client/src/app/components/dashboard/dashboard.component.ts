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
  confidenceScore?: number;
  chunksList?: string[];
  isReindexing?: boolean;
  tokensCount?: number;   // Nouveau : Nombre de tokens pour cette soumission
  estimatedCost?: number; // Nouveau : Coût estimé en $
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  
    // Signal pour la modale d'inspection des chunks
  selectedSubmissionForInspection = signal<Submission | null>(null);
  // ─── ÉTATS & SIGNALS POUR L'HISTORIQUE ET LE BFF ───
  submissions = signal<Submission[]>([]);
  loading = signal<boolean>(false);
  searchQuery = signal<string>('');

  // 🔍 Signaux pour la recherche dans le registre
  searchTerm = signal<string>('');

  // Signal filtré basé sur la recherche
  filteredSubmissions = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const subs = this.submissions();
    if (!term) return subs;

    return subs.filter(sub => 
      String(sub.id).toLowerCase().includes(term) ||
      (sub.title && sub.title.toLowerCase().includes(term)) ||
      (sub.createdAt && sub.createdAt.toLowerCase().includes(term)) ||
      (sub.created_at && sub.created_at.toLowerCase().includes(term))
    );
  });

  // Gestionnaire de l'input de recherche
  onSearchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
  }

  // Service d'erreur simulé / géré localement (ou via ton ErrorService global si tu l'injectes)
  errorService = {
    currentError: signal<string | null>(null),
    clearError: () => this.errorService.currentError.set(null),
    setError: (msg: string) => this.errorService.currentError.set(msg)
  };

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
            status: 'completed',
            confidenceScore: 0.92,
            tokensCount: 1240,
            estimatedCost: 0.0037,
            chunksList: [
              "Chunk #1 (Score: 0.95): Enterprise RAG pipelines require secure SQLite logging and low latency vector lookups.",
              "Chunk #2 (Score: 0.89): Budget allocations for AI integrations typically range between 50k and 100k for mid-size SAS companies."
            ]
          },
          {
            id: 103,
            type: 'pdf',
            title: 'Architecture_Securite_Cloud_2026.pdf',
            chunks_count: 24,
            createdAt: '2026-10-05 16:42:10',
            status: 'Indexed',
            confidenceScore: 0.96,
            tokensCount: 3450,
            estimatedCost: 0.0103,
            chunksList: [
              "Chunk #12 (Score: 0.98): All cloud communications must enforce TLS 1.3 encryption by default.",
              "Chunk #15 (Score: 0.94): Vector database access is restricted via internal BFF proxy authentication tokens."
            ]
          },
          {
            id: 102,
            type: 'form',
            title: '{\n  "projectName": "GenUI Dashboard",\n  "framework": "Angular 19 / Tailwind v4"\n}',
            createdAt: '2026-10-04 09:30:22',
            status: 'completed',
            confidenceScore: 0.58,
            tokensCount: 520,
            estimatedCost: 0.0015,
            chunksList: [
              "Chunk #3 (Score: 0.58): Legacy frontend components running on older Angular versions without signals support."
            ]
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

  openChunkInspector(sub: Submission): void {
    this.selectedSubmissionForInspection.set(sub);
  }

  closeChunkInspector(): void {
    this.selectedSubmissionForInspection.set(null);
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
// Déclencher la ré-indexation à la volée (Appel BFF / Worker)
  triggerReindex(sub: Submission): void {
    // 1. Activer l'état de chargement sur la soumission ciblée
    this.submissions.update(list => 
      list.map(item => item.id === sub.id ? { ...item, isReindexing: true } : item)
    );

    // 2. Simulation d'un appel réseau asynchrone vers le BFF Node.js (ex: 2 secondes)
    setTimeout(() => {
      this.submissions.update(list => 
        list.map(item => {
          if (item.id === sub.id) {
            return {
              ...item,
              isReindexing: false,
              status: 'Indexed (Updated)',
              confidenceScore: Math.min(0.99, (item.confidenceScore || 0.5) + 0.15) // Améliore le score après ré-indexation
            };
          }
          return item;
        })
      );
      console.log(`Re-indexation réussie pour la soumission #${sub.id}`);
    }, 2000);
  }
}