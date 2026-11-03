import {
  ARCHITECTURE_EDGES,
  ARCHITECTURE_FLOWS,
  ARCHITECTURE_LAYERS,
  ARCHITECTURE_NODES
} from './architecture.data';

describe('Architecture Explorer curated model', () => {
  const nodeIds = new Set(ARCHITECTURE_NODES.map(node => node.id));
  const edgeIds = new Set(ARCHITECTURE_EDGES.map(edge => edge.id));

  it('uses unique stable IDs and valid layer references', () => {
    expect(nodeIds.size).toBe(ARCHITECTURE_NODES.length);
    expect(edgeIds.size).toBe(ARCHITECTURE_EDGES.length);
    const layerIds = new Set(ARCHITECTURE_LAYERS.map(layer => layer.id));
    expect(layerIds.size).toBe(ARCHITECTURE_LAYERS.length);
    expect(new Set(ARCHITECTURE_FLOWS.map(flow => flow.id)).size).toBe(ARCHITECTURE_FLOWS.length);
    for (const node of ARCHITECTURE_NODES) expect(layerIds.has(node.layerId)).toBe(true);
  });

  it('references valid endpoints and valid flow node/edge IDs', () => {
    for (const edge of ARCHITECTURE_EDGES) {
      expect(nodeIds.has(edge.sourceNodeId)).toBe(true);
      expect(nodeIds.has(edge.targetNodeId)).toBe(true);
    }
    for (const flow of ARCHITECTURE_FLOWS) {
      expect(new Set(flow.nodeIds).size).toBe(flow.nodeIds.length);
      expect(new Set(flow.edgeIds).size).toBe(flow.edgeIds.length);
      expect(flow.nodeIds.length).toBeGreaterThan(1);
      for (const nodeId of flow.nodeIds) expect(nodeIds.has(nodeId)).toBe(true);
      for (const edgeId of flow.edgeIds) {
        expect(edgeIds.has(edgeId)).toBe(true);
        const edge = ARCHITECTURE_EDGES.find(item => item.id === edgeId)!;
        expect(flow.nodeIds).toContain(edge.sourceNodeId);
        expect(flow.nodeIds).toContain(edge.targetNodeId);
      }
      expect(flow.steps.length).toBeGreaterThan(0);
    }
  });

  it('keeps PDF RAG and the internal tool engine separate without the removed UI', () => {
    const rag = ARCHITECTURE_FLOWS.find(flow => flow.id === 'pdf-rag')!;
    const agent = ARCHITECTURE_FLOWS.find(flow => flow.id === 'agent-workspace')!;
    expect(rag.nodeIds).toContain('sqlite-documents');
    expect(rag.nodeIds).toContain('groq-rag-model');
    expect(rag.nodeIds).not.toContain('agent-workspace-ui');
    expect(agent.nodeIds).not.toContain('agent-workspace-ui');
    expect(agent.nodeIds).toContain('express-agent-api');
    expect(agent.nodeIds).toContain('agent-readonly-tools');
    expect(agent.nodeIds).not.toContain('sqlite-documents');
  });

  it('contains no secret, local path, document payload or user data examples', () => {
    const serialized = JSON.stringify({ ARCHITECTURE_LAYERS, ARCHITECTURE_NODES, ARCHITECTURE_EDGES, ARCHITECTURE_FLOWS });
    expect(serialized).not.toMatch(/GROQ_API_KEY|Bearer\s|\/Users\/|submissions\.db|private@example|confidential-contract/i);
  });

  it('describes limitations instead of overclaiming RAG, citations or price accuracy', () => {
    const serialized = JSON.stringify({ ARCHITECTURE_NODES, ARCHITECTURE_FLOWS });
    expect(serialized).toContain('n’utilise pas automatiquement la recherche RAG');
    expect(serialized).toContain('ne prouve pas l’exactitude factuelle');
    expect(serialized).toContain('pas une facture');
    expect(serialized).toContain('Aucun embedding vectoriel n’est utilisé');
  });
});
