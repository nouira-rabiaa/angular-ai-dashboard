import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { FinopsService } from './finops.service';

describe('FinopsService', () => {
  let api: FinopsService;let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FinopsService, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(FinopsService);http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('uses only guarded local FinOps endpoints and transmits scenario/budget values', () => {
    const url = 'http://localhost:3000/api/dashboard/finops';
    api.getSummary().subscribe();http.expectOne(url).flush({});
    api.saveBudget(100).subscribe();const budget = http.expectOne(url + '/budget');expect(budget.request.method).toBe('POST');expect(budget.request.body).toEqual({ monthlyBudgetUsd: 100 });budget.flush({ monthlyBudgetUsd: 100 });
    const scenario = { model: 'model', requestsPerDay: 100, inputTokens: 1000, outputTokens: 300, monthlyBudgetUsd: null };
    api.simulate(scenario).subscribe();const simulation = http.expectOne(url + '/simulate');expect(simulation.request.method).toBe('POST');expect(simulation.request.body).toEqual(scenario);simulation.flush({});
  });
});
