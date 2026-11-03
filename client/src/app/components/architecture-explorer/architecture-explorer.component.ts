import { UiStatusPipe } from '../../i18n/ui-format.pipe';
import { TranslocoPipe } from '@jsverse/transloco';
import { UiLanguageService } from '../../i18n/ui-language.service';
import { CommonModule } from '@angular/common';
import { inject, Component, signal } from '@angular/core';
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
  imports: [TranslocoPipe, UiStatusPipe, CommonModule, LucideWorkflow],
  templateUrl: './architecture-explorer.component.html',
  styleUrl: './architecture-explorer.component.scss'
})
export class ArchitectureExplorerComponent {
  readonly ui = inject(UiLanguageService);
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
      case 'api': return 'border-cyan-200 bg-cyan-50 text-cyan-800';
      case 'ai': return 'border-orange-200 bg-orange-50 text-orange-800';
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
    return this.nodes.find(node => node.id === nodeId)?.name ?? 'architecture.composant_inconnu';
  }

  // Presentation only: the map uses the existing flow's nodes and directed edges.
  diagramNodes(): ArchitectureNode[] {
    return this.nodes.filter(node => this.isNodeInFlow(node.id));
  }

  diagramPoint(nodeId: string): { x: number; y: number } {
    const node = this.nodes.find(candidate => candidate.id === nodeId)!;
    const column = this.layers.findIndex(layer => layer.id === node.layerId);
    const row = this.diagramNodes().filter(candidate => candidate.layerId === node.layerId)
      .findIndex(candidate => candidate.id === nodeId);
    return { x: 20 + column * 190, y: 80 + row * 90 };
  }

  diagramHeight(): number {
    return 65 + 90 * Math.max(1, ...this.layers.map(layer =>
      this.diagramNodes().filter(node => node.layerId === layer.id).length));
  }

  diagramPath(edge: ArchitectureEdge, index: number): string {
    const source = this.diagramPoint(edge.sourceNodeId);
    const target = this.diagramPoint(edge.targetNodeId);
    const offset = edge.connectionType === 'response' ? -7 : 7;
    const sy = source.y + 36 + offset;
    const ty = target.y + 36 + offset;
    if (source.x === target.x) {
      return `M${source.x + 170},${sy} C${source.x + 190},${sy} ${target.x + 190},${ty} ${target.x + 170},${ty}`;
    }
    const direction = target.x > source.x ? 1 : -1;
    const sx = source.x + (direction > 0 ? 170 : 0);
    const tx = target.x + (direction > 0 ? 0 : 170);
    const exit = sx + direction * (10 + index * 2);
    const entry = tx - direction * (10 + index * 2);
    const lane = 38 + index * 4;
    return `M${sx},${sy} L${exit},${sy} L${exit},${lane} L${entry},${lane} L${entry},${ty} L${tx},${ty}`;
  }

  connectionTypes(): string[] {
    return [...new Set(this.flowEdges().map(edge => edge.connectionType))];
  }

  onDiagramKeydown(event: KeyboardEvent, node: ArchitectureNode): void {
    const nodes = this.diagramNodes();
    const index = nodes.findIndex(candidate => candidate.id === node.id);
    let next: number;
    switch (event.key) {
      case 'ArrowRight': next = Math.min(nodes.length - 1, index + 1); break;
      case 'ArrowLeft': next = Math.max(0, index - 1); break;
      case 'Home': next = 0; break;
      case 'End': next = nodes.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const target = nodes[next];
    this.selectNode(target);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelector<HTMLButtonElement>(`[data-node-id="${target.id}"]`)?.focus();
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
