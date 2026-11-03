import { TranslocoPipe } from '@jsverse/transloco';
import { UiLanguageService } from '../../i18n/ui-language.service';
import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideCircleDollarSign, LucideChartNoAxesCombined } from '@lucide/angular';
import { Subject, takeUntil } from 'rxjs';
import { BudgetStatus, FinopsService, FinopsSummary, SimulationInput, SimulationResult } from '../../services/finops.service';

@Component({
  selector: 'app-finops', standalone: true, imports: [TranslocoPipe, CommonModule, FormsModule, LucideCircleDollarSign, LucideChartNoAxesCombined],
  templateUrl: './finops.component.html',
  styleUrl: './finops.component.scss'
})
export class FinopsComponent implements OnInit, OnDestroy {
  readonly ui = inject(UiLanguageService);
  private readonly api = inject(FinopsService);
  private readonly destroyed = new Subject<void>();
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly summary = signal<FinopsSummary | null>(null);
  readonly simulation = signal<SimulationResult | null>(null);
  readonly simulationState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly saving = signal(false);
  readonly budgetMessage = signal('');
  budget: number | null = null;
  scenario: SimulationInput = { model: '', requestsPerDay: 100, inputTokens: 1000, outputTokens: 300, monthlyBudgetUsd: null };
  readonly chart = computed(() => {
    const data = this.summary();
    const points = [...(data?.historical ?? []), ...(data?.projected ?? [])];
    const maximum = Math.max(0, ...points.map(point => point.estimatedCostUsd ?? 0));
    return points.map((point, index) => ({ ...point, projected: index >= (data?.historical.length ?? 0),
      x: 30 + index * 560 / Math.max(1, points.length - 1),
      y: point.estimatedCostUsd === null ? null : 155 - (maximum > 0 ? point.estimatedCostUsd / maximum * 120 : 0) }));
  });
  ngOnInit() { this.load(); }
  ngOnDestroy() { this.destroyed.next(); this.destroyed.complete(); }
  load() {
    this.state.set('loading');
    this.api.getSummary().pipe(takeUntil(this.destroyed)).subscribe({
      next: data => {
        this.summary.set(data); this.budget = data.monthlyBudgetUsd;
        if (!this.scenario.model) this.scenario.model = data.pricing[0]?.model ?? '';
        this.state.set('ready');
      }, error: () => this.state.set('error')
    });
  }
  saveBudget() {
    this.saving.set(true); this.budgetMessage.set('');
    this.api.saveBudget(this.budget).pipe(takeUntil(this.destroyed)).subscribe({
      next: () => { this.saving.set(false); this.budgetMessage.set('finops.budget_enregistre_2'); this.load(); },
      error: () => { this.saving.set(false); this.budgetMessage.set('finops.budget_non_enregistre_verifiez_le_montant_et'); }
    });
  }
  simulate() {
    this.simulation.set(null); this.simulationState.set('loading');
    this.api.simulate({ ...this.scenario }).pipe(takeUntil(this.destroyed)).subscribe({
      next: result => { this.simulation.set(result); this.simulationState.set('ready'); },
      error: () => this.simulationState.set('error')
    });
  }
  cost(value: number | null | undefined, decimals = 8) { return this.ui.currency(value, 'USD', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
  alert(status: BudgetStatus) {
    switch (status.level) {
      case 'exceeded': return this.ui.text('finops.alerte_100_budget_atteint_ou_depasse');
      case 'warning': return this.ui.text('finops.alerte_80_seuil_de_vigilance_atteint');
      case 'ok': return this.ui.text('finops.sous_le_seuil_de_80');
      default: return this.ui.text('finops.evaluation_indisponible');
    }
  }
  progress(status: BudgetStatus) { return Math.max(0, Math.min(100, status.percent ?? (status.level === 'exceeded' ? 100 : 0))); }
  // Separate segments around missing values: never draw a line through unavailable costs.
  segments(projected: boolean): string[] {
    const result: string[] = []; let current: string[] = [];
    for (const point of this.chart()) {
      if (point.projected !== projected || point.y === null) {
        if (current.length) result.push(current.join(' ')); current = [];
      } else current.push(`${point.x},${point.y}`);
    }
    if (current.length) result.push(current.join(' '));
    return result;
  }
}
