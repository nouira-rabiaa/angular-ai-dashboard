import { FinopsComponent } from '../finops/finops.component';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import {
  LucideArrowDownToLine,
  LucideCalendarDays,
  LucideChartNoAxesCombined,
  LucideChevronLeft,
  LucideChevronRight,
  LucideCircleCheck,
  LucideCircleDollarSign,
  LucideDatabase,
  LucideFileClock,
  LucideFileText,
  LucideLayers,
  LucideSearch,
  LucideSparkles,
  LucideTimer
} from '@lucide/angular';
import {
  DashboardDataService,
  DashboardMetrics,
  DashboardTimeseriesItem,
  FormSubmissionMetadata,
  IndexedDocument,
  InferenceDetail,
  InferenceHistoryItem
} from '../../services/dashboard-data.service';

type DashboardView = 'overview' | 'inferences' | 'documents' | 'forms';
type LoadState = 'loading' | 'ready' | 'error';

export interface CiStatus {
  status: 'success' | 'failure' | 'running' | 'unknown';
  message: string;
  runNumber?: number;
  branch?: string;
  loading: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, FinopsComponent,
    LucideArrowDownToLine, LucideCalendarDays,
    LucideChartNoAxesCombined, LucideChevronLeft, LucideChevronRight,
    LucideCircleCheck, LucideCircleDollarSign, LucideDatabase,
    LucideFileClock, LucideFileText, LucideLayers, LucideSearch, LucideSparkles,
    LucideTimer
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private readonly dashboardData = inject(DashboardDataService);
  private readonly http = inject(HttpClient);

  readonly pageSize = 25;
  readonly views: { id: DashboardView; label: string }[] = [
    { id: 'overview', label: 'Vue d’ensemble' },
    { id: 'inferences', label: 'Historique IA' },
    { id: 'documents', label: 'Documents' },
    { id: 'forms', label: 'Soumissions' }
  ];

  activeView = signal<DashboardView>('overview');
  dateRange = signal(this.defaultRange());
  metrics = signal<DashboardMetrics | null>(null);
  timeseries = signal<DashboardTimeseriesItem[]>([]);
  timeseriesState = signal<LoadState>('loading');
  inferenceItems = signal<InferenceHistoryItem[]>([]);
  inferenceTotal = signal(0);
  inferenceOffset = signal(0);
  inferenceStatus = signal('');
  inferenceScope = signal('');
  selectedTrace = signal<InferenceDetail | null>(null);
  inferenceState = signal<LoadState>('loading');
  documents = signal<IndexedDocument[]>([]);
  documentTotal = signal(0);
  documentChunksTotal = signal(0);
  documentOffset = signal(0);
  documentState = signal<LoadState>('loading');
  submissions = signal<FormSubmissionMetadata[]>([]);
  submissionTotal = signal(0);
  submissionOffset = signal(0);
  submissionSearch = signal('');
  submissionState = signal<LoadState>('loading');
  overviewState = signal<LoadState>('loading');
  errorMessage = signal('');
  ciStatus = signal<CiStatus>({ status: 'unknown', message: 'Status unavailable', loading: true });

  ngOnInit(): void {
    this.loadOverview();
    this.loadInferences();
    this.loadDocuments();
    this.loadSubmissions();
    this.fetchCiStatus();
  }

  selectView(view: DashboardView): void {
    this.activeView.set(view);
  }

  setDateRange(from: string, to: string): void {
    this.dateRange.set({ from, to });
    this.loadOverview();
    this.inferenceOffset.set(0);
    this.loadInferences();
  }

  loadOverview(): void {
    const range = this.dateRange();
    this.overviewState.set('loading');
    this.dashboardData.getMetrics(range).subscribe({
      next: metrics => {
        this.metrics.set(metrics);
        this.overviewState.set('ready');
      },
      error: () => this.overviewState.set('error')
    });
    this.dashboardData.getTimeseries(range).subscribe({
      next: response => {
        this.timeseries.set(response.items);
        this.timeseriesState.set('ready');
      },
      error: () => this.timeseriesState.set('error')
    });
  }

  loadInferences(): void {
    this.inferenceState.set('loading');
    this.dashboardData.getInferences({
      ...this.dateRange(),
      limit: this.pageSize,
      offset: this.inferenceOffset(),
      status: this.inferenceStatus(),
      scope: this.inferenceScope()
    }).subscribe({
      next: response => {
        this.inferenceItems.set(response.items);
        this.inferenceTotal.set(response.total);
        this.inferenceState.set('ready');
      },
      error: () => this.inferenceState.set('error')
    });
  }

  loadDocuments(): void {
    this.documentState.set('loading');
    this.dashboardData.getDocuments(this.pageSize, this.documentOffset()).subscribe({
      next: response => {
        this.documents.set(response.items);
        this.documentTotal.set(response.total);
        this.documentChunksTotal.set(response.totalChunks);
        this.documentState.set('ready');
      },
      error: () => this.documentState.set('error')
    });
  }

  loadSubmissions(): void {
    this.submissionState.set('loading');
    this.dashboardData.getFormSubmissions(this.pageSize, this.submissionOffset(), this.submissionSearch()).subscribe({
      next: response => {
        this.submissions.set(response.items);
        this.submissionTotal.set(response.total);
        this.submissionState.set('ready');
      },
      error: () => this.submissionState.set('error')
    });
  }

  applyInferenceFilters(): void {
    this.inferenceOffset.set(0);
    this.loadInferences();
  }

  applySubmissionSearch(value: string): void {
    this.submissionSearch.set(value);
    this.submissionOffset.set(0);
    this.loadSubmissions();
  }

  pageInferences(direction: -1 | 1): void {
    const next = this.inferenceOffset() + direction * this.pageSize;
    if (next < 0 || next >= this.inferenceTotal()) return;
    this.inferenceOffset.set(next);
    this.loadInferences();
  }

  pageDocuments(direction: -1 | 1): void {
    const next = this.documentOffset() + direction * this.pageSize;
    if (next < 0 || next >= this.documentTotal()) return;
    this.documentOffset.set(next);
    this.loadDocuments();
  }

  pageSubmissions(direction: -1 | 1): void {
    const next = this.submissionOffset() + direction * this.pageSize;
    if (next < 0 || next >= this.submissionTotal()) return;
    this.submissionOffset.set(next);
    this.loadSubmissions();
  }

  openTrace(item: InferenceHistoryItem): void {
    this.selectedTrace.set(null);
    this.dashboardData.getInferenceDetail(item.traceId).subscribe({
      next: trace => this.selectedTrace.set(trace),
      error: () => this.errorMessage.set('Unable to load execution detail.')
    });
  }

  closeTrace(): void {
    this.selectedTrace.set(null);
  }

  exportSubmissionsMetadata(): void {
    const rows = this.submissions().map(item => [item.id, item.createdAt, item.status]);
    if (!rows.length) return;
    const csv = ['ID,Date,Status', ...rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))].join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `form-submission-metadata-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  fetchCiStatus(): void {
    this.http.get<any>('https://api.github.com/repos/nouira-rabiaa/angular-ai-dashboard/actions/runs?per_page=1').subscribe({
      next: data => {
        const run = data.workflow_runs?.[0];
        if (!run) {
          this.ciStatus.set({ status: 'unknown', message: 'No workflow run available', loading: false });
          return;
        }
        const status: CiStatus['status'] = run.status === 'in_progress'
          ? 'running'
          : run.conclusion === 'success'
            ? 'success'
            : run.conclusion === 'failure' || run.conclusion === 'cancelled'
              ? 'failure'
              : 'unknown';
        this.ciStatus.set({
          status,
          message: status === 'success' ? 'Workflow succeeded' : status === 'failure' ? 'Workflow failed' : status === 'running' ? 'Workflow running' : 'Workflow status unavailable',
          runNumber: run.run_number,
          branch: run.head_branch,
          loading: false
        });
      },
      error: () => this.ciStatus.set({ status: 'unknown', message: 'GitHub Actions unavailable', loading: false })
    });
  }

  githubActionsUrl(): string {
    return 'https://github.com/nouira-rabiaa/angular-ai-dashboard/actions';
  }

  formatCost(value: number | null, decimals = 8): string {
    return value === null ? 'Not available' : `$${value.toFixed(decimals)} USD`;
  }

  formatTokens(value: number | null): string {
    return value === null ? 'Not available' : value.toLocaleString();
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  chartHeight(value: number | null, series: DashboardTimeseriesItem[]): number {
    if (value === null || !series.length) return 0;
    const values = series.map(item => item.averageLatencyMs).filter((item): item is number => item !== null);
    const maximum = Math.max(...values);
    return maximum > 0 ? Math.max(8, (value / maximum) * 100) : 0;
  }

  chartPosition(index: number, count: number): number {
    return count < 2 ? 50 : 8 + (index * 84) / (count - 1);
  }

  chartXLabel(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }

  latencyChartPoints(series: DashboardTimeseriesItem[]): string {
    return series.map((point, index) => {
      const x = this.chartPosition(index, series.length) * 5.92;
      const y = 180 - this.chartHeight(point.averageLatencyMs, series) * 1.35;
      return `${x},${y}`;
    }).join(' ');
  }

  latencyChartArea(series: DashboardTimeseriesItem[]): string {
    return series.length ? `24,190 ${this.latencyChartPoints(series)} 616,190` : '';
  }

  totalRequests(series: DashboardTimeseriesItem[]): number {
    return series.reduce((sum, item) => sum + item.requestCount, 0);
  }

  totalPricedRequests(series: DashboardTimeseriesItem[]): number {
    return series.reduce((sum, item) => sum + item.pricedRequestCount, 0);
  }

  inferencePageLabel(): string {
    return this.pageLabel(this.inferenceOffset(), this.inferenceItems().length, this.inferenceTotal());
  }

  documentPageLabel(): string {
    return this.pageLabel(this.documentOffset(), this.documents().length, this.documentTotal());
  }

  submissionPageLabel(): string {
    return this.pageLabel(this.submissionOffset(), this.submissions().length, this.submissionTotal());
  }

  private pageLabel(offset: number, count: number, total: number): string {
    return total === 0 ? '0 items' : `${offset + 1}-${offset + count} of ${total}`;
  }

  private defaultRange(): { from: string; to: string } {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 29);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }
}