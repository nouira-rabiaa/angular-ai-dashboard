import {
  ArchitectureEdge,
  ArchitectureFlow,
  ArchitectureLayer,
  ArchitectureNode
} from '../../models/architecture.model';

export const ARCHITECTURE_LAYERS: readonly ArchitectureLayer[] = [
  { id: 'client', name: 'Interface', summary: 'Parcours utilisateur Angular' },
  { id: 'api', name: 'API applicative', summary: 'Orchestration Express' },
  { id: 'ai', name: 'Services IA', summary: 'Appels Groq et outils approuvés' },
  { id: 'data', name: 'Données', summary: 'SQLite, FTS5 et historique metadata-only' }
];

export const ARCHITECTURE_NODES: readonly ArchitectureNode[] = [
  {
    id: 'chat-ui', name: 'Chat IA', layerId: 'client', technology: 'Angular 19 · Signals',
    responsibility: 'Questions RAG et génération de schémas de formulaires.',
    description: 'Le chat conserve le document actif, envoie le scope choisi et affiche réponses, citations et détails d’exécution. La génération de formulaires est un parcours distinct.'
  },
  {
    id: 'dynamic-form-ui', name: 'Formulaire dynamique', layerId: 'client', technology: 'Angular Reactive Forms',
    responsibility: 'Rendu du schéma JSON retourné par la génération IA.',
    description: 'Le schéma de formulaire est rendu dans Angular puis soumis séparément. La génération ne lance pas automatiquement la recherche RAG.'
  },
  {
    id: 'agent-workspace-ui', name: 'Agent Workspace', layerId: 'client', technology: 'Angular standalone',
    responsibility: 'Interface séparée pour les requêtes agent sur les métadonnées du tableau de bord.',
    description: 'Cette interface utilise le parcours agent et ses outils en lecture seule. Elle n’est pas le chat RAG et ne reçoit pas les chunks documentaires.'
  },
  {
    id: 'operations-dashboard-ui', name: 'Dashboard local', layerId: 'client', technology: 'Angular · HttpClient',
    responsibility: 'Présentation des métriques et historiques autorisés pour la démo locale.',
    description: 'Le dashboard lit des agrégats, séries, exécutions, documents et métadonnées de soumissions. Les endpoints de télémétrie sont restreints au mode démo local.'
  },
  {
    id: 'express-form-api', name: 'API formulaires', layerId: 'api', technology: 'Express · POST /api/generate-form',
    responsibility: 'Demande à Groq un schéma JSON de formulaire.',
    description: 'Le serveur construit l’instruction de génération structurée et retourne le schéma à Angular. Le contexte RAG n’est pas ajouté automatiquement par le client actuel.'
  },
  {
    id: 'express-submit-api', name: 'API soumissions', layerId: 'api', technology: 'Express · POST /api/submit-form',
    responsibility: 'Persiste le payload soumis dans la table métier des formulaires.',
    description: 'Les valeurs sont stockées dans SQLite. Le Dashboard n’en expose que les métadonnées par défaut; l’API de soumission existante retourne encore les données au client émetteur.'
  },
  {
    id: 'express-rag-api', name: 'API Chat RAG', layerId: 'api', technology: 'Express · POST /api/chat',
    responsibility: 'Valide la portée, récupère les chunks FTS5, appelle Groq et construit les références de sources.',
    description: 'La recherche est lexicale SQLite FTS5, filtrable par documentId. Les libellés de citation identifient les sources retrouvées, sans prouver l’exactitude factuelle.'
  },
  {
    id: 'express-document-api', name: 'API ingestion', layerId: 'api', technology: 'Express · Multer · pdf-parse',
    responsibility: 'Extrait le texte reçu et déclenche sa persistance/indexation.',
    description: 'L’endpoint de parsing retourne notamment documentId, nom de fichier, texte extrait et nombre de chunks au client qui a envoyé le document.'
  },
  {
    id: 'express-agent-api', name: 'API Agent', layerId: 'api', technology: 'Express · POST /api/agent/run',
    responsibility: 'Valide le but, exécute la boucle Groq et limite les appels aux outils approuvés.',
    description: 'Le handler Agent est une voie indépendante du chat RAG. Il n’effectue ni recherche FTS5 ni génération de citations documentaires.'
  },
  {
    id: 'groq-form-model', name: 'Groq · génération', layerId: 'ai', technology: 'Groq Chat Completions',
    responsibility: 'Produit le schéma JSON demandé par le générateur.',
    description: 'Le modèle utilisé par la route de formulaire est actuellement configuré côté serveur; ce flux ne reçoit pas automatiquement le document actif du chat.'
  },
  {
    id: 'groq-rag-model', name: 'Groq · réponse RAG', layerId: 'ai', technology: 'Groq Chat Completions',
    responsibility: 'Répond aux questions à partir des passages retrouvés et reçoit les labels de sources.',
    description: 'L’API consomme l’usage fournisseur quand disponible. Elle peut utiliser un modèle de secours; l’exécution indique le modèle effectivement utilisé.'
  },
  {
    id: 'groq-agent-model', name: 'Groq · agent', layerId: 'ai', technology: 'Tool calling · raisonnement masqué',
    responsibility: 'Choisit uniquement parmi les opérations de lecture définies par Agent Workspace.',
    description: 'Le runner borne durée, itérations et nombre d’appels; des demandes d’outils non autorisées sont rejetées.'
  },
  {
    id: 'sqlite-documents', name: 'Documents et FTS5', layerId: 'data', technology: 'SQLite · better-sqlite3 · FTS5',
    responsibility: 'Conserve métadonnées de documents, chunks et index lexical persistant.',
    description: 'Les chunks sont liés à un document, recherchés lexicalement par FTS5 et filtrés dans SQL par documentId lorsqu’un scope de document est demandé. Aucun embedding vectoriel n’est utilisé.'
  },
  {
    id: 'sqlite-form-submissions', name: 'Soumissions', layerId: 'data', technology: 'SQLite · form_submissions',
    responsibility: 'Persiste les valeurs de formulaires soumises.',
    description: 'Le payload métier est conservé dans la base. Il ne doit pas être exposé dans les vues publiques d’architecture ou de démonstration.'
  },
  {
    id: 'observability-runtime', name: 'Observabilité RAG', layerId: 'api', technology: 'performance.now · usage Groq · configuration tarifaire',
    responsibility: 'Mesure étapes, durée totale, usage fournisseur et coût estimé configurable.',
    description: 'Les montants sont des estimations fondées sur les tarifs configurés, non des factures. Les valeurs d’usage absentes restent indisponibles.'
  },
  {
    id: 'sqlite-inference-history', name: 'Historique d’exécution', layerId: 'data', technology: 'SQLite · inference_history · inference_steps',
    responsibility: 'Persiste les seules métadonnées de trace et les durées des étapes.',
    description: 'L’historique ne conserve pas prompts, réponses, extraits documentaires, payloads, clés ou en-têtes.'
  },
  {
    id: 'agent-readonly-tools', name: 'Outils approuvés', layerId: 'api', technology: 'Liste blanche · SQL paramétré',
    responsibility: 'Compte les formulaires et lit un historique limité sans retourner les payloads ou noms de fichiers.',
    description: 'Les outils sont codés côté serveur et n’acceptent pas de SQL arbitraire. Leur retour est constitué de métadonnées autorisées.'
  },
  {
    id: 'sqlite-dashboard-metadata', name: 'Métadonnées Dashboard', layerId: 'data', technology: 'SQLite · form_submissions · documents_history',
    responsibility: 'Alimente les outils de lecture de l’Agent avec compteurs et métadonnées d’historique.',
    description: 'La voie Agent lit les métadonnées de soumission et de document; elle ne lit pas le contenu des documents ni les payloads de formulaires.'
  }
];

export const ARCHITECTURE_EDGES: readonly ArchitectureEdge[] = [
  { id: 'chat-generate-request', sourceNodeId: 'chat-ui', targetNodeId: 'express-form-api', connectionType: 'http', description: 'POST /api/generate-form avec la demande de génération.' },
  { id: 'generate-inference', sourceNodeId: 'express-form-api', targetNodeId: 'groq-form-model', connectionType: 'inference', description: 'Appel Groq pour produire un schéma JSON.' },
  { id: 'generate-schema-to-api', sourceNodeId: 'groq-form-model', targetNodeId: 'express-form-api', connectionType: 'response', description: 'Groq retourne le schéma JSON à la route Express.' },
  { id: 'generate-schema-return', sourceNodeId: 'express-form-api', targetNodeId: 'dynamic-form-ui', connectionType: 'response', description: 'Express retourne le schéma que le composant Angular rend.' },
  { id: 'form-submit-request', sourceNodeId: 'dynamic-form-ui', targetNodeId: 'express-submit-api', connectionType: 'http', description: 'POST /api/submit-form avec les valeurs soumises.' },
  { id: 'form-submit-write', sourceNodeId: 'express-submit-api', targetNodeId: 'sqlite-form-submissions', connectionType: 'sql', description: 'Insertion des valeurs dans form_submissions.' },
  { id: 'chat-rag-request', sourceNodeId: 'chat-ui', targetNodeId: 'express-rag-api', connectionType: 'http', description: 'POST /api/chat avec le prompt et le scope de document facultatif.' },
  { id: 'rag-retrieve', sourceNodeId: 'express-rag-api', targetNodeId: 'sqlite-documents', connectionType: 'sql', description: 'Recherche lexicale FTS5 avec filtre documentId lorsqu’il est fourni.' },
  { id: 'rag-inference', sourceNodeId: 'express-rag-api', targetNodeId: 'groq-rag-model', connectionType: 'inference', description: 'Passages retrouvés et citations candidates fournis à Groq.' },
  { id: 'rag-model-response', sourceNodeId: 'groq-rag-model', targetNodeId: 'express-rag-api', connectionType: 'response', description: 'Groq retourne le texte et l’usage fournisseur à la route Express.' },
  { id: 'rag-response', sourceNodeId: 'express-rag-api', targetNodeId: 'chat-ui', connectionType: 'response', description: 'Express retourne réponse, labels validés, références de sources et métadonnées d’exécution.' },
  { id: 'ingestion-write', sourceNodeId: 'express-document-api', targetNodeId: 'sqlite-documents', connectionType: 'sql', description: 'Persistance des métadonnées/chunks et mise à jour de FTS5.' },
  { id: 'chat-observability', sourceNodeId: 'express-rag-api', targetNodeId: 'observability-runtime', connectionType: 'tool', description: 'Mesure les étapes du handler, usage et estimation tarifaire.' },
  { id: 'observability-persist', sourceNodeId: 'observability-runtime', targetNodeId: 'sqlite-inference-history', connectionType: 'sql', description: 'Écrit une trace metadata-only et ses étapes ordonnées.' },
  { id: 'dashboard-history-read', sourceNodeId: 'sqlite-inference-history', targetNodeId: 'operations-dashboard-ui', connectionType: 'response', description: 'Endpoints de métriques et d’historique local-only.' },
  { id: 'agent-request', sourceNodeId: 'agent-workspace-ui', targetNodeId: 'express-agent-api', connectionType: 'http', description: 'POST /api/agent/run avec un but utilisateur.' },
  { id: 'agent-inference', sourceNodeId: 'express-agent-api', targetNodeId: 'groq-agent-model', connectionType: 'inference', description: 'Appel Groq avec outils explicitement déclarés et limites d’exécution.' },
  { id: 'agent-tools', sourceNodeId: 'groq-agent-model', targetNodeId: 'agent-readonly-tools', connectionType: 'tool', description: 'Seuls les noms et arguments de la liste blanche sont exécutés.' },
  { id: 'agent-metadata-query', sourceNodeId: 'agent-readonly-tools', targetNodeId: 'sqlite-dashboard-metadata', connectionType: 'sql', description: 'Lectures bornées de compteurs et d’historique metadata-only.' },
  { id: 'agent-result', sourceNodeId: 'express-agent-api', targetNodeId: 'agent-workspace-ui', connectionType: 'response', description: 'Réponse finale et trace des outils exécutés.' }
];

export const ARCHITECTURE_FLOWS: readonly ArchitectureFlow[] = [
  {
    id: 'form-generation', title: 'Génération de formulaires',
    purpose: 'Transformer une demande en schéma de formulaire, puis enregistrer les valeurs soumises.',
    nodeIds: ['chat-ui', 'express-form-api', 'groq-form-model', 'dynamic-form-ui', 'express-submit-api', 'sqlite-form-submissions'],
    edgeIds: ['chat-generate-request', 'generate-inference', 'generate-schema-to-api', 'generate-schema-return', 'form-submit-request', 'form-submit-write'],
    steps: [
      { title: 'Demande', explanation: 'Le chat détecte la demande de génération et l’envoie à la route dédiée.' },
      { title: 'Schéma IA', explanation: 'Express sollicite Groq avec une consigne JSON structurée; la génération n’utilise pas automatiquement la recherche RAG.' },
      { title: 'Rendu Angular', explanation: 'Le schéma reçu est transformé en contrôles réactifs Angular.' },
      { title: 'Soumission', explanation: 'À l’envoi, Express stocke les valeurs dans SQLite; ces données métier restent privées.' }
    ]
  },
  {
    id: 'pdf-rag', title: 'PDF RAG et citations',
    purpose: 'Retrouver des passages lexicalement dans un document choisi et fournir des sources traçables.',
    nodeIds: ['chat-ui', 'express-rag-api', 'sqlite-documents', 'groq-rag-model'],
    edgeIds: ['chat-rag-request', 'rag-retrieve', 'rag-inference', 'rag-model-response', 'rag-response'],
    steps: [
      { title: 'Question et scope', explanation: 'Angular transmet la question et, en mode document actif, son documentId.' },
      { title: 'Recherche SQLite FTS5', explanation: 'La requête FTS5 filtre les chunks sur le document choisi, ou interroge tous les documents si ce mode a été sélectionné.' },
      { title: 'Inférence', explanation: 'Les passages retrouvés sont envoyés à Groq avec des labels de citation locaux à la requête.' },
      { title: 'Réponse vérifiable', explanation: 'Le serveur valide que les labels cités existent parmi les sources retrouvées; cela ne prouve pas l’exactitude factuelle de la réponse.' }
    ]
  },
  {
    id: 'rag-observability', title: 'Observabilité IA',
    purpose: 'Mesurer les requêtes RAG et conserver une trace opérationnelle sans contenu privé.',
    nodeIds: ['express-rag-api', 'observability-runtime', 'sqlite-inference-history', 'operations-dashboard-ui'],
    edgeIds: ['chat-observability', 'observability-persist', 'dashboard-history-read'],
    steps: [
      { title: 'Mesures', explanation: 'Le handler mesure la validation, la recherche, la préparation de contexte et les appels Groq.' },
      { title: 'Usage et coût', explanation: 'Les tokens viennent de l’usage fournisseur lorsqu’il est disponible; le coût est une estimation selon les tarifs configurés, pas une facture.' },
      { title: 'Historique metadata-only', explanation: 'SQLite conserve trace ID, statut, scope, compteurs, usage nullable, coûts estimés et durées ordonnées; aucun prompt, réponse ou extrait.' },
      { title: 'Vue locale', explanation: 'Le Dashboard agrège ces métadonnées derrière le mode de démonstration local.' }
    ]
  },
  {
    id: 'agent-workspace', title: 'Agent Workspace',
    purpose: 'Répondre à des questions de tableau de bord via des outils de lecture strictement approuvés.',
    nodeIds: ['agent-workspace-ui', 'express-agent-api', 'groq-agent-model', 'agent-readonly-tools', 'sqlite-dashboard-metadata'],
    edgeIds: ['agent-request', 'agent-inference', 'agent-tools', 'agent-metadata-query', 'agent-result'],
    steps: [
      { title: 'Objectif', explanation: 'Angular transmet le but à /api/agent/run; ce parcours ne passe pas par le chat RAG.' },
      { title: 'Outils limités', explanation: 'Groq ne peut demander que le comptage des soumissions ou la lecture d’un historique metadata-only borné.' },
      { title: 'Validation serveur', explanation: 'Le runner valide les noms/arguments, limites le temps, les itérations et le nombre d’appels; les outils arbitraires sont rejetés.' },
      { title: 'Résultat', explanation: 'L’Agent Workspace reçoit la réponse et la trace d’outils, sans noms de fichiers ni payloads.' }
    ]
  }
];
