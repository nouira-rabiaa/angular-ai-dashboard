import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AiDashboardService {
  isLoading = signal<boolean>(false);

  constructor(private http: HttpClient) {}

  queryRagPipeline(query: string): Observable<any> {
    return this.http.post('/api/rag/query', { query });
  }
}