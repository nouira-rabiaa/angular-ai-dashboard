import {
  ArchitectureEdge,
  ArchitectureFlow,
  ArchitectureLayer,
  ArchitectureNode
} from '../../models/architecture.model';

export const ARCHITECTURE_LAYERS: readonly ArchitectureLayer[] = [
  { id: 'client', name: "architecture.interface", summary: "architecture.parcours_utilisateur_angular" },
  { id: 'api', name: "architecture.api_applicative", summary: "architecture.orchestration_express" },
  { id: 'ai', name: "architecture.services_ia", summary: "architecture.appels_groq_et_outils_approuves" },
  { id: 'data', name: "architecture.donnees", summary: "architecture.sqlite_fts5_et_historique_metadata_only" }
];

export const ARCHITECTURE_NODES: readonly ArchitectureNode[] = [
  {
    id: 'chat-ui', name: "architecture.chat_ia", layerId: 'client', technology: 'Angular 19 · Signals',
    responsibility: "architecture.questions_rag_et_generation_de_schemas_de",
    description: "architecture.le_chat_conserve_le_document_actif_envoie"
  },
  {
    id: 'dynamic-form-ui', name: "architecture.formulaire_dynamique", layerId: 'client', technology: 'Angular Reactive Forms',
    responsibility: "architecture.rendu_du_schema_json_retourne_par_la",
    description: "architecture.le_schema_de_formulaire_est_rendu_dans"
  },
  {
    id: 'operations-dashboard-ui', name: "architecture.dashboard_local", layerId: 'client', technology: 'Angular · HttpClient',
    responsibility: "architecture.presentation_des_metriques_et_historiques_autorises_pour",
    description: "architecture.le_dashboard_lit_des_agregats_series_executions"
  },
  {
    id: 'express-form-api', name: "architecture.api_formulaires", layerId: 'api', technology: 'Express · POST /api/generate-form',
    responsibility: "architecture.demande_a_groq_un_schema_json_de",
    description: "architecture.le_serveur_construit_l_instruction_de_generation"
  },
  {
    id: 'express-submit-api', name: "architecture.api_soumissions", layerId: 'api', technology: 'Express · POST /api/submit-form',
    responsibility: "architecture.persiste_le_payload_soumis_dans_la_table",
    description: "architecture.les_valeurs_sont_stockees_dans_sqlite_le"
  },
  {
    id: 'express-rag-api', name: "architecture.api_chat_rag", layerId: 'api', technology: 'Express · POST /api/chat',
    responsibility: "architecture.valide_la_portee_recupere_les_chunks_fts5",
    description: "architecture.la_recherche_est_lexicale_sqlite_fts5_filtrable"
  },
  {
    id: 'express-document-api', name: "architecture.api_ingestion", layerId: 'api', technology: 'Express · Multer · pdf-parse',
    responsibility: "architecture.extrait_le_texte_recu_et_declenche_sa",
    description: "architecture.l_endpoint_de_parsing_retourne_notamment_documentid"
  },
  {
    id: 'express-agent-api', name: "architecture.api_agent", layerId: 'api', technology: 'Express · POST /api/agent/run',
    responsibility: "architecture.valide_le_but_execute_la_boucle_groq",
    description: "architecture.le_handler_agent_est_une_voie_independante"
  },
  {
    id: 'groq-form-model', name: "architecture.groq_generation", layerId: 'ai', technology: 'Groq Chat Completions',
    responsibility: "architecture.produit_le_schema_json_demande_par_le",
    description: "architecture.le_modele_utilise_par_la_route_de"
  },
  {
    id: 'groq-rag-model', name: "architecture.groq_reponse_rag", layerId: 'ai', technology: 'Groq Chat Completions',
    responsibility: "architecture.repond_aux_questions_a_partir_des_passages",
    description: "architecture.l_api_consomme_l_usage_fournisseur_quand"
  },
  {
    id: 'groq-agent-model', name: "architecture.groq_agent_interne", layerId: 'ai', technology: 'workspace.toolTechnology',
    responsibility: "architecture.choisit_uniquement_parmi_les_operations_de_lecture",
    description: "architecture.le_runner_borne_duree_iterations_et_nombre"
  },
  {
    id: 'sqlite-documents', name: "architecture.documents_et_fts5", layerId: 'data', technology: 'SQLite · better-sqlite3 · FTS5',
    responsibility: "architecture.conserve_metadonnees_de_documents_chunks_et_index",
    description: "architecture.les_chunks_sont_lies_a_un_document"
  },
  {
    id: 'sqlite-form-submissions', name: "architecture.soumissions", layerId: 'data', technology: 'SQLite · form_submissions',
    responsibility: "architecture.persiste_les_valeurs_de_formulaires_soumises",
    description: "architecture.le_payload_metier_est_conserve_dans_la"
  },
  {
    id: 'observability-runtime', name: "architecture.observabilite_rag", layerId: 'api', technology: 'workspace.telemetryTechnology',
    responsibility: "architecture.mesure_etapes_duree_totale_usage_fournisseur_et",
    description: "architecture.les_montants_sont_des_estimations_fondees_sur"
  },
  {
    id: 'sqlite-inference-history', name: "architecture.historique_d_execution", layerId: 'data', technology: 'SQLite · inference_history · inference_steps',
    responsibility: "architecture.persiste_les_seules_metadonnees_de_trace_et",
    description: "architecture.l_historique_ne_conserve_pas_prompts_reponses"
  },
  {
    id: 'agent-readonly-tools', name: "architecture.outils_approuves", layerId: 'api', technology: 'workspace.allowedToolsTechnology',
    responsibility: "architecture.compte_les_formulaires_et_lit_un_historique",
    description: "architecture.les_outils_sont_codes_cote_serveur_et"
  },
  {
    id: 'sqlite-dashboard-metadata', name: "architecture.metadonnees_dashboard", layerId: 'data', technology: 'SQLite · form_submissions · documents_history',
    responsibility: "architecture.alimente_les_outils_de_lecture_de_l",
    description: "architecture.la_voie_agent_lit_les_metadonnees_de"
  }
];

export const ARCHITECTURE_EDGES: readonly ArchitectureEdge[] = [
  { id: 'chat-generate-request', sourceNodeId: 'chat-ui', targetNodeId: 'express-form-api', connectionType: 'http', description: "architecture.post_api_generate_form_avec_la_demande" },
  { id: 'generate-inference', sourceNodeId: 'express-form-api', targetNodeId: 'groq-form-model', connectionType: 'inference', description: "architecture.appel_groq_pour_produire_un_schema_json" },
  { id: 'generate-schema-to-api', sourceNodeId: 'groq-form-model', targetNodeId: 'express-form-api', connectionType: 'response', description: "architecture.groq_retourne_le_schema_json_a_la" },
  { id: 'generate-schema-return', sourceNodeId: 'express-form-api', targetNodeId: 'dynamic-form-ui', connectionType: 'response', description: "architecture.express_retourne_le_schema_que_le_composant" },
  { id: 'form-submit-request', sourceNodeId: 'dynamic-form-ui', targetNodeId: 'express-submit-api', connectionType: 'http', description: "architecture.post_api_submit_form_avec_les_valeurs" },
  { id: 'form-submit-write', sourceNodeId: 'express-submit-api', targetNodeId: 'sqlite-form-submissions', connectionType: 'sql', description: "architecture.insertion_des_valeurs_dans_form_submissions" },
  { id: 'chat-rag-request', sourceNodeId: 'chat-ui', targetNodeId: 'express-rag-api', connectionType: 'http', description: "architecture.post_api_chat_avec_le_prompt_et" },
  { id: 'rag-retrieve', sourceNodeId: 'express-rag-api', targetNodeId: 'sqlite-documents', connectionType: 'sql', description: "architecture.recherche_lexicale_fts5_avec_filtre_documentid_lorsqu" },
  { id: 'rag-inference', sourceNodeId: 'express-rag-api', targetNodeId: 'groq-rag-model', connectionType: 'inference', description: "architecture.passages_retrouves_et_citations_candidates_fournis_a" },
  { id: 'rag-model-response', sourceNodeId: 'groq-rag-model', targetNodeId: 'express-rag-api', connectionType: 'response', description: "architecture.groq_retourne_le_texte_et_l_usage" },
  { id: 'rag-response', sourceNodeId: 'express-rag-api', targetNodeId: 'chat-ui', connectionType: 'response', description: "architecture.express_retourne_reponse_labels_valides_references_de" },
  { id: 'ingestion-write', sourceNodeId: 'express-document-api', targetNodeId: 'sqlite-documents', connectionType: 'sql', description: "architecture.persistance_des_metadonnees_chunks_et_mise_a" },
  { id: 'chat-observability', sourceNodeId: 'express-rag-api', targetNodeId: 'observability-runtime', connectionType: 'tool', description: "architecture.mesure_les_etapes_du_handler_usage_et" },
  { id: 'observability-persist', sourceNodeId: 'observability-runtime', targetNodeId: 'sqlite-inference-history', connectionType: 'sql', description: "architecture.ecrit_une_trace_metadata_only_et_ses" },
  { id: 'dashboard-history-read', sourceNodeId: 'sqlite-inference-history', targetNodeId: 'operations-dashboard-ui', connectionType: 'response', description: "architecture.endpoints_de_metriques_et_d_historique_local" },
  { id: 'agent-inference', sourceNodeId: 'express-agent-api', targetNodeId: 'groq-agent-model', connectionType: 'inference', description: "architecture.appel_groq_avec_outils_explicitement_declares_et" },
  { id: 'agent-tools', sourceNodeId: 'groq-agent-model', targetNodeId: 'agent-readonly-tools', connectionType: 'tool', description: "architecture.seuls_les_noms_et_arguments_de_la" },
  { id: 'agent-metadata-query', sourceNodeId: 'agent-readonly-tools', targetNodeId: 'sqlite-dashboard-metadata', connectionType: 'sql', description: "architecture.lectures_bornees_de_compteurs_et_d_historique" },
];

export const ARCHITECTURE_FLOWS: readonly ArchitectureFlow[] = [
  {
    id: 'form-generation', title: "architecture.generation_de_formulaires",
    purpose: "architecture.transformer_une_demande_en_schema_de_formulaire",
    nodeIds: ['chat-ui', 'express-form-api', 'groq-form-model', 'dynamic-form-ui', 'express-submit-api', 'sqlite-form-submissions'],
    edgeIds: ['chat-generate-request', 'generate-inference', 'generate-schema-to-api', 'generate-schema-return', 'form-submit-request', 'form-submit-write'],
    steps: [
      { title: "architecture.demande", explanation: "architecture.le_chat_detecte_la_demande_de_generation" },
      { title: "architecture.schema_ia", explanation: "architecture.express_sollicite_groq_avec_une_consigne_json" },
      { title: "architecture.rendu_angular", explanation: "architecture.le_schema_recu_est_transforme_en_controles" },
      { title: "architecture.soumission", explanation: "architecture.a_l_envoi_express_stocke_les_valeurs" }
    ]
  },
  {
    id: 'pdf-rag', title: "architecture.pdf_rag_et_citations",
    purpose: "architecture.retrouver_des_passages_lexicalement_dans_un_document",
    nodeIds: ['chat-ui', 'express-rag-api', 'sqlite-documents', 'groq-rag-model'],
    edgeIds: ['chat-rag-request', 'rag-retrieve', 'rag-inference', 'rag-model-response', 'rag-response'],
    steps: [
      { title: "architecture.question_et_scope", explanation: "architecture.angular_transmet_la_question_et_en_mode" },
      { title: "architecture.recherche_sqlite_fts5", explanation: "architecture.la_requete_fts5_filtre_les_chunks_sur" },
      { title: "architecture.inference", explanation: "architecture.les_passages_retrouves_sont_envoyes_a_groq" },
      { title: "architecture.reponse_verifiable", explanation: "architecture.le_serveur_valide_que_les_labels_cites" }
    ]
  },
  {
    id: 'rag-observability', title: "architecture.observabilite_ia",
    purpose: "architecture.mesurer_les_requetes_rag_et_conserver_une",
    nodeIds: ['express-rag-api', 'observability-runtime', 'sqlite-inference-history', 'operations-dashboard-ui'],
    edgeIds: ['chat-observability', 'observability-persist', 'dashboard-history-read'],
    steps: [
      { title: "architecture.mesures", explanation: "architecture.le_handler_mesure_la_validation_la_recherche" },
      { title: "architecture.usage_et_cout", explanation: "architecture.les_tokens_viennent_de_l_usage_fournisseur" },
      { title: "architecture.historique_metadata_only", explanation: "architecture.sqlite_conserve_trace_id_statut_scope_compteurs" },
      { title: "architecture.vue_locale", explanation: "architecture.le_dashboard_agrege_ces_metadonnees_derriere_le" }
    ]
  },
  {
    id: 'agent-workspace', title: "architecture.moteur_interne_outils",
    purpose: "architecture.module_backend_local_conserve_pour_5e_sans",
    nodeIds: ['express-agent-api', 'groq-agent-model', 'agent-readonly-tools', 'sqlite-dashboard-metadata'],
    edgeIds: ['agent-inference', 'agent-tools', 'agent-metadata-query'],
    steps: [
      { title: "architecture.objectif", explanation: "architecture.un_appel_technique_local_autorise_peut_transmettre" },
      { title: "architecture.outils_limites", explanation: "architecture.groq_ne_peut_demander_que_le_comptage" },
      { title: "architecture.validation_serveur", explanation: "architecture.le_runner_valide_les_noms_arguments_limites" },
      { title: "architecture.resultat", explanation: "architecture.le_backend_retourne_a_l_appelant_technique" }
    ]
  }
];
