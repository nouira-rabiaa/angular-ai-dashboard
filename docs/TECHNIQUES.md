🔬 Modern Techniques & AI Stack Deep Dive
Ce document expose en détail les choix techniques, le pipeline RAG lexical et les briques d’intelligence artificielle effectivement utilisés dans l'Enterprise AI Dashboard par Rabiaa NOUIRA.
1. Schéma Global du Pipeline IA & Data Flow
Le schéma ci-dessous retrace le parcours d'une requête et l'interaction entre le front-end, le BFF, la recherche SQLite FTS5 et l’API Groq :

+-----------------------------------------------------------------------------------------+
|                                    CLIENT (BROWSER)                                     |
|                                  Angular 19 Standalone                                  |
|   +--------------------------+                         +----------------------------+   |
|   |    Services HTTP Angular |                         |  Signals State Management  |   |
|   |  - Upload / Chat / Forms |                         |  - Defensive UI (Loading)  |   |
|   +--------------------------+                         +----------------------------+   |
+-----------------------------------------------------------------------------------------+
             |                                                         |
             | 1. Requête / Upload de fichiers (Multipart via Multer)  | 2. Rendu de Formulaire Dynamique
             v                                                         v
+-----------------------------------------------------------------------------------------+
|                              BFF BACK-END (Node.js / Express)                           |
|   +--------------------------+                         +----------------------------+   |
|   |        tiktoken          |                         | Better-SQLite3             |   |
|   | - Comptage /api/tokens   |                         | - Prepared Statements      |   |
|   +--------------------------+                         +----------------------------+   |
+-----------------------------------------------------------------------------------------+
             |                                                         |
             v                                                         v
