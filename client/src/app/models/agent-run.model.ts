export interface AgentRunRequest {
  goal: string;
}

export type AgentToolName =
  | 'count_form_submissions'
  | 'get_dashboard_history'
  | 'unrecognized_tool';

export type AgentToolStatus = 'completed' | 'rejected' | 'failed';

export interface SubmissionCountResult {
  count: number;
}

export interface DashboardHistoryItem {
  sourceId: number;
  type: string;
  createdAt: string;
  status: string;
}

export interface DashboardHistoryResult {
  items: DashboardHistoryItem[];
  returned: number;
}

export type AgentToolResult =
  | SubmissionCountResult
  | DashboardHistoryResult
  | { code: string };

export interface AgentTraceStep {
  step: number;
  tool: AgentToolName;
  status: AgentToolStatus;
  result: AgentToolResult;
}

export interface AgentRunResponse {
  runId: string;
  status: 'completed';
  answer: string;
  trace: AgentTraceStep[];
}

export interface AgentRunErrorResponse {
  runId?: string;
  status?: 'failed';
  answer?: null;
  trace?: AgentTraceStep[];
  error: {
    code: string;
    message: string;
  };
}