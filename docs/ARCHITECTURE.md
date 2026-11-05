🏛️ Architecture & Clean Code - Enterprise AI Dashboard
Ce document détaille l'architecture logicielle globale, les flux de données et les choix de conception mis en œuvre dans ce projet par Rabiaa NOUIRA, ainsi que les limites de cette démonstration locale.
1. Schéma Global de l'Architecture (Monorepo & BFF)
Le schéma ci-dessous illustre la circulation des données de l'utilisateur jusqu'aux services d'intelligence artificielle et la base de données locale :
+---------------------------------------------------------------------------------+
|                               CLIENT (Browser)                                  |
|                               Angular 19 Standalone                             |
|    +------------------------+   +------------------------+                      |
|    | Reactive UI / Signals  |   | Services HTTP / Forms  |                      |
|    +------------------------+   +------------------------+                      |
+---------------------------------------------------------------------------------+
                                       |
                                       | HTTP local / JSON / Multipart (FormData)
                                       v
+---------------------------------------------------------------------------------+
|                         BACKEND BFF (Node.js / Express)                         |
|    +------------------------+   +------------------------+                      |
|    | Multer + pdf-parse     |   | tiktoken (/api/tokens) |                      |
|    +------------------------+   +------------------------+                      |
+---------------------------------------------------------------------------------+
               |                                              |
               v                                              v
+-----------------------------+                +------------------------------+
|     RAG LEXICAL / GROQ      |                |      LOCAL PERSISTENCE       |
|  - Chunking de documents    |                |  - SQLite (Better-SQLite3)   |
|  - SQLite FTS5 / BM25       |                |  - Prepared Statements       |
|  - API Groq et repli modèle |                |    (Paramètres SQL liés)     |
+-----------------------------+                +------------------------------+
2. Architecture Détaillée par Couche
A. Front-End : Angular 19 & Réactivité Moderne
Standalone Components : Les composants déclarent directement leurs dépendances. Les cinq routes fonctionnelles utilisent loadComponent() pour charger leurs composants à la demande; les dépendances partagées peuvent néanmoins rester dans le bundle initial.
Signals (signal, computed) et RxJS : Les Signals gèrent les états locaux et certaines valeurs dérivées (chargement, conversation, métriques). Les appels HttpClient restent des flux RxJS; les formulaires dynamiques utilisent les Reactive Forms Angular.
Isolation du réseau (Services dédiés) : ApiService, AgentService et DashboardDataService centralisent les principaux appels au BFF. Le Dashboard conserve une exception : il interroge directement l’API GitHub Actions via HttpClient pour son indicateur CI. Des interfaces TypeScript décrivent les principales réponses, avec encore des usages de any.
B. Back-End : Le Pattern BFF (Backend-For-Frontend)
Passerelle vers le fournisseur : Le serveur Node.js/Express utilise GROQ_API_KEY côté serveur pour appeler Groq. Les modèles servis par Groq ne constituent pas un appel direct à l’API OpenAI. Le BFF n’implémente pas d’authentification utilisateur : il impose une écoute loopback et réserve la télémétrie au mode local explicitement activé. CORS ne remplace pas une autorisation.
Gestion des fichiers : POST /api/document/parse reçoit un fichier en mémoire via Multer, avec une limite de 10 MiB. pdf-parse extrait le texte des PDF; les TXT et CSV sont décodés en UTF-8, sans analyse tabulaire CSV. Aucun OCR n’est implémenté. Un document sans texte exploitable est rejeté.
Persistance et recherche : Le SHA-256 du fichier évite une réindexation identique. Le texte est découpé sans chevauchement en segments de 400 caractères maximum, par page PDF quand disponible. SQLite conserve les métadonnées dans documents_history et les passages dans document_chunks; un index FTS5 et ses triggers assurent la recherche lexicale, classée par BM25. Aucun embedding, base vectorielle ou calcul de similarité cosinus n’intervient.
Réponse documentée : POST /api/chat valide la portée documentId, récupère jusqu’à quatre passages, leur attribue des labels [S1]… et assemble le contexte envoyé à Groq avec la question. Sans résultat, le modèle reçoit une consigne d’assistant général sans citations documentaires. Le serveur renvoie les sources, leurs extraits et les labels reconnus; cette validation d’identité ne prouve pas que chaque affirmation est étayée. Le parcours de génération de formulaires et le moteur interne à outils sont distincts du chat RAG historique ; le Studio de support utilise son propre endpoint de base documentaire des agents.
3. Bonnes Pratiques & Standards de Développement
Pour améliorer la maintenabilité et limiter certains risques, les pratiques suivantes sont utilisées, avec les limites décrites ci-dessous :
1. Sécurité des Données & Prepared Statements (SQLite)
Problématique : Les insertions en base de données sont souvent vulnérables aux injections SQL si les données utilisateur sont concaténées directement dans les requêtes.
Bonne pratique appliquée : Les requêtes de données utilisent des paramètres liés avec better-sqlite3, notamment pour les insertions, la recherche FTS5 et le filtre documentId. Les filtres et paginations des endpoints Dashboard sont validés. Cela réduit le risque d’injection SQL dans ces parcours, sans constituer une garantie générale de sécurité. Les accès SQLite sont synchrones; les écritures de chunks et les migrations utilisent des transactions.
2. UI/UX Défensive (Gestion des états de chargement)
Problématique : Un utilisateur qui clique frénétiquement sur un bouton de soumission peut provoquer des doublons de requêtes ou bloquer l'interface si une erreur réseau survient.
Bonne pratique appliquée : Le Chat et Support Agent Studio vérifient leur état avant de lancer une requête et désactivent les commandes concernées pendant le traitement. Le Chat réinitialise ses indicateurs dans les callbacks next et error. Ces protections limitent les doubles soumissions; elles ne garantissent pas l’absence de blocage si une requête ne se termine jamais.
3. Separation of Concerns (SoC)
Problématique : Le code monolithique ou couplé est difficile à tester et à faire évoluer.
Bonne pratique appliquée : Répartition des responsabilités :
Le Front-End gère l’affichage, les états d’interaction, les formulaires et les appels HTTP.
Le BFF gère le parsing, la récupération lexicale, les prompts Groq et l’observabilité des requêtes /api/chat. Les usages de tokens proviennent du fournisseur quand disponibles; tiktoken reste un endpoint de comptage séparé.
La persistance SQLite conserve les soumissions, les passages documentaires et les métadonnées d’inférence. L’historique d’inférence ne stocke pas les prompts, réponses ou extraits; les tables de documents et de formulaires contiennent, elles, des données métier.
4. Typage Stricte TypeScript
Les modèles de sources, traces, usages et coûts alignent les interfaces TypeScript sur les réponses du BFF. Des any subsistent, notamment dans les schémas de formulaires, leurs soumissions et certains appels HTTP. Le typage à la compilation ne remplace pas la validation des entrées et des réponses à l’exécution.
Références de code : [routes Angular](../client/src/app/app.routes.ts), [Chat](../client/src/app/components/chat/chat.component.ts), [initialisation BFF](../server/index.js), [stockage documentaire](../server/document-store.js), [chat RAG](../server/chat-handler.js), [observabilité](../server/observability.js), [historique d’inférence](../server/inference-history-store.js).

4. FinOps — extensions de l’architecture existante
Le Dashboard inclut désormais un composant FinopsComponent et un FinopsService pour les projections, scénarios et alertes locales. Les métriques, séries et historiques existants restent fournis par DashboardDataService. Le BFF ajoute server/finops.js, qui réutilise les coûts persistés et la formule commune de server/observability.js; aucun appel IA n’est nécessaire au calcul.
La migration additive 002_finops_budget.sql stocke un budget mensuel partagé dans finops_settings. Les trois endpoints /api/dashboard/finops, /finops/budget et /finops/simulate réutilisent les restrictions loopback/télémétrie et CORS existantes. Le pipeline RAG FTS5/BM25 est inchangé. Les règles d’échantillonnage, projections, coûts partiels et seuils sont détaillées dans [FINOPS](FINOPS.md).


<a id="phase-5a--configuration-persistante-des-agents"></a>

## Configuration des agents — Configuration persistante des agents

La route Angular existante `/agent-workspace` héberge uniquement Support Agent Studio ; le runner d'exploitation reste un module backend séparé, sans interface. `AgentService` ajoute les opérations de catalogue/configuration ; les Reactive Forms et Signals gèrent les brouillons et états asynchrones. La migration additive `003_support_agents.sql` et les routes locales `/api/agents` persistent les configurations, avec validation stricte et contrôle de version contre l'écrasement d'une édition concurrente.

La sauvegarde de configuration n’effectue aucun appel Groq. Les statuts actif/inactif ne constituent pas un déploiement. Base documentaire des agents, test documentaire, gestion des conversations et transfert local à un opérateur sont décrits dans leurs sections dédiées ; le RAG FTS5/BM25 et les calculs FinOps existants sont inchangés. Aucune authentification ou isolation multi-tenant n'est ajoutée. Détails : [Support Agent Studio](PHASE5_SUPPORT_AGENT.md).


<a id="phase-5b--rag-de-support-à-périmètre-documentaire-explicite"></a>

## Base documentaire des agents — RAG de support à périmètre documentaire explicite

Support Agent Studio conserve Configuration et ajoute Knowledge Base / Tester l'agent. La migration additive `004_support_agent_documents.sql` relie les configurations aux documents existants, sans copie de chunks ni nouvel index. Les associations sont modifiées atomiquement ; la recherche FTS5/BM25 partagée filtre dans SQL via cette table avant classement et limite. Une portée vide ne devient jamais une recherche globale.

`POST /api/agents/:id/ask` est indépendant de `/api/chat` et de l'ancien `/api/agent/run`. Il utilise la configuration persistée et active, des instructions serveur prioritaires, un contexte autorisé borné, les utilitaires de citations partagés et un délai fournisseur. Sans contexte lexical suffisant, sans référence valide ou lorsque le modèle s'abstient, seule l'abstention avec le message de secours est renvoyée. La qualité sémantique et l'entailment ne sont pas évalués automatiquement ; des citations valides ne garantissent pas l'exactitude de chaque affirmation. Les nouvelles réponses ne sont pas ajoutées à l'historique RAG/FinOps ; l'agrégation par agent reste future. Détails et limites : [Support Agent Studio](PHASE5_SUPPORT_AGENT.md).