+-----------------------------------+                     +-------------------------------+
|       RAG LEXICAL / GROQ          |                     |     PERSISTENCE & SECURITY    |
|  - Segments de 400 caractères      |                     |  - Stockage structuré local   |
|  - SQLite FTS5 / classement BM25   |                     |  - Paramètres SQL liés       |
+-----------------------------------+                     +-------------------------------+
2. Analyse Détaillée des Techniques & Avantages Métiers
A. Pipeline RAG (Retrieval-Augmented Generation) & Recherche Lexicale
Le Principe : Le RAG ajoute à la question des passages retrouvés dans les documents persistés. Ces éléments peuvent aider le modèle à produire une réponse documentée, mais ne suppriment pas les hallucinations et ne garantissent ni la pertinence des passages ni l’exactitude de la réponse. Le parcours implémenté est lexical : aucun embedding, base vectorielle ou moteur de similarité cosinus n’est utilisé.
Ingestion et Chunking : POST /api/document/parse accepte un PDF, TXT ou CSV via Multer (10 MiB maximum). pdf-parse extrait le texte des PDF; TXT et CSV sont lus en UTF-8. Aucun OCR ni parsing tabulaire CSV n’est effectué. Le texte est découpé en segments de 400 caractères maximum, sans chevauchement, par page PDF lorsque disponible. Les numéros de page et offsets sont conservés quand calculables; ils peuvent être absents. Une empreinte SHA-256 du fichier évite de réindexer un contenu binaire identique. Métadonnées, passages et index FTS5 persistent dans SQLite.
Recherche et Classement BM25 :
Fonctionnement : La question fournit jusqu’à 32 termes distincts (lettres, chiffres et underscore), cités et réunis par OR pour FTS5 MATCH. L’index utilise unicode61. Les résultats sont triés par bm25(document_chunks_fts) croissant, puis par identifiant de chunk. /api/chat conserve au plus quatre passages. Le classement est lexical, pas une probabilité, un pourcentage de confiance ou une similarité sémantique. Le filtre SQL documentId limite la recherche au document actif; une portée all recherche tous les documents indexés. Un identifiant invalide ou inexistant est rejeté avant l’appel Groq.
Assemblage du contexte et génération : Le serveur attribue les labels S1 à S4 aux passages retrouvés et borne chaque extrait à 1 200 caractères. Il assemble noms de fichiers, pages disponibles et extraits dans le message système, avec une consigne de citer [S1] et d’ignorer les instructions contenues dans les documents. Groq reçoit ce contexte et la question; le handler tente plusieurs modèles en cas d’erreur et conserve l’identifiant effectivement utilisé. Sans passage, le système demande une réponse générale sans attribution documentaire. Ce parcours n’envoie pas automatiquement l’historique complet de la conversation.
Citations et UI : Le Chat affiche les extraits, fichiers, pages disponibles et états cité/non cité. Le serveur rapproche les marqueurs [S1] ou 【S1】 des labels disponibles, normalise les marqueurs valides et signale les labels inconnus. sourceIdentityValidated vaut true, mais factualEntailmentValidated vaut false : la correspondance d’un label ne valide pas le contenu d’une affirmation. vectorMeta reste null, sans badge de similarité calculé. Certains anciens libellés de chargement et d’upload parlent encore de vectorisation; ils ne décrivent pas le mécanisme exécuté.
B. Observabilité & FinOps en Temps Réel
Le Contexte : En milieu professionnel, l'utilisation d'APIs d'IA génère des coûts variables qu'il est impératif de surveiller pour éviter les dérives budgétaires.
Indicateurs clés du Dashboard :
Latence Moyenne (ms) : Moyenne des total_duration_ms des traces /api/chat persistées sur la période sélectionnée. Les durées sont mesurées avec performance.now() côté Node.js : validation, récupération FTS5, préparation du contexte et appel Groq, y compris les tentatives de repli. Le total est arrêté avant la persistance de la trace et l’envoi HTTP; il exclut le réseau navigateur/BFF et le rendu Angular. Ce n’est donc pas une latence navigateur de bout en bout.
Consommation de Tokens : Les champs prompt_tokens, completion_tokens et total_tokens retournés par Groq alimentent inputTokens, outputTokens et totalTokens. Les valeurs absentes ou invalides restent null; usage.source distingue provider et unavailable. Le code n’invente pas de comptage à partir de la longueur du texte. Les agrégats SQL additionnent les valeurs disponibles; une couverture partielle n’est pas un total complet de consommation.
Coût Estimé (USD) : GROQ_MODEL_PRICING doit fournir, pour l’identifiant exact du modèle, des tarifs positifs par million de tokens d’entrée et de sortie. Le calcul est (tokens d’entrée × tarif d’entrée + tokens de sortie × tarif de sortie) / 1 000 000. Sans tarifs valides ou sans les deux usages fournisseur, le résultat reste null avec un motif d’indisponibilité. Il s’agit d’une estimation, pas d’un montant facturé; les coûts éventuels des tentatives ayant échoué ne sont pas totalisés. Le Dashboard additionne seulement les requêtes tarifées et affiche la couverture tarifée/non tarifée.
États d’exécution : Le Dashboard présente les comptes success, no_match et error. Pour une réponse générée, success signifie que des sources ont été retrouvées; no_match signifie qu’aucun passage n’a été retrouvé. Ces états ne prouvent ni l’exactitude de la réponse ni la disponibilité globale du fournisseur. L’historique concerne /api/chat, pas automatiquement les appels de génération de formulaires, du moteur interne à outils ou du test documentaire du Studio.
Persistance : inference_history et inference_steps conservent les métadonnées et durées, sans prompts, réponses ou extraits. Un échec de persistance ne bloque pas la réponse du chat. Les endpoints de télémétrie nécessitent DASHBOARD_TELEMETRY_LOCAL_ONLY=true et une connexion loopback; la démonstration n’a pas d’authentification utilisateur.
C. Optimisation & IA Embarquée (tiktoken & Transformers.js)
tiktoken (Audit & Précision) :
Utilité : L’endpoint séparé POST /api/tokens compte le texte fourni avec encoding_for_model('gpt-4o'). Ce résultat dépend de cet encodeur; il ne prouve pas le nombre de tokens consommés par les autres modèles. /api/chat ne l’utilise ni pour compter automatiquement le contexte avant inférence ni pour calculer ses coûts : ceux-ci reposent sur l’usage retourné par Groq.
Transformers.js (Client-Side ML) :
État du code : SentimentService contient une pipeline Transformers.js de sentiment-analysis avec un modèle DistilBERT, chargée à la demande via initModel(). Aucun consommateur de ce service n’est présent dans les parcours actuels. Sa présence dans les dépendances ne démontre pas une exécution active de ML, WASM ou WebGPU dans l’interface.
Limite : Ce service ne produit pas d’embeddings documentaires et ne participe ni à l’ingestion ni à la recherche FTS5. Aucun gain de latence ou de coût lié à son exécution n’est mesuré ici.
D. Génération Dynamique & UI Défensive
Dynamic Form Generation :
Fonctionnement : Le Chat dirige les demandes reconnues comme formulaires vers POST /api/generate-form. Cette route demande un schéma JSON à Groq, retire les balises de code éventuelles et parse le JSON. DynamicFormComponent crée les FormControl et les validateurs required à partir des champs reçus. Une réponse JSON parsée n’équivaut pas à une validation complète du schéma. La soumission passe séparément par /api/submit-form. Le client envoie seulement le prompt à la génération : il n’ajoute pas automatiquement les passages RAG, même si la route accepte un ragContext optionnel.
UI/UX Défensive (Double-Click Prevention) :
Fonctionnement : Le Chat vérifie isLoading avant l’envoi, désactive son bouton pendant l’appel et remet cet état à false dans les callbacks next et error. Les callbacks d’upload gèrent séparément isUploadingDoc. Le Studio utilise ses états de sauvegarde/génération pour bloquer les doubles actions ; les brouillons de configuration et documentaires restent protégés.
Avantage et limite : Ces gardes réduisent les doubles envois pendant une requête en cours. Elles ne garantissent pas la libération de l’interface pour une requête qui ne termine jamais et ne constituent pas une garantie générale d’idempotence.
Références de code : [ingestion et FTS5](../server/document-store.js), [contexte et citations](../server/chat-handler.js), [mesures et coûts](../server/observability.js), [agrégats Dashboard](../server/dashboard-routes.js), [routes BFF](../server/index.js), [Chat Angular](../client/src/app/components/chat/chat.component.ts), [formulaires](../client/src/app/components/dynamic-form/dynamic-form.component.ts), [service de sentiment non consommé](../client/src/app/services/sentiment.service.ts).

