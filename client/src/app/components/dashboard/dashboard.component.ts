import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  submissions = signal<any[]>([]);
  loading = signal<boolean>(true);
  
  // 🔍 Signal pour la recherche
  searchQuery = signal<string>('');

  // ⚡ Signal calculé qui filtre automatiquement les soumissions
  filteredSubmissions = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const list = this.submissions();
    if (!query) return list;

    return list.filter(sub => {
      const idMatch = sub.id.toString().includes(query);
      const dateMatch = sub.createdAt?.toLowerCase().includes(query);
      const dataMatch = JSON.stringify(sub.data).toLowerCase().includes(query);
      return idMatch || dateMatch || dataMatch;
    });
  });

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loadSubmissions();
  }

  loadSubmissions() {
    this.loading.set(true);
    this.apiService.getSubmissions().subscribe({
      next: (data: any[]) => {
        this.submissions.set(data);
        this.loading.set(false);
      },
      error: (err: any) => {
        console.error('Erreur lors du chargement des soumissions', err);
        this.loading.set(false);
      }
    });
  }

  // Mettre à jour la recherche depuis l'input
  onSearchInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
  }

  // 📥 Export CSV basé sur les résultats filtrés
  exportToCSV() {
    const data = this.filteredSubmissions();
    if (data.length === 0) return;

    const csvRows = [];
    const headers = ['ID', 'Date_Creation', 'Donnees_JSON'];
    csvRows.push(headers.join(','));

    for (const sub of data) {
      const jsonString = JSON.stringify(sub.data).replace(/"/g, '""');
      const row = [sub.id, `"${sub.createdAt}"`, `"${jsonString}"`];
      csvRows.push(row.join(','));
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `soumissions_filtrees_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}