export type GuidedDemoStepId =
  | 'introduction'
  | 'document-upload'
  | 'rag-question'
  | 'form-generation'
  | 'ai-observability'
  | 'conclusion';

export type GuidedDemoStepStatus =
  | 'not-visited'
  | 'viewed'
  | 'user-confirmed'
  | 'technically-verified';

export interface GuidedDemoStep {
  id: GuidedDemoStepId;
  title: string;
  businessExplanation: string;
  technicalExplanation: string;
  userInstruction: string;
  destinationRoute?: `/${string}`;
  destinationSpace?: 'configuration' | 'knowledge' | 'test' | 'conversations' | 'tickets' | 'workflows';
  completionCriteria: string;
  liveAiCallMayBeRequired: boolean;
}