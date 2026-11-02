import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { LucideWorkflow } from '@lucide/angular';
import {
  ARCHITECTURE_EDGES,
  ARCHITECTURE_FLOWS,
  ARCHITECTURE_LAYERS,
  ARCHITECTURE_NODES
} from './architecture.data';
import {
  ArchitectureEdge,
  ArchitectureFlow,
  ArchitectureLayer,
  ArchitectureLayerId,
  ArchitectureNode
} from '../../models/architecture.model';

@Component({
  selector: 'app-architecture-explorer',
  standalone: true,
  imports: [CommonModule, LucideWorkflow],
  templateUrl: './architecture-explorer.component.html'
})
export class ArchitectureExplorerComponent {
  readonly layers = ARCHITECTURE_LAYERS;
  readonly nodes = ARCHITECTURE_NODES;
  readonly edges = ARCHITECTURE_EDGES;
  readonly flows = ARCHITECTURE_FLOWS;

  selectedFlowId = signal(this.flows[0].id);
  selectedNodeId = signal(this.flows[0].nodeIds[0]);

  activeFlow(): ArchitectureFlow {
    return this.flows.find(flow => flow.id === this.selectedFlowId()) ?? this.flows[0];
  }

  selectedNode(): ArchitectureNode {
    return this.nodes.find(node => node.id === this.selectedNodeId()) ?? this.nodes[0];
  }

  nodesForLayer(layerId: ArchitectureLayerId): ArchitectureNode[] {
    return this.nodes.filter(node => node.layerId === layerId);
  }

  layerTone(layerId: ArchitectureLayer['id']): string {
    switch (layerId) {
      case 'client': return 'border-violet-200 bg-violet-50 text-violet-800';
      case 'api': return 'border-indigo-200 bg-indigo-50 text-indigo-800';
      case 'ai': return 'border-sky-200 bg-sky-50 text-sky-800';
      case 'data': return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    }
  }

  isNodeInFlow(nodeId: string): boolean {
    return this.activeFlow().nodeIds.includes(nodeId);
  }

  isEdgeInFlow(edgeId: string): boolean {
    return this.activeFlow().edgeIds.includes(edgeId);
  }

  flowEdges(): ArchitectureEdge[] {
    const activeEdgeIds = new Set(this.activeFlow().edgeIds);
    return this.edges.filter(edge => activeEdgeIds.has(edge.id));
  }

  nodeName(nodeId: string): string {
    return this.nodes.find(node => node.id === nodeId)?.name ?? 'Unknown component';
  }

  selectFlow(flow: ArchitectureFlow): void {
    this.selectedFlowId.set(flow.id);
    if (!flow.nodeIds.includes(this.selectedNodeId())) {
      this.selectedNodeId.set(flow.nodeIds[0]);
    }
  }

  selectNode(node: ArchitectureNode): void {
    this.selectedNodeId.set(node.id);
  }
}