E. Prévision des coûts et simulation budgétaire
La prévision utilise une moyenne des coûts estimés sur au plus 30 jours UTC terminés, avec au moins 7 jours calendaires, 10 requêtes tarifées et 3 jours actifs. Toute trace non chiffrable de l’échantillon empêche l’extrapolation. Le rythme moyen est multiplié par 7 ou 30; l’estimation de fin de mois utilise le calendrier civil et ajuste la journée courante sans double comptage. Ces hypothèses ne modélisent ni croissance ni saisonnalité.
Le simulateur utilise exclusivement les tarifs valides de GROQ_MODEL_PRICING et les tokens moyens saisis. Le budget partagé est persisté dans SQLite; les alertes à 80/100 % différencient sous-total observé estimé et projection. Une couverture partielle ne prouve pas le respect du budget. Les formules, limites, bornes et instructions se trouvent dans [FINOPS](FINOPS.md). Le calcul FinOps ne déclenche aucun service externe ou agent de support client.


<a id="phase-5a--configuration-persistante-des-agents"></a>

## Configuration des agents — Configuration persistante des agents

La route Angular existante `/agent-workspace` héberge uniquement Support Agent Studio ; le runner d'exploitation reste un module backend séparé, sans interface. `AgentService` ajoute les opérations de catalogue/configuration ; les Reactive Forms et Signals gèrent les brouillons et états asynchrones. La migration additive `003_support_agents.sql` et les routes locales `/api/agents` persistent les configurations, avec validation stricte et contrôle de version contre l'écrasement d'une édition concurrente.

La sauvegarde d’une configuration n’effectue aucun appel Groq. Les statuts actif/inactif ne constituent pas un déploiement. Base documentaire des agents, test documentaire, gestion des conversations et transfert local à un opérateur sont décrits dans leurs sections dédiées ; le RAG FTS5/BM25 et les calculs FinOps existants sont inchangés. Aucune authentification ou isolation multi-tenant n'est ajoutée. Détails : [Support Agent Studio](PHASE5_SUPPORT_AGENT.md).


<a id="phase-5b--rag-de-support-à-périmètre-documentaire-explicite"></a>

## Base documentaire des agents — RAG de support à périmètre documentaire explicite

Support Agent Studio conserve Configuration et ajoute Knowledge Base / Tester l'agent. La migration additive `004_support_agent_documents.sql` relie les configurations aux documents existants, sans copie de chunks ni nouvel index. Les associations sont modifiées atomiquement ; la recherche FTS5/BM25 partagée filtre dans SQL via cette table avant classement et limite. Une portée vide ne devient jamais une recherche globale.

`POST /api/agents/:id/ask` est indépendant de `/api/chat` et de l'ancien `/api/agent/run`. Il utilise la configuration persistée et active, des instructions serveur prioritaires, un contexte autorisé borné, les utilitaires de citations partagés et un délai fournisseur. Sans contexte lexical suffisant, sans référence valide ou lorsque le modèle s'abstient, seule l'abstention avec le message de secours est renvoyée. La qualité sémantique et l'entailment ne sont pas évalués automatiquement ; des citations valides ne garantissent pas l'exactitude de chaque affirmation. Les nouvelles réponses ne sont pas ajoutées à l'historique RAG/FinOps ; l'agrégation par agent reste future. Détails et limites : [Support Agent Studio](PHASE5_SUPPORT_AGENT.md).


## Nettoyage de l'ancienne interface Agent Workspace