## Nettoyage de l'ancienne interface Agent Workspace

L'UI « Outils d'exploitation » et ses dépendances frontend exclusives ont été supprimées : ancien template/SCSS, modèle `agent-run.model.ts` et méthode HTTP `AgentService.run()`. Le composant de route `AgentWorkspaceComponent` reste une coquille minimale de Support Agent Studio : pas de seconde route ou moteur. Configuration, Knowledge Base, Tester l'agent et leurs protections de brouillons sont conservés. Les conversations persistantes sont désormais disponibles dans le Studio ; les détails de cet audit historique sont conservés dans le document de suivi.

`server/agent.js` conserve la boucle Groq, les deux outils en lecture seule (`count_form_submissions`, `get_dashboard_history`), la validation stricte, les bornes et les traces. `/api/agent/run` reste disponible **uniquement** derrière le garde loopback et `DASHBOARD_TELEMETRY_LOCAL_ONLY=true`, en plus de la politique CORS. Ce durcissement peut nécessiter l'opt-in pour d'anciens clients techniques ; aucune interface Angular ne l'appelle désormais. Il ne s'agit pas d'une authentification, ni d'une autorisation par utilisateur. Ne pas exposer le serveur via un proxy public.

Architecture Explorer distingue ce moteur interne sans interface ; les anciens liens UI→API et API→UI ont été retirés. Guided Demo ne le présente plus comme capacité produit accessible. Pour les outils et approbations, réutiliser ce moteur et son protocole de validation plutôt qu'en créer un second. Une validation humaine avec états d'approbation serveur, contrôle des arguments autorisés et audit reste à développer ; aucun outil à écriture ni permission supplémentaire n'est livré par ce nettoyage. Les calculs FinOps et le pipeline RAG restent inchangés.

<a id="phase-5c--historique-conversationnel-local"></a>

## Gestion des conversations — Historique conversationnel local

L'espace Conversations de Support Agent Studio utilise `server/support-conversations.js` et la migration additive `005_support_conversations.sql`. Conversations liées à l'agent et messages ordonnés par séquence sont persistés réellement, avec cascade à la suppression et quotas de 50 conversations/agent et 200 messages/conversation. Aucun chunk n'est copié : les références stockées sont réhydratées depuis les documents actuellement autorisés ; une source révoquée ou modifiée masque la réponse historique et ses détails.

La génération est le gestionnaire documentaire partagé, pas un second moteur RAG : nouvelle recherche SQL FTS5/BM25 scoped à chaque tour, mémoire de six anciens messages utilisateur maximum et 4 000 caractères question actuelle incluse. Les réponses assistant historiques ne sont jamais des preuves ni du contexte transmis. Citations, abstention, timeout, limites de concurrence et estimations nullable sont réutilisés ; les agrégats FinOps existants ne sont pas élargis.

Écritures liées transactionnelles, UUID d'idempotence par envoi, un pending/conversation, contrôle de version et de révision documentaire après génération. Les pending interrompus passent en échec au démarrage du BFF unique, sans appel IA automatique. Les routes sous `/api/agents/:id/conversations` exigent le même garde local et vérifient l'appartenance à l'agent. Ce stockage en clair n'est pas une isolation multi-utilisateur. Contrats, rétention, limites et démonstration : [Support Agent Studio](PHASE5_SUPPORT_AGENT.md#phase-5c--conversations-persistantes-et-mémoire-courte). La gestion des tickets et le transfert local à un opérateur sont décrits ci-dessous ; l’automatisation n8n et les outils avec approbations restent à développer.

<a id="phase-5d-1--tickets-locaux"></a>

## Gestion des tickets — Tickets locaux

Le Studio intègre Tickets sans sixième route ni second moteur d’agent. `SupportTicketService` appelle `/api/agents/:id/tickets` ; `server/support-tickets.js` valide les associations agent/conversation/message et les enums. La migration `006_support_tickets.sql` ajoute tickets et événements ; mutations et audit sont transactionnels. Classification lexicale déterministe FR/EN ou choix manuel, sans appel IA ni score de confiance. Les textes de tickets sont conservés en clair ; la suppression d’une conversation retire les liens mais conserve les textes confirmés du ticket. [API, sécurité, rétention et limites](PHASE5D_TICKETS.md).

<a id="phase-5d-2--handoff-humain-local"></a>

## Transfert à un opérateur — Handoff humain local

`AgentEscalationsComponent` utilise `SupportTicketService` dans le détail Tickets. `server/support-escalations.js` applique le garde local et la portée agent/ticket, les transitions, versions et clés d’idempotence. La migration 007 ajoute des tables séparées pour escalades et décisions, avec un index unique sur les états actifs ; le statut du ticket et son audit restent inchangés. Aucun service externe ni identité vérifiée. [Architecture et limites](PHASE5D_ESCALATIONS.md).
