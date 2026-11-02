import { GuidedDemoStep } from '../../models/guided-demo.model';

export const GUIDED_DEMO_STEPS: readonly GuidedDemoStep[] = [
  {
    id: 'introduction',
    title: 'Une IA utile, avec de la visibilité',
    businessExplanation: 'Les équipes veulent exploiter leurs documents et automatiser leurs formulaires sans perdre de vue la performance ni les coûts associés aux modèles.',
    technicalExplanation: 'Cette démonstration suit des parcours Angular et Express réellement présents. Les réponses et mesures montrées dans les fonctionnalités proviennent de leurs services réels; cette visite ne fabrique aucune donnée.',
    userInstruction: 'Parcourez les six étapes. L’état de visite reste dans cet onglet et n’est pas enregistré sur le serveur.',
    completionCriteria: 'Avoir consulté les objectifs et les limites de la démonstration.',
    liveAiCallMayBeRequired: false
  },
  {
    id: 'document-upload',
    title: 'Préparer un document',
    businessExplanation: 'Une équipe peut rendre un document interrogeable sans devoir le recopier dans chaque question.',
    technicalExplanation: 'Le Generator accepte un PDF ou un fichier texte. Le serveur extrait et découpe le texte, puis persiste les chunks et son index lexical SQLite FTS5. La portée de recherche peut être limitée au document actif. Aucun embedding vectoriel n’est utilisé.',
    userInstruction: 'Ouvrez le Generator dans un nouvel onglet. Si vous choisissez d’essayer l’ingestion, utilisez un fichier non sensible et vérifiez le résultat réel avant de confirmer cette étape. Aucun fichier n’est téléversé par la démo.',
    destinationRoute: '/generator',
    completionCriteria: 'Avoir ouvert le Generator et, si un document a été volontairement téléversé, vérifié son résultat dans cette interface.',
    liveAiCallMayBeRequired: false
  },
  {
    id: 'rag-question',
    title: 'Interroger le document avec ses sources',
    businessExplanation: 'Les collaborateurs peuvent poser une question ciblée et examiner les passages documentaires associés à la réponse.',
    technicalExplanation: 'Le serveur récupère lexicalement des chunks avec SQLite FTS5, applique la portée de document choisie et transmet le contexte à Groq. La réponse peut inclure des références de sources. La validation confirme l’identité des labels retrouvés, pas l’exactitude factuelle ni l’entailment.',
    userInstruction: 'Dans le Generator ouvert, saisissez vous-même une question sur votre document. Une requête Groq peut être déclenchée uniquement lorsque vous l’envoyez dans le chat existant.',
    destinationRoute: '/generator',
    completionCriteria: 'Avoir envoyé explicitement une question et observé la réponse et ses références dans le chat; ne confirmez que si vous l’avez réellement fait.',
    liveAiCallMayBeRequired: true
  },
  {
    id: 'form-generation',
    title: 'Transformer une demande en formulaire',
    businessExplanation: 'Une demande en langage naturel peut devenir une structure de saisie adaptée à un processus métier.',
    technicalExplanation: 'Le chat transmet la demande à la route dédiée de génération. Groq retourne un schéma structuré qu’Angular rend en formulaire réactif. Ce parcours ne lance pas automatiquement la recherche RAG.',
    userInstruction: 'Dans le Generator, demandez explicitement la création d’un formulaire. Examinez le formulaire généré, mais ne le soumettez pas avec des données personnelles.',
    destinationRoute: '/generator',
    completionCriteria: 'Avoir demandé explicitement un formulaire et vérifié qu’un schéma a été rendu, sans soumettre de données.',
    liveAiCallMayBeRequired: true
  },
  {
    id: 'ai-observability',
    title: 'Rendre les exécutions observables',
    businessExplanation: 'Les équipes d’exploitation ont besoin de comprendre la latence, l’usage des modèles et l’ordre de grandeur des coûts.',
    technicalExplanation: 'Le Dashboard peut afficher la latence, les tokens d’entrée et de sortie fournis par le modèle, les coûts estimés et un historique metadata-only. Les coûts sont calculés à partir des tarifs configurés et ne représentent pas la facturation réelle. La télémétrie est locale et dépend de la configuration serveur de démonstration; en son absence, l’interface doit indiquer que les mesures sont indisponibles.',
    userInstruction: 'Ouvrez le Dashboard dans un nouvel onglet et observez son état réel. Il peut afficher des métriques ou signaler honnêtement que la télémétrie locale n’est pas activée.',
    destinationRoute: '/dashboard',
    completionCriteria: 'Avoir consulté le Dashboard et constaté si ses métriques locales sont disponibles ou non.',
    liveAiCallMayBeRequired: false
  },
  {
    id: 'conclusion',
    title: 'De l’architecture à la valeur métier',
    businessExplanation: 'La valeur vient de parcours concrets: structurer des demandes, rechercher dans des documents et rendre l’usage IA compréhensible pour les équipes.',
    technicalExplanation: 'Le produit associe Angular 19, une API Express, Groq et SQLite: génération de formulaires, PDF RAG avec références de sources et observabilité opérationnelle. Les appels IA sont déclenchés par une action explicite dans les fonctionnalités existantes.',
    userInstruction: 'Faites le bilan des capacités présentes et distinguez-les des pistes futures.',
    completionCriteria: 'Avoir parcouru les capacités livrées et identifié les éléments encore planifiés.',
    liveAiCallMayBeRequired: false
  }
];