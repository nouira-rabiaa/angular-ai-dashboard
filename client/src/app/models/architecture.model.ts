export type ArchitectureLayerId = 'client' | 'api' | 'ai' | 'data';

export interface ArchitectureLayer {
  id: ArchitectureLayerId;
  name: string;
  summary: string;
}

export interface ArchitectureNode {
  id: string;
  name: string;
  layerId: ArchitectureLayerId;
  technology: string;
  responsibility: string;
  description: string;
}

export interface ArchitectureEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  connectionType: 'http' | 'inference' | 'sql' | 'response' | 'tool';
  description: string;
}

export interface ArchitectureFlowStep {
  title: string;
  explanation: string;
}

export interface ArchitectureFlow {
  id: string;
  title: string;
  purpose: string;
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  steps: readonly ArchitectureFlowStep[];
}
