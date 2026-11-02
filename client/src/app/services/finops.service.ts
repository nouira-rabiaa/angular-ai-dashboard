import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface BudgetStatus { percent: number | null; level: 'ok' | 'warning' | 'exceeded' | 'unavailable'; }
export interface CostPoint { date: string; estimatedCostUsd: number | null; }
export interface FinopsSummary {
  currency: 'USD'; isEstimate: true; today: string; monthStart: string; monthDays: number;
  sample: { from: string | null; to: string; days: number; activeDays: number; requestCount: number; pricedRequestCount: number; unpricedRequestCount: number };
  status: 'ready' | 'insufficient_data' | 'unavailable'; reason: string | null;
  dailyRateUsd: number | null; projected7DaysUsd: number | null; projected30DaysUsd: number | null;
  observedMonthUsd: number | null; monthRequestCount: number; monthPricedRequestCount: number; monthCoverageComplete: boolean;
  projectedMonthEndUsd: number | null; monthlyBudgetUsd: number | null;
  observedBudget: BudgetStatus; projectedBudget: BudgetStatus;
  historical: CostPoint[]; projected: CostPoint[];
  models: { model: string | null; requestCount: number; pricedRequestCount: number; estimatedCostUsd: number | null }[];
  pricing: { model: string; inputUsdPerMillion: number; outputUsdPerMillion: number }[];
}
export interface SimulationInput { model: string; requestsPerDay: number; inputTokens: number; outputTokens: number; monthlyBudgetUsd: number | null; }
export interface SimulationResult { status: 'ready' | 'unavailable'; reason?: string; costPerRequestUsd: number | null; monthlyCostUsd: number | null; monthDays?: number; budget?: BudgetStatus; }

@Injectable({ providedIn: 'root' })
export class FinopsService {
  private readonly http = inject(HttpClient);
  private readonly url = 'http://localhost:3000/api/dashboard/finops';
  getSummary() { return this.http.get<FinopsSummary>(this.url); }
  saveBudget(monthlyBudgetUsd: number | null) { return this.http.post<{ monthlyBudgetUsd: number | null }>(`${this.url}/budget`, { monthlyBudgetUsd }); }
  simulate(input: SimulationInput) { return this.http.post<SimulationResult>(`${this.url}/simulate`, input); }
}
