import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ArchitectureExplorerComponent } from './architecture-explorer.component';

describe('ArchitectureExplorerComponent', () => {
  let fixture: ComponentFixture<ArchitectureExplorerComponent>;
  let component: ArchitectureExplorerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ArchitectureExplorerComponent] }).compileComponents();
    fixture = TestBed.createComponent(ArchitectureExplorerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts on form generation and highlights only the selected flow references', () => {
    expect(component.activeFlow().id).toBe('form-generation');
    expect(fixture.nativeElement.querySelector('svg.lucide-workflow')).not.toBeNull();
    const ragFlow = component.flows.find(flow => flow.id === 'pdf-rag')!;
    component.selectFlow(ragFlow);
    fixture.detectChanges();

    expect(component.activeFlow().nodeIds).toContain('sqlite-documents');
    expect(component.activeFlow().edgeIds).toContain('rag-retrieve');
    expect(component.isNodeInFlow('express-agent-api')).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('FTS5');
    expect(fixture.nativeElement.textContent).toContain('Hors du flux sélectionné');
    expect(fixture.nativeElement.querySelector('[aria-label="Sélectionner API Agent"]')?.className).not.toContain('opacity-50');
    expect(fixture.nativeElement.textContent).toContain('cela ne prouve pas l’exactitude factuelle');
  });

  it('uses accessible contrast classes for secondary text', () => {
    const template = fixture.nativeElement.innerHTML as string;
    expect(template).not.toContain('text-slate-400');
    expect(template).not.toContain('text-slate-500');
  });

  it('selects a node through its rendered button and updates the details panel', () => {
    const nodeButton = fixture.nativeElement.querySelector('button[aria-label="Sélectionner API Agent"]') as HTMLButtonElement;
    expect(nodeButton).not.toBeNull();
    expect(nodeButton.getAttribute('aria-describedby')).toBe('selected-node-details');
    nodeButton.focus();
    expect(document.activeElement).toBe(nodeButton);
    expect(nodeButton.type).toBe('button');
    expect(nodeButton.disabled).toBe(false);
    nodeButton.click();
    fixture.detectChanges();

    expect(component.selectedNodeId()).toBe('express-agent-api');
    expect(nodeButton.getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.querySelector('#node-details-title')?.textContent).toContain('API Agent');
    expect(fixture.nativeElement.textContent).toContain('voie indépendante du chat RAG');
  });

  it('changes flow through semantic selector buttons and keeps the selected node valid', () => {
    const agentButton = fixture.nativeElement.querySelector('button[aria-label="Choisir le flux Moteur interne · outils"]') as HTMLButtonElement;
    expect(agentButton.getAttribute('aria-pressed')).toBe('false');
    agentButton.click();
    fixture.detectChanges();

    expect(component.activeFlow().id).toBe('agent-workspace');
    expect(fixture.nativeElement.textContent).toContain('ce parcours ne passe pas par le chat RAG');
    expect(component.isNodeInFlow(component.selectedNodeId())).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('n8n');
    expect(fixture.nativeElement.textContent).toContain('non implémentées');
  });

  it('renders every layer and node once and updates node and connection states for every flow', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('button[aria-label^="Choisir le flux "]')).toHaveLength(component.flows.length);
    expect(root.querySelectorAll('button[aria-label^="Sélectionner "]')).toHaveLength(component.nodes.length);
    for (const layer of component.layers) {
      const sections = root.querySelectorAll(`section[aria-labelledby="layer-${layer.id}"]`);
      expect(sections).toHaveLength(1);
      expect(sections[0].querySelectorAll('button')).toHaveLength(
        component.nodes.filter(node => node.layerId === layer.id).length
      );
    }

    for (const flow of component.flows) {
      const flowButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label^="Choisir le flux "]'));
      flowButtons.find(button => button.getAttribute('aria-label') === `Choisir le flux ${flow.title}`)!.click();
      fixture.detectChanges();
      expect(flowButtons.filter(button => button.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
      expect(root.querySelector('button[aria-pressed="true"][aria-label^="Choisir le flux "]')?.getAttribute('aria-label'))
        .toBe(`Choisir le flux ${flow.title}`);

      for (const node of component.nodes) {
        const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label^="Sélectionner "]'))
          .filter(button => button.getAttribute('aria-label') === `Sélectionner ${node.name}`);
        expect(buttons).toHaveLength(1);
        const button = buttons[0];
        expect(button.closest('section')?.getAttribute('aria-labelledby')).toBe(`layer-${node.layerId}`);
        const inFlow = flow.nodeIds.includes(node.id);
        expect(button.classList.contains('border-blue-300')).toBe(inFlow);
        expect(button.classList.contains('border-slate-300')).toBe(!inFlow);
        expect(button.textContent?.includes('Hors du flux sélectionné')).toBe(!inFlow);
        expect(button.getAttribute('aria-pressed')).toBe(String(node.id === component.selectedNodeId()));
      }
      const connections = Array.from(root.querySelectorAll('section[aria-labelledby="connections-title"] ol > li'));
      const expectedEdges = component.edges.filter(edge => flow.edgeIds.includes(edge.id));
      expect(connections).toHaveLength(flow.edgeIds.length);
      expect(connections.map(connection => connection.querySelector('p + p')?.textContent?.trim()))
        .toEqual(expectedEdges.map(edge => edge.description));
      expectedEdges.forEach((edge, index) => {
        expect(connections[index].textContent).toContain(component.nodes.find(node => node.id === edge.sourceNodeId)!.name);
        expect(connections[index].textContent).toContain(component.nodes.find(node => node.id === edge.targetNodeId)!.name);
      });
    }
  });

  it('maps only the declared nodes and directed connections for each flow', () => {
    for (const flow of component.flows) {
      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>(`button[aria-label="Choisir le flux ${flow.title}"]`)!.click();
      fixture.detectChanges();
      const map = root.querySelector('.architecture-canvas')!;
      expect(map.getAttribute('aria-label')).toContain(flow.title);
      expect(Array.from(map.querySelectorAll('[data-node-id]')).map(node => node.getAttribute('data-node-id')).sort())
        .toEqual([...flow.nodeIds].sort());
      expect(Array.from(map.querySelectorAll('[data-edge-id]')).map(edge => edge.getAttribute('data-edge-id')).sort())
        .toEqual([...flow.edgeIds].sort());
      for (const edge of component.flowEdges()) {
        expect(flow.nodeIds).toContain(edge.sourceNodeId);
        expect(flow.nodeIds).toContain(edge.targetNodeId);
        const path = map.querySelector(`[data-edge-id="${edge.id}"]`)!;
        expect(path.getAttribute('d')).not.toMatch(/NaN|undefined/);
        expect(path.getAttribute('marker-end')).toBe('url(#architecture-arrow)');
        expect(path.getAttribute('data-kind')).toBe(edge.connectionType);
      }
      for (const node of component.diagramNodes()) {
        const position = component.diagramPoint(node.id);
        expect(position.x).toBeGreaterThanOrEqual(0);
        expect(position.x + 170).toBeLessThanOrEqual(800);
        expect(position.y + 72).toBeLessThan(component.diagramHeight());
      }
    }
  });

  it('highlights a selected map node while preserving its detailed inspection', () => {
    fixture.nativeElement.querySelector('button[aria-label="Sélectionner Formulaire dynamique"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.architecture-canvas .architecture-selected')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.architecture-canvas .architecture-selected').getAttribute('data-node-id')).toBe('dynamic-form-ui');
    expect(fixture.nativeElement.querySelector('#node-details-title').textContent).toContain('Formulaire dynamique');
    const scrollRegion = fixture.nativeElement.querySelector('.architecture-map-scroll');
    expect(scrollRegion.getAttribute('tabindex')).toBe('0');
    expect(scrollRegion.getAttribute('aria-describedby')).toBe('architecture-map-help');
  });

  it('inspects diagram nodes by click and real DOM arrow-key events without a follow-up click', () => {
    const root = fixture.nativeElement as HTMLElement;
    for (const flow of component.flows) {
      root.querySelector<HTMLButtonElement>(`button[aria-label="Choisir le flux ${flow.title}"]`)!.click();
      fixture.detectChanges();
      const nodes = root.querySelectorAll<HTMLButtonElement>('.architecture-map-node');
      const expected = component.diagramNodes();
      nodes[0].focus();
      nodes[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(document.activeElement).toBe(nodes[1]);
      expect(component.selectedNodeId()).toBe(expected[1].id);
      expect(nodes[1].getAttribute('aria-pressed')).toBe('true');
      expect(root.querySelector('#node-details-title')?.textContent).toContain(expected[1].name);
      nodes[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(document.activeElement).toBe(nodes[0]);
      nodes[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(document.activeElement).toBe(nodes[nodes.length - 1]);
      nodes[0].click();fixture.detectChanges();
      expect(component.selectedNodeId()).toBe(expected[0].id);
      expect(nodes[0].type).toBe('button');
    }
  });

  it('retains a selected node shared by the previous and next flows', () => {
    const nextFlow = component.flows.find(flow => flow.id === 'pdf-rag')!;
    const sharedNode = component.nodes.find(node =>
      component.activeFlow().nodeIds.includes(node.id) && nextFlow.nodeIds.includes(node.id))!;
    expect(sharedNode).toBeDefined();
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    buttons.find(button => button.getAttribute('aria-label') === `Sélectionner ${sharedNode.name}`)!.click();
    fixture.detectChanges();
    buttons.find(button => button.getAttribute('aria-label') === `Choisir le flux ${nextFlow.title}`)!.click();
    fixture.detectChanges();

    expect(component.selectedNodeId()).toBe(sharedNode.id);
    expect(fixture.nativeElement.querySelector('#node-details-title')?.textContent).toContain(sharedNode.name);
  });

  it('replaces a selection outside the next flow with that flow’s first node', () => {
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button[aria-label="Sélectionner API Agent"]')!.click();
    fixture.detectChanges();
    const nextFlow = component.flows.find(flow => flow.id === 'pdf-rag')!;
    const flowButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label^="Choisir le flux "]'));
    flowButtons.find(button => button.getAttribute('aria-label') === `Choisir le flux ${nextFlow.title}`)!.click();
    fixture.detectChanges();

    expect(component.selectedNodeId()).toBe(nextFlow.nodeIds[0]);
    const selected = root.querySelector('button[aria-label^="Sélectionner "][aria-pressed="true"]');
    expect(selected?.getAttribute('aria-label')).toBe(`Sélectionner ${component.nodes.find(node => node.id === nextFlow.nodeIds[0])!.name}`);
    expect(root.querySelectorAll('button[aria-label^="Sélectionner "][aria-pressed="true"]')).toHaveLength(1);
  });

});
