import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DashboardRange {
  from: string;
  to: string;
}

export interface DashboardMetrics {
  range: DashboardRange;
  requestCount: number;
  successCount: number;
  noMatchCount: number;
  errorCount: number;
  averageLatencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  pricedRequestCount: number;
  unpricedRequestCount: number;
  retrievedChunkCount: number;
}

export interface DashboardTimeseriesItem {
  date: string;
  requestCount: number;
  averageLatencyMs: number | null;
  estimatedCostUsd: number | null;
  pricedRequestCount: number;
  unpricedRequestCount: number;
}

export interface InferenceHistoryItem {
  traceId: string;
  timestamp: string;
  modelIdentifier: string | null;
  status: 'success' | 'no_match' | 'error';
  scope: 'document' | 'all';
  documentId: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  usageSource: 'provider' | 'unavailable';
  estimatedCostUsd: number | null;
  pricingModelId: string | null;
  pricingSource: string | null;
  totalDurationMs: number;
  retrievalDurationMs: number | null;
  contextPreparationDurationMs: number | null;
  groqDurationMs: number | null;
  retrievedChunkCount: number;
}

export interface InferenceStep {
  stepIndex: number;
  name: string;
  status: 'success' | 'no_match' | 'error';
  durationMs: number;
}

export interface InferenceDetail extends InferenceHistoryItem {
  steps: InferenceStep[];
}

export interface IndexedDocument {
  documentId: number;
  filename: string;
  fileType: string;
  status: string;
  createdAt: string;
  chunksCount: number;
  characterCount: number | null;
}

export interface FormSubmissionMetadata {
  id: number;
  createdAt: string;
  status: string;
}

export interface PagedResponse<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}

@Injectable({ providedIn: 'root' })
export class DashboardDataService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:3000/api/dashboard';

  getMetrics(range: DashboardRange): Observable<DashboardMetrics> {
    return this.http.get<DashboardMetrics>(`${this.baseUrl}/metrics`, { params: this.rangeParams(range) });
  }

  getTimeseries(range: DashboardRange): Observable<{ range: DashboardRange; items: DashboardTimeseriesItem[] }> {
    return this.http.get<{ range: DashboardRange; items: DashboardTimeseriesItem[] }>(
      `${this.baseUrl}/timeseries`, { params: this.rangeParams(range) }
    );
  }

  getInferences(options: DashboardRange & {
    limit: number;
    offset: number;
    status?: string;
    scope?: string;
  }): Observable<PagedResponse<InferenceHistoryItem> & { range: DashboardRange }> {
    let params = this.rangeParams(options).set('limit', options.limit).set('offset', options.offset);
    if (options.status) params = params.set('status', options.status);
    if (options.scope) params = params.set('scope', options.scope);
    return this.http.get<PagedResponse<InferenceHistoryItem> & { range: DashboardRange }>(
      `${this.baseUrl}/inferences`, { params }
    );
  }

  getInferenceDetail(traceId: string): Observable<InferenceDetail> {
    return this.http.get<InferenceDetail>(`${this.baseUrl}/inferences/${encodeURIComponent(traceId)}`);
  }

  getDocuments(limit: number, offset: number): Observable<PagedResponse<IndexedDocument> & { totalChunks: number }> {
    const params = new HttpParams().set('limit', limit).set('offset', offset);
    return this.http.get<PagedResponse<IndexedDocument> & { totalChunks: number }>(
      `${this.baseUrl}/documents`, { params }
    );
  }

  getFormSubmissions(limit: number, offset: number, query = ''): Observable<PagedResponse<FormSubmissionMetadata>> {
    let params = new HttpParams().set('limit', limit).set('offset', offset);
    if (query.trim()) params = params.set('q', query.trim());
    return this.http.get<PagedResponse<FormSubmissionMetadata>>(`${this.baseUrl}/form-submissions`, { params });
  }

  private rangeParams(range: DashboardRange): HttpParams {
    return new HttpParams().set('from', range.from).set('to', range.to);
  }
}