L'UI « Outils d'exploitation » et ses dépendances frontend exclusives ont été supprimées : ancien template/SCSS, modèle `agent-run.model.ts` et méthode HTTP `AgentService.run()`. Le composant de route `AgentWorkspaceComponent` reste une coquille minimale de Support Agent Studio : pas de seconde route ou moteur. Configuration, Knowledge Base, Tester l'agent et leurs protections de brouillons sont conservés. Les conversations persistantes sont désormais disponibles ; le diagnostic initial est conservé dans le document historique de suivi.

`server/agent.js` conserve la boucle Groq, les deux outils en lecture seule (`count_form_submissions`, `get_dashboard_history`), la validation stricte, les bornes et les traces. `/api/agent/run` reste disponible **uniquement** derrière le garde loopback et `DASHBOARD_TELEMETRY_LOCAL_ONLY=true`, en plus de la politique CORS. Ce durcissement peut nécessiter l'opt-in pour d'anciens clients techniques ; aucune interface Angular ne l'appelle désormais. Il ne s'agit pas d'une authentification, ni d'une autorisation par utilisateur. Ne pas exposer le serveur via un proxy public.

Architecture Explorer distingue ce moteur interne sans interface ; les anciens liens UI→API et API→UI ont été retirés. Guided Demo ne le présente plus comme capacité produit accessible. Pour les outils et approbations, réutiliser ce moteur et son protocole de validation plutôt qu'en créer un second. Une validation humaine avec états d'approbation serveur, contrôle des arguments autorisés et audit reste à développer ; aucun outil à écriture ni permission supplémentaire n'est livré par ce nettoyage. Les calculs FinOps et le pipeline RAG restent inchangés.

<a id="phase-5c--mémoire-bornée-et-persistance-conversationnelle"></a>

## Gestion des conversations — Mémoire bornée et persistance conversationnelle

`support-conversations.js` réutilise directement la fonction de réponse de `support-knowledge.js` sans sous-requête HTTP. L'enrichissement lexical ajoute les questions utilisateur récentes à la question actuelle ; six messages maximum, budget total de 4 000 caractères. Aucune réponse assistant ni ancien extrait documentaire n'est envoyé au modèle. La question courante et quatre passages actuels restent séparés dans le prompt avec une politique serveur prioritaire. Pas de reformulation LLM supplémentaire ni de moteur vectoriel.

La migration 005 ajoute conversations/messages, clés étrangères en cascade, séquence autoincrémentée, index de pagination et unicité d'idempotence. Les références de citation utilisent IDs/empreintes plutôt que des copies de chunks. Une réponse est masquée à la lecture si une source n'est plus disponible/autorisée ou si son empreinte a changé. La révision documentaire monotone invalide les générations même après retrait puis réajout d'un document. Le stockage reste local en clair ; révocation ne signifie ni effacement de la base ni retrait d'une information déjà consultée.

Angular conserve les formulaires de configuration et de base documentaire et ajoute un composant Conversations autonome dans la même route lazy. Signals pour les états, Reactive Forms pour la saisie, numéros de génération pour ignorer les réponses HTTP périmées et annulation du polling à la destruction. Le rendu du modèle reste textuel. La même clé d'envoi est conservée après incertitude réseau ; la récupération d'un pending relit SQLite et ne redéclenche pas Groq. Le BFF unique marque les pending abandonnés failed au démarrage. Détails de pagination, quotas et limites : [Support Agent Studio](PHASE5_SUPPORT_AGENT.md).

<a id="phase-5d-1--tickets-transactions-et-classification"></a>

## Gestion des tickets — Tickets, transactions et classification

Migration additive 006 via le runner existant : FK, triggers d’appartenance et de retrait des liens, index et historique immuable via l’API. Une création porte un UUID d’idempotence et un hash du payload normalisé ; une mise à jour exige la version courante. Les règles de mots-clés normalisent accents/casse, priorisent notamment le produit défectueux et n’effectuent aucune inférence Groq. Elles restent corrigibles, sans validation sémantique ni décision métier autonome. Angular conserve les états au changement FR/EN ; les tests utilisent mocks HTTP et bases SQLite temporaires. [Détails, endpoints et scénario fictif NovaShop](PHASE5D_TICKETS.md).

<a id="phase-5d-2--décisions-descalade"></a>

## Transfert à un opérateur — Décisions d’escalade

Unicité partielle par ticket pour les états `requested`/`assigned`, transactions immédiates pour les décisions et l’audit, contrôle optimiste et réponses de rejeu conservées par clé d’idempotence. Les notes sont du texte utilisateur local, jamais traduites ni envoyées à une IA par les opérations d’escalade. Les tests utilisent des bases isolées ; aucune migration locale 007 n’est lancée pendant l’implémentation. [Transitions et procédure manuelle](PHASE5D_ESCALATIONS.md).
