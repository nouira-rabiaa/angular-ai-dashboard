import { Component, OnInit, signal } from '@angular/core';
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
  // 📥 Fonction d'export CSV
  exportToCSV() {
    const data = this.submissions();
    if (data.length === 0) return;

    // Extraire les en-têtes (ID, Date, et clés dynamiques du JSON)
    const csvRows = [];
    
    // En-têtes fixes + on peut rajouter un résumé du payload JSON
    const headers = ['ID', 'Date_Creation', 'Donnees_JSON'];
    csvRows.push(headers.join(','));

    // Remplir les lignes
    for (const sub of data) {
      // Nettoyer les guillemets pour ne pas casser le format CSV
      const jsonString = JSON.stringify(sub.data).replace(/"/g, '""');
      const row = [sub.id, `"${sub.createdAt}"`, `"${jsonString}"`];
      csvRows.push(row.join(','));
    }

    // Créer le fichier virtuel et lancer le téléchargement
    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `soumissions_formulaires_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
