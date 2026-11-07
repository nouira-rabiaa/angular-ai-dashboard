import { GuidedDemoStep } from '../../models/guided-demo.model';

export const GUIDED_DEMO_STEPS: readonly GuidedDemoStep[] = [
  {
    id: 'introduction',
    title: "demo.une_ia_utile_avec_de_la_visibilite",
    businessExplanation: "demo.les_equipes_veulent_exploiter_leurs_documents_et",
    technicalExplanation: "demo.cette_demonstration_suit_des_parcours_angular_et",
    userInstruction: "demo.parcourez_les_six_etapes_l_etat_de",
    completionCriteria: "demo.avoir_consulte_les_objectifs_et_les_limites",
    liveAiCallMayBeRequired: false
  },
  {
    id: 'document-upload',
    title: "demo.preparer_un_document",
    businessExplanation: "demo.une_equipe_peut_rendre_un_document_interrogeable",
    technicalExplanation: "demo.le_generator_accepte_un_pdf_ou_un",
    userInstruction: "demo.ouvrez_le_generator_dans_un_nouvel_onglet",
    destinationRoute: '/generator',
    completionCriteria: "demo.avoir_ouvert_le_generator_et_si_un",
    liveAiCallMayBeRequired: false
  },
  {
    id: 'rag-question',
    title: "demo.interroger_le_document_avec_ses_sources",
    businessExplanation: "demo.les_collaborateurs_peuvent_poser_une_question_ciblee",
    technicalExplanation: "demo.le_serveur_recupere_lexicalement_des_chunks_avec",
    userInstruction: "demo.dans_le_generator_ouvert_saisissez_vous_meme",
    destinationRoute: '/generator',
    completionCriteria: "demo.avoir_envoye_explicitement_une_question_et_observe",
    liveAiCallMayBeRequired: true
  },
  {
    id: 'form-generation',
    title: "demo.transformer_une_demande_en_formulaire",
    businessExplanation: "demo.une_demande_en_langage_naturel_peut_devenir",
    technicalExplanation: "demo.le_chat_transmet_la_demande_a_la",
    userInstruction: "demo.dans_le_generator_demandez_explicitement_la_creation",
    destinationRoute: '/generator',
    completionCriteria: "demo.avoir_demande_explicitement_un_formulaire_et_verifie",
    liveAiCallMayBeRequired: true
  },
  {
    id: 'ai-observability',
    title: "demo.rendre_les_executions_observables",
    businessExplanation: "demo.les_equipes_d_exploitation_ont_besoin_de",
    technicalExplanation: "demo.le_dashboard_peut_afficher_la_latence_les",
    userInstruction: "demo.ouvrez_le_dashboard_dans_un_nouvel_onglet",
    destinationRoute: '/dashboard',
    completionCriteria: "demo.avoir_consulte_le_dashboard_et_constate_si",
    liveAiCallMayBeRequired: false
  },
  {
    id: 'conclusion',
    title: "demo.de_l_architecture_a_la_valeur_metier",
    businessExplanation: "demo.la_valeur_vient_de_parcours_concrets_structurer",
    technicalExplanation: "demo.le_produit_associe_angular_19_une_api",
    userInstruction: "demo.faites_le_bilan_des_capacites_presentes_et",
    completionCriteria: "demo.avoir_parcouru_les_capacites_livrees_et_identifie",
    liveAiCallMayBeRequired: false
  }
];

// Existing tour retained above; stable internal IDs preserve progress semantics.
export const STUDIO_DEMO_STEPS: readonly GuidedDemoStep[] = GUIDED_DEMO_STEPS.map((step, index) => ({
  ...step,
  title: `studioTour.steps.${index}.title`,
  businessExplanation: `studioTour.steps.${index}.value`,
  technicalExplanation: `studioTour.steps.${index}.technical`,
  userInstruction: `studioTour.steps.${index}.action`,
  completionCriteria: `studioTour.steps.${index}.observe`,
  destinationRoute: '/agent-workspace',
  destinationSpace: (['configuration', 'knowledge', 'test', 'conversations', 'tickets', 'workflows'] as const)[index],
  liveAiCallMayBeRequired: index === 2 || index === 3
}));
