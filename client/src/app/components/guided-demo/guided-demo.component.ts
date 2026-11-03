import { ARCHITECTURE_EDGES, ARCHITECTURE_FLOWS, ARCHITECTURE_NODES } from '../architecture-explorer/architecture.data';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, computed, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  GuidedDemoStepId,
  GuidedDemoStepStatus
} from '../../models/guided-demo.model';
import { GUIDED_DEMO_STEPS } from './guided-demo.data';

const INITIAL_STATUSES: Record<GuidedDemoStepId, GuidedDemoStepStatus> = {
  introduction: 'viewed',
  'document-upload': 'not-visited',
  'rag-question': 'not-visited',
  'form-generation': 'not-visited',
  'ai-observability': 'not-visited',
  conclusion: 'not-visited'
};

@Component({
  selector: 'app-guided-demo',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './guided-demo.component.html',
  styleUrl: './guided-demo.component.scss'
})
export class GuidedDemoComponent implements OnDestroy {
  private focusFrame: number | null = null;
  readonly steps = GUIDED_DEMO_STEPS;
  readonly currentStepIndex = signal(0);
  readonly stepStatuses = signal<Record<GuidedDemoStepId, GuidedDemoStepStatus>>({ ...INITIAL_STATUSES });
  readonly currentStep = computed(() => this.steps[this.currentStepIndex()]);
  readonly stepHeading = viewChild<ElementRef<HTMLHeadingElement>>('stepHeading');

  readonly progressValue = computed(() => this.currentStepIndex() + 1);
  readonly progressPercent = computed(() => (this.progressValue() / this.steps.length) * 100);

  readonly overviewFlows = ARCHITECTURE_FLOWS.filter(flow => flow.id !== 'agent-workspace');
  readonly visualEdgeIds: Record<GuidedDemoStepId, readonly string[]> = {
    introduction: [], 'document-upload': ['ingestion-write'],
    'rag-question': ['rag-retrieve', 'rag-inference', 'rag-response'],
    'form-generation': ['chat-generate-request', 'generate-inference', 'generate-schema-return'],
    'ai-observability': ['chat-observability', 'observability-persist', 'dashboard-history-read'], conclusion: []
  };
  visualEdges() {
    const ids = this.visualEdgeIds[this.currentStep().id];
    return ARCHITECTURE_EDGES.filter(edge => ids.includes(edge.id));
  }
  visualNode(id: string) { return ARCHITECTURE_NODES.find(node => node.id === id)!; }

  ngOnDestroy(): void {
    if (this.focusFrame !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.focusFrame);
    }
  }

  isFirstStep(): boolean {
    return this.currentStepIndex() === 0;
  }

  isLastStep(): boolean {
    return this.currentStepIndex() === this.steps.length - 1;
  }

  statusLabel(status: GuidedDemoStepStatus): string {
    switch (status) {
      case 'viewed': return 'Consultée';
      case 'user-confirmed': return 'Confirmée par vous';
      case 'technically-verified': return 'Vérifiée automatiquement';
      default: return 'À découvrir';
    }
  }

  selectStep(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.steps.length) return;
    this.currentStepIndex.set(index);
    const stepId = this.steps[index].id;
    this.stepStatuses.update(statuses => ({
      ...statuses,
      [stepId]: statuses[stepId] === 'not-visited' ? 'viewed' : statuses[stepId]
    }));
    this.focusHeading();
  }

  nextStep(): void {
    if (!this.isLastStep()) this.selectStep(this.currentStepIndex() + 1);
  }

  previousStep(): void {
    if (!this.isFirstStep()) this.selectStep(this.currentStepIndex() - 1);
  }

  confirmCurrentStep(): void {
    const stepId = this.currentStep().id;
    if (this.stepStatuses()[stepId] === 'technically-verified') return;
    this.stepStatuses.update(statuses => ({ ...statuses, [stepId]: 'user-confirmed' }));
  }

  restart(): void {
    this.currentStepIndex.set(0);
    this.stepStatuses.set({ ...INITIAL_STATUSES });
    this.focusHeading();
  }

  private focusHeading(): void {
    if (typeof requestAnimationFrame === 'undefined') {
      this.stepHeading()?.nativeElement.focus();
      return;
    }
    if (this.focusFrame !== null) cancelAnimationFrame(this.focusFrame);
    this.focusFrame = requestAnimationFrame(() => {
      this.focusFrame = null;
      this.stepHeading()?.nativeElement.focus();
    });
  }
}