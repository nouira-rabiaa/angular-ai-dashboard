import { ARCHITECTURE_NODES, ARCHITECTURE_EDGES, ARCHITECTURE_FLOWS } from './architecture.data';
import { ArchitectureNode, ArchitectureEdge, ArchitectureFlow } from '../../models/architecture.model';

const SUPPORT_PREMIUM_NODES: readonly ArchitectureNode[] = [
  {
    "id": "studio-ui",
    "layerId": "client",
    "technology": "Angular 19 · Signals",
    "name": "architecturePremium.nodes.studio-ui.title",
    "responsibility": "architecturePremium.nodes.studio-ui.role",
    "description": "architecturePremium.nodes.studio-ui.limits"
  },
  {
    "id": "support-query",
    "layerId": "api",
    "technology": "Node.js · Express · support-knowledge",
    "name": "architecturePremium.nodes.support-query.title",
    "responsibility": "architecturePremium.nodes.support-query.role",
    "description": "architecturePremium.nodes.support-query.limits"
  },
  {
    "id": "support-context",
    "layerId": "api",
    "technology": "support-knowledge · document-store",
    "name": "architecturePremium.nodes.support-context.title",
    "responsibility": "architecturePremium.nodes.support-context.role",
    "description": "architecturePremium.nodes.support-context.limits"
  },
  {
    "id": "support-response",
    "layerId": "api",
    "technology": "support-knowledge",
    "name": "architecturePremium.nodes.support-response.title",
    "responsibility": "architecturePremium.nodes.support-response.role",
    "description": "architecturePremium.nodes.support-response.limits"
  },
  {
    "id": "support-conversations",
    "layerId": "data",
    "technology": "SQLite · support_conversations · support_messages",
    "name": "architecturePremium.nodes.support-conversations.title",
    "responsibility": "architecturePremium.nodes.support-conversations.role",
    "description": "architecturePremium.nodes.support-conversations.limits"
  },
  {
    "id": "ticket-draft",
    "layerId": "client",
    "technology": "Angular · AgentTicketsComponent",
    "name": "architecturePremium.nodes.ticket-draft.title",
    "responsibility": "architecturePremium.nodes.ticket-draft.role",
    "description": "architecturePremium.nodes.ticket-draft.limits"
  },
  {
    "id": "support-tickets",
    "layerId": "data",
    "technology": "SQLite · support_tickets · support_ticket_events",
    "name": "architecturePremium.nodes.support-tickets.title",
    "responsibility": "architecturePremium.nodes.support-tickets.role",
    "description": "architecturePremium.nodes.support-tickets.limits"
  },
  {
    "id": "support-handoff",
    "layerId": "api",
    "technology": "Express · support-escalations",
    "name": "architecturePremium.nodes.support-handoff.title",
    "responsibility": "architecturePremium.nodes.support-handoff.role",
    "description": "architecturePremium.nodes.support-handoff.limits"
  },
  {
    "id": "workflow-receipts",
    "layerId": "data",
    "technology": "SQLite · workflow_receipts",
    "name": "architecturePremium.nodes.workflow-receipts.title",
    "responsibility": "architecturePremium.nodes.workflow-receipts.role",
    "description": "architecturePremium.nodes.workflow-receipts.limits"
  },
  {
    "id": "workflow-engine",
    "layerId": "api",
    "technology": "workflow-local-engine · workflow-management",
    "name": "architecturePremium.nodes.workflow-engine.title",
    "responsibility": "architecturePremium.nodes.workflow-engine.role",
    "description": "architecturePremium.nodes.workflow-engine.limits"
  },
  {
    "id": "workflow-audit",
    "layerId": "data",
    "technology": "SQLite · workflow_runs · workflow_audit",
    "name": "architecturePremium.nodes.workflow-audit.title",
    "responsibility": "architecturePremium.nodes.workflow-audit.role",
    "description": "architecturePremium.nodes.workflow-audit.limits"
  },
  {
    "id": "conversation-api",
    "layerId": "api",
    "technology": "Express · support-conversations",
    "name": "architecturePremium.nodes.conversation-api.title",
    "responsibility": "architecturePremium.nodes.conversation-api.role",
    "description": "architecturePremium.nodes.conversation-api.limits"
  },
  {
    "id": "ticket-api",
    "layerId": "api",
    "technology": "Express · support-tickets",
    "name": "architecturePremium.nodes.ticket-api.title",
    "responsibility": "architecturePremium.nodes.ticket-api.role",
    "description": "architecturePremium.nodes.ticket-api.limits"
  }
];
export const PREMIUM_NODES: readonly ArchitectureNode[] = [...ARCHITECTURE_NODES, ...SUPPORT_PREMIUM_NODES];
const SUPPORT_PREMIUM_EDGES: readonly ArchitectureEdge[] = [
  {
    "id": "support-sq",
    "sourceNodeId": "studio-ui",
    "targetNodeId": "support-query",
    "connectionType": "http",
    "description": "architecturePremium.edges.sq"
  },
  {
    "id": "support-search",
    "sourceNodeId": "support-query",
    "targetNodeId": "sqlite-documents",
    "connectionType": "sql",
    "description": "architecturePremium.edges.search"
  },
  {
    "id": "support-context",
    "sourceNodeId": "sqlite-documents",
    "targetNodeId": "support-context",
    "connectionType": "response",
    "description": "architecturePremium.edges.context"
  },
  {
    "id": "support-generation",
    "sourceNodeId": "support-context",
    "targetNodeId": "groq-rag-model",
    "connectionType": "inference",
    "description": "architecturePremium.edges.generation"
  },
  {
    "id": "support-validation",
    "sourceNodeId": "groq-rag-model",
    "targetNodeId": "support-response",
    "connectionType": "response",
    "description": "architecturePremium.edges.validation"
  },
  {
    "id": "support-answer",
    "sourceNodeId": "support-response",
    "targetNodeId": "studio-ui",
    "connectionType": "response",
    "description": "architecturePremium.edges.answer"
  },
  {
    "id": "support-history",
    "sourceNodeId": "studio-ui",
    "targetNodeId": "conversation-api",
    "connectionType": "http",
    "description": "architecturePremium.edges.history"
  },
  {
    "id": "support-draft",
    "sourceNodeId": "support-conversations",
    "targetNodeId": "ticket-draft",
    "connectionType": "tool",
    "description": "architecturePremium.edges.draft"
  },
  {
    "id": "support-ticket",
    "sourceNodeId": "ticket-draft",
    "targetNodeId": "ticket-api",
    "connectionType": "http",
    "description": "architecturePremium.edges.ticket"
  },
  {
    "id": "support-handoff",
    "sourceNodeId": "support-tickets",
    "targetNodeId": "support-handoff",
    "connectionType": "tool",
    "description": "architecturePremium.edges.handoff"
  },
  {
    "id": "support-receipt",
    "sourceNodeId": "support-handoff",
    "targetNodeId": "workflow-receipts",
    "connectionType": "sql",
    "description": "architecturePremium.edges.receipt"
  },
  {
    "id": "support-prepare",
    "sourceNodeId": "workflow-receipts",
    "targetNodeId": "workflow-engine",
    "connectionType": "tool",
    "description": "architecturePremium.edges.prepare"
  },
  {
    "id": "support-simulate",
    "sourceNodeId": "workflow-engine",
    "targetNodeId": "workflow-audit",
    "connectionType": "sql",
    "description": "architecturePremium.edges.simulate"
  },
  {
    "id": "support-conversation-write",
    "sourceNodeId": "conversation-api",
    "targetNodeId": "support-conversations",
    "connectionType": "sql",
    "description": "architecturePremium.edges.conversation-write"
  },
  {
    "id": "support-ticket-write",
    "sourceNodeId": "ticket-api",
    "targetNodeId": "support-tickets",
    "connectionType": "sql",
    "description": "architecturePremium.edges.ticket-write"
  }
];
export const PREMIUM_EDGES: readonly ArchitectureEdge[] = [...ARCHITECTURE_EDGES, ...SUPPORT_PREMIUM_EDGES];
const SUPPORT_FLOWS: readonly ArchitectureFlow[] = [
  {
    "id": "support-question",
    "title": "architecturePremium.flows.support-question.title",
    "purpose": "architecturePremium.flows.support-question.purpose",
    "nodeIds": [
      "studio-ui",
      "support-query",
      "sqlite-documents",
      "support-context",
      "groq-rag-model",
      "support-response"
    ],
    "edgeIds": [
      "support-sq",
      "support-search",
      "support-context",
      "support-generation",
      "support-validation",
      "support-answer"
    ],
    "steps": [
      {
        "title": "architecturePremium.nodes.support-query.title",
        "explanation": "architecturePremium.edges.sq"
      },
      {
        "title": "architecture.documents_et_fts5",
        "explanation": "architecturePremium.edges.search"
      },
      {
        "title": "architecturePremium.nodes.support-context.title",
        "explanation": "architecturePremium.edges.context"
      },
      {
        "title": "architecture.groq_reponse_rag",
        "explanation": "architecturePremium.edges.generation"
      },
      {
        "title": "architecturePremium.nodes.support-response.title",
        "explanation": "architecturePremium.edges.validation"
      },
      {
        "title": "architecturePremium.nodes.studio-ui.title",
        "explanation": "architecturePremium.edges.answer"
      }
    ]
  },
  {
    "id": "support-case",
    "title": "architecturePremium.flows.support-case.title",
    "purpose": "architecturePremium.flows.support-case.purpose",
    "nodeIds": [
      "studio-ui",
      "support-conversations",
      "ticket-draft",
      "support-tickets",
      "support-handoff",
      "conversation-api",
      "ticket-api"
    ],
    "edgeIds": [
      "support-history",
      "support-conversation-write",
      "support-draft",
      "support-ticket",
      "support-ticket-write",
      "support-handoff"
    ],
    "steps": [
      {
        "title": "architecturePremium.nodes.support-conversations.title",
        "explanation": "architecturePremium.edges.history"
      },
      {
        "title": "architecturePremium.nodes.support-conversations.title",
        "explanation": "architecturePremium.edges.conversation-write"
      },
      {
        "title": "architecturePremium.nodes.ticket-draft.title",
        "explanation": "architecturePremium.edges.draft"
      },
      {
        "title": "architecturePremium.nodes.support-tickets.title",
        "explanation": "architecturePremium.edges.ticket"
      },
      {
        "title": "architecturePremium.nodes.support-tickets.title",
        "explanation": "architecturePremium.edges.ticket-write"
      },
      {
        "title": "architecturePremium.nodes.support-handoff.title",
        "explanation": "architecturePremium.edges.handoff"
      }
    ]
  },
  {
    "id": "local-automation",
    "title": "architecturePremium.flows.local-automation.title",
    "purpose": "architecturePremium.flows.local-automation.purpose",
    "nodeIds": [
      "support-handoff",
      "workflow-receipts",
      "workflow-engine",
      "workflow-audit"
    ],
    "edgeIds": [
      "support-receipt",
      "support-prepare",
      "support-simulate"
    ],
    "steps": [
      {
        "title": "architecturePremium.nodes.workflow-receipts.title",
        "explanation": "architecturePremium.edges.receipt"
      },
      {
        "title": "architecturePremium.nodes.workflow-engine.title",
        "explanation": "architecturePremium.edges.prepare"
      },
      {
        "title": "architecturePremium.nodes.workflow-audit.title",
        "explanation": "architecturePremium.edges.simulate"
      }
    ]
  }
];
export const PREMIUM_FLOWS: readonly ArchitectureFlow[] = [...SUPPORT_FLOWS, ...ARCHITECTURE_FLOWS];
export const STUDIO_DESTINATIONS: Record<string, string> = {"conversation-api":"conversations", "ticket-api":"tickets", "studio-ui": "configuration", "support-query": "test", "support-context": "knowledge", "support-response": "test", "support-conversations": "conversations", "ticket-draft": "tickets", "support-tickets": "tickets", "support-handoff": "tickets", "workflow-receipts": "workflows", "workflow-engine": "workflows", "workflow-audit": "workflows"};
