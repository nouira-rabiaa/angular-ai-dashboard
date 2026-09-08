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
}