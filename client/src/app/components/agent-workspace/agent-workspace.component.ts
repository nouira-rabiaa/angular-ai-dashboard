import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgentRunErrorResponse, AgentRunResponse, AgentToolResult, AgentTraceStep, DashboardHistoryResult } from '../../models/agent-run.model';
import { AgentService } from '../../services/agent.service';

type WorkspaceState = 'idle' | 'running' | 'completed' | 'failed';

@Component({
  selector: 'app-agent-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agent-workspace.component.html',
  styleUrl: './agent-workspace.component.scss'
})
export class AgentWorkspaceComponent {
  private readonly agentService = inject(AgentService);

  readonly maxGoalLength = 2000;
  goal = signal('');
  state = signal<WorkspaceState>('idle');
  result = signal<AgentRunResponse | null>(null);
  errorMessage = signal<string | null>(null);

  runAgent(): void {
    const goal = this.goal().trim();
    if (!goal || this.state() === 'running') return;

    this.result.set(null);
    this.errorMessage.set(null);
    this.state.set('running');

    this.agentService.run(goal).subscribe({
      next: response => {
        this.result.set(response);
        this.state.set('completed');
      },
      error: (error: AgentRunErrorResponse | Error) => {
        this.errorMessage.set(this.getErrorMessage(error));
        this.state.set('failed');
      }
    });
  }

  useExample(goal: string): void {
    if (this.state() !== 'running') this.goal.set(goal);
  }

  formatToolName(tool: AgentTraceStep['tool']): string {
    switch (tool) {
      case 'count_form_submissions': return 'Count form submissions';
      case 'get_dashboard_history': return 'Read dashboard history';
      default: return 'Unrecognized tool';
    }
  }

  isCountResult(result: AgentToolResult): result is { count: number } {
    return 'count' in result;
  }

  isHistoryResult(result: AgentToolResult): result is DashboardHistoryResult {
    return 'items' in result && 'returned' in result;
  }

  isErrorResult(result: AgentToolResult): result is { code: string } {
    return 'code' in result;
  }

  private getErrorMessage(error: AgentRunErrorResponse | Error): string {
    if ('error' in error && typeof error.error?.message === 'string' && error.error.message.trim()) {
      return error.error.message;
    }
    return 'The agent could not complete this run. Check the backend connection and try again.';
  }
}