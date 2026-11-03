# Phases 5A / 5B / 5C — Support Agent Studio

Enterprise AI Dashboard — AI Operations & FinOps Platform.

## Objectif et périmètre livré

Créer, consulter, modifier et activer/désactiver des **configurations** de support client persistantes.
Le Studio vit dans la route existante `/agent-workspace` : aucune seconde page Agent concurrente.
L'activation reste un état de configuration, pas un déploiement public. La Phase **5B** ajoute un test documentaire réel et stateless pour les configurations actives.
La sauvegarde 5A ne lance aucun appel Groq. L'envoi explicite dans « Tester l’agent » ou « Conversations » peut lancer une inférence réelle. La Phase 5C ajoute les conversations locales persistantes décrites ci-dessous ; classification, escalade effective et n8n restent futurs.

## Audit de la base existante

Base auditée : `f2e46f929578bf63143b4d78ca62375b74cebd21`, sur `main` synchronisée avec `origin/main`.
Les commits UI `a417dba` et `f2e46f9` sont intégrés ; les anciennes branches UI restent conservées.
Le working tree était propre avant création de `feat/phase-5-support-agent`.

| Élément | Avant 5A | Réutilisation / évolution |
| --- | --- | --- |
| Agent Workspace | Fonctionnel : objectif, exemples, attente, réponse, erreurs/retry et trace | UI retirée après 5B ; moteur conservé côté serveur sans connexion automatique au Studio |
| Configuration d'agent | Modèle/prompt de l'exécuteur définis côté serveur ; aucun catalogue éditable | Nouveau formulaire persistant, sans modifier ce prompt d'exploitation |
| Service Angular | `AgentService.run()` → `/api/agent/run` | Même service enrichi de méthodes de configuration typées |
| Backend Agent | Boucle Groq bornée, deux outils autorisés en lecture seule | `server/agent.js` inchangé ; son modèle autorisé est réutilisé |
| Persistance | Soumissions, documents/chunks FTS5, traces/étapes et budget FinOps | Migration additive `003_support_agents.sql` |
| Chat | Chat générateur / RAG existant ; pas de conversations de support persistantes | Aucune nouvelle interface de chat en 5A |
| Instructions IA | Instructions serveur pour RAG et outils de lecture | Instructions de support stockées comme données, pas exécutées en 5A |
| Documents RAG | Ingestion PDF/TXT/CSV, chunks, SQLite FTS5/MATCH/BM25, portée documentaire et citations | Code inchangé ; à réutiliser avec un périmètre autorisé en 5B |
| Observabilité/FinOps | Usage fournisseur nullable, durées mesurées et estimations tarifaires du RAG | Aucun coût créé en 5A ; intégration par agent prévue ultérieurement |
| Navigation et design | Cinq routes lazy, sidebar navy, identité Enterprise AI Dashboard | Même route, surfaces navy/indigo, formulaire et catalogue responsive |
| Tests | Agent runner mocké, AgentService et Workspace ; tests RAG/FinOps/UI | Tests conservés, complétés pour configuration et persistance |

Le runner historique n'est pas un agent de support documentaire : il ne reçoit pas les chunks RAG et ne persiste pas de conversation. Ses outils restent `count_form_submissions` et `get_dashboard_history`, avec limites de temps, d'itérations et d'appels. Le Studio ne change pas ce périmètre.

## Architecture cible progressive

- **5A (livré)** : configurations, validation, catalogue, édition, statut, persistance SQLite.
- **5B (livré)** : base documentaire autorisée par agent, recherche FTS5/BM25 et citations ; réponse d'insuffisance stricte.
- **5C (livré)** : conversations/messages persistants, reprise et contexte borné.
- **5D (futur)** : classification, intégration n8n et demandes d'escalade humaine et historique de traitement ; aucune notification externe implicite.
- **5E (futur)** : tool calling et validation humaine, en réutilisant le moteur interne. L’agrégation observabilité/FinOps par agent reste à planifier.

Seules 5A, 5B et 5C sont livrées ; 5D/5E ne sont pas implémentées.

## SQLite et migration

`runMigrations()` applique transactionnellement les migrations numérotées au démarrage du backend.
`003_support_agents.sql` crée `support_agents` et un index sur `(updated_at DESC, id)`.
Aucune table, donnée métier ou migration historique n'est supprimée.

Champs :

- `id` UUID généré serveur ; `name` (1–100), `description` (0–500), `role` (1–200).
- `system_instructions` (1–12 000), `tone`, `language`, `model`.
- `temperature`, `max_output_tokens`, `fallback_message` (1–2 000).
- `escalation_enabled` booléen SQLite 0/1 et `status` (`active` / `inactive`).
- `version` entier pour éviter l'écrasement d'une modification concurrente ; timestamps UTC `created_at` et `updated_at` générés serveur.
- `owner_id` et `organization_id`, réservés et NULL : **aucun multi-tenant ni contrôle de propriétaire livré**. Ils ne sont pas assignables par l'API.

Les requêtes utilisent des paramètres préparés. Les noms de colonnes proviennent uniquement de constantes du serveur.
Les erreurs de stockage retournent un message générique, sans SQL, instructions ou stack trace.
La persistance est testée en fermant la connexion SQLite, en rouvrant le même fichier temporaire et en relançant les migrations.
Aucun fichier `.db` ou sidecar n'est versionné.

## Endpoints

Toutes les routes réutilisent le garde local du Dashboard : flag `DASHBOARD_TELEMETRY_LOCAL_ONLY=true` et adresse cliente loopback réelle. Les adresses proxy déclarées par le client ne constituent pas une autorisation.

| Méthode | Route | Comportement |
| --- | --- | --- |
| GET | `/api/agents?limit=50&offset=0` | `{items,total,limit,offset}`, limite 1–100, offset 0–1 000 000 |
| GET | `/api/agents/:id` | Configuration complète, ou 404 |
| POST | `/api/agents` | Création, 201 et objet réellement persisté |
| PUT | `/api/agents/:id` | Configuration complète et `version` courante ; 409 si version périmée |
| PATCH | `/api/agents/:id/status` | `{status,version}` ; activation/désactivation, sans suppression |

Les noms de champs JSON utilisent camelCase. Les champs inconnus, types incorrects, UUID invalides et valeurs hors limites sont rejetés avec 400.
POST/PUT/PATCH exigent `application/json`. Aucune suppression définitive.

La politique CORS conserve ses origines HTTP(S) exactes. PUT/PATCH sont ajoutés seulement aux chemins `/api/agents`, pas aux anciennes API. Les autres règles et en-têtes autorisés restent inchangés.

## Paramètres du modèle

Un seul modèle est proposé en 5A : `openai/gpt-oss-120b`, déjà utilisé par l'exécuteur existant.
Température : nombre fini entre 0 et 2. Limite de sortie : entier entre 1 et 4 096, **plafond applicatif volontairement conservateur**.
Le test 5B utilise `max_completion_tokens`, le modèle et la température enregistrés. La sauvegarde 5A ne transmet aucun paramètre à Groq.
Tons : professionnel, chaleureux ou concis. Langues : français, anglais, arabe.
L'autorisation et la disponibilité effectives du modèle dans le compte Groq devront être contrôlées lors de l'ajout de l'exécution.

Références fournisseur vérifiées le 2 novembre 2026 : [API Groq](https://console.groq.com/docs/api-reference) et [GPT-OSS 120B sur Groq](https://console.groq.com/docs/model/openai/gpt-oss-120b).
Aucun tarif ni coût n'est introduit par cette configuration.

## Angular et UX

- `SupportAgentConfig`, `SupportAgent` et `SupportAgentPage` définissent le contrat typé.
- `AgentService` conserve `run()` et ajoute les cinq opérations HTTP du Studio.
- `AgentConfigurationComponent` est intégré dans `AgentWorkspaceComponent`, sans nouvelle route.
- Reactive Forms : identité, comportement, modèle, secours et options de support ; validateurs frontend et validation serveur indépendante.
- Signals : catalogue, sélection, pagination, chargements, sauvegarde et messages.
- Destruction : abonnements arrêtés via `takeUntilDestroyed`.
- Un retour tardif d'un ancien chargement ne peut pas écraser un catalogue plus récent.
- La saisie est conservée après erreur ; aucun succès affiché avant réponse serveur.
- Les champs sont bloqués pendant sauvegarde/chargement du détail. Annuler restaure le snapshot enregistré, ou le brouillon initial pour une création.
- Les changements d'agent/pagination sont refusés quand un brouillon est sale : enregistrer ou annuler explicitement.
- Un avertissement natif est demandé lors de fermeture/rechargement d'onglet avec modifications. **Pas encore de garde Angular de navigation entre routes** : la sortie vers une autre page peut perdre un brouillon non enregistré.
- Les dates et versions sont gérées côté serveur ; l'UI ne prétend pas sauvegarder dans le seul état local.
- Labels, focus visible, messages `status`/`alert`, fieldsets et grille responsive.
- Les configurations actives sont identifiées comme telles, sans prétendre qu'un service est déployé.

Le formulaire n'injecte pas les textes utilisateur en HTML : noms et descriptions sont interpolés, instructions dans une textarea.
Le panneau historique d'exploitation reste indépendant : ses exécutions ne consomment pas les configurations du Studio.

## Sécurité et limites actuelles

Démonstration locale **sans authentification ni autorisation par utilisateur**. Toute personne/processus ayant accès au serveur local autorisé peut lire/modifier toutes les configurations.
La restriction loopback et CORS ne constituent pas une authentification ; ne pas exposer le serveur via reverse proxy public.
Les instructions sont persistées en clair dans SQLite. Ne pas y saisir de secrets ; leur contenu ne doit jamais servir de règle de sécurité.
La validation borne les textes et paramètres ; elle n'est pas une garantie contre les injections de prompt lors d'une future exécution.
Il n'existe encore ni RBAC, ni chiffrement applicatif au repos, ni sauvegarde métier automatique. Les associations documentaires 5B sont une portée serveur pour l'agent, pas une autorisation multi-utilisateur.
`escalationEnabled` mémorise une intention seulement : aucun conseiller, ticket ou notification n'est contacté/créé.
Une modification concurrente donne 409 : annuler puis recharger avant de modifier à nouveau. Pas de fusion automatique des éditions.

## Tests et commandes

```sh
cd server
npm test
cd ../client
npm test -- --runInBand
npm run build
cd ..
git diff --check
```

Backend : vraies requêtes Express loopback, migrations additives/idempotentes, base temporaire isolée, création/lecture/modification/statut, pagination, validation stricte, conflits de version, contrôle local/CORS, erreurs de stockage et fermeture/réouverture SQLite.
Les anciens tests Groq utilisent des doubles ; aucun appel IA externe ou payant n'est nécessaire.
Frontend : service HTTP typé, validation, chargement/vide/erreur, création, sauvegarde en attente, édition, annulation, brouillon sale, activation/désactivation, erreurs 400/403/404/409/500/réseau, réponse tardive et destruction.
Les suites existantes couvrent toujours RAG, FinOps, Dashboard, Guided Demo, Architecture Explorer et les cinq routes lazy.
Les tests DOM ne remplacent pas une inspection visuelle du responsive et du clavier dans Safari.

## Démonstration manuelle

1. Installer les dépendances selon le README, puis lancer le serveur avec `DASHBOARD_TELEMETRY_LOCAL_ONLY=true`, une origine Angular autorisée et son environnement Groq habituel. Le serveur existant construit son client Groq au démarrage, mais le Studio ne déclenche pas d'inférence.
2. Ouvrir Agent Workspace : « Support Agent Studio » présente un catalogue vide si aucune configuration n'existe.
3. Saisir un nom, un rôle et des instructions non sensibles ; choisir ton, langue, modèle et paramètres valides.
4. Enregistrer : attendre le succès réel et l'apparition dans le catalogue. Recharger la page pour constater la persistance.
5. Sélectionner l'agent, modifier, annuler puis vérifier le retour aux valeurs enregistrées.
6. Modifier et enregistrer ; activer/désactiver la configuration. Ces actions ne créent pas de conversation.
7. Redémarrer le backend puis recharger : la configuration reste présente dans la base locale.
8. Tester un champ invalide et une indisponibilité serveur : erreur explicite, sans faux succès ni disparition du brouillon.
9. Vérifier que l'ancienne section « Outils d'exploitation » n'est plus présente. Le moteur interne est conservé côté serveur, hors du parcours de démonstration du Studio.
10. Contrôler desktop, tablette et mobile, focus clavier et avertissement de brouillon. La disponibilité de Safari WebDriver dépend de « Allow remote automation ».

## Plan initial de 5B — réalisé ci-dessous

1. Ajouter une relation agent–document avec clés étrangères, sans copier les chunks ou reconstruire un index.
2. Filtrer dans SQL la recherche FTS5/BM25 sur l'ensemble **autorisé** par l'agent ; valider les associations côté serveur.
3. Séparer les règles serveur immuables des instructions métier configurables et traiter les documents comme données non fiables.
4. Réutiliser l'extraction des passages et l'identification des citations existantes. Refuser une réponse documentaire sans sources suffisantes, sans basculer silencieusement vers une réponse générale.
5. Tester l'absence de fuite inter-agent, les documents retirés, l'absence de résultat et les labels invalides, avec Groq simulé.
6. Préparer ensuite 5C : conversations/messages, contexte borné, isolation, budget de tokens et effacement explicite. Ne pas mélanger ces données aux traces metadata-only existantes.

Avant production : définir authentification/autorisation, politique de rétention des configurations/conversations, chiffrement/sauvegardes et contrôles d'accès documentaires. Revalider les capacités du fournisseur et conserver coûts manquants/usage indisponible comme tels.

## Validation de la livraison 5A

- Frontend : **108 tests réussis, 16 suites** (`npm test -- --runInBand`).
- Backend : **83 tests réussis** (`npm test`), bases isolées et doubles Groq.
- Build production : réussi, initial **423 704 octets bruts**, cinq routes lazy conservées, budgets inchangés.
- Seul avertissement : stylesheet historique Agent Workspace **7,48 kB** pour un seuil d'avertissement de 4 kB ; erreur à 8 kB. Aucun nouvel avertissement du Studio.
- Vérifications de syntaxe Node et `git diff --check` réussies.
- Contrôle visuel non réalisé : Safari WebDriver refuse la session tant que « Allow remote automation » est désactivé. Aucune capture desktop/mobile ou validation de rendu réel n'est revendiquée.

## Phase 5B — base documentaire autorisée et test RAG

### Base Git et réutilisation

5B continue sur `feat/phase-5-support-agent`, à partir de `159d55f3d5109e686998c234d8bbb9bc0f00b77e`, branche propre et synchronisée avant modification. `main` reste indépendante.
Le design et le formulaire 5A restent dans `AgentConfigurationComponent`, sans nouvelle route.
`AgentService`, `DashboardDataService.getDocuments()`, `searchDocumentChunks()`, le client Groq et les fonctions de calcul d'usage/coût existants sont réutilisés.
Les utilitaires de labels et de normalisation des citations sont extraits à l'identique de `chat-handler.js` vers `citation-utils.js` ; le comportement historique de `/api/chat`, notamment son mode général sans résultat, reste inchangé. Ce mode général **n'est jamais utilisé par 5B**.
L'exécuteur `/api/agent/run` et ses deux outils ne sont pas modifiés et ne reçoivent aucune autorisation documentaire implicite.

### Association SQLite

Migration **additive** `004_support_agent_documents.sql` :

```sql
support_agent_documents (
  agent_id TEXT REFERENCES support_agents(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documents_history(id) ON DELETE CASCADE,
  created_at TEXT,
  PRIMARY KEY (agent_id, document_id)
)
```

Les identifiants référencent les vraies clés primaires existantes. Les nouveaux agents ont zéro association.
Retirer une association ne supprime aucun document ou chunk. Supprimer un document existant nettoie ses associations grâce aux FK ; aucun endpoint de suppression documentaire n'est ajouté ici.
La mise à jour du périmètre valide tous les identifiants avant écriture, refuse les doublons et utilise une transaction immédiate avec rollback intégral en cas d'erreur.
`scopeVersion` est le SHA-256 de la liste triée des identifiants associés. Il détecte les modifications concurrentes d'ensemble ; **ce n'est ni un secret ni un jeton d'autorisation**. Les versions de configuration 5A sont indépendantes et inchangées par une association.

### Contrats API 5B

Les nouvelles routes ont le même garde loopback + `DASHBOARD_TELEMETRY_LOCAL_ONLY=true`. Les origines CORS exactes restent exigées dans le navigateur. PUT est permis au chemin documentaire spécifique ; les anciennes routes ne gagnent pas de nouvelles méthodes.

- **GET `/api/agents/:id/documents`** → `{documentIds, documents, scopeVersion}`. Chaque document expose son identifiant, nom, type, date et nombre de chunks ; pas le contenu intégral.
- **PUT `/api/agents/:id/documents`** avec `{documentIds: number[], scopeVersion: string}` remplace atomiquement les associations. Maximum **100 identifiants uniques**, entiers positifs, tous existants. `[]` révoque tout accès. Réponse : l'ensemble réellement enregistré. Version périmée : 409 ; document disparu : 404 ; payload invalide : 400.
- **POST `/api/agents/:id/ask`** avec `{question: string, documentId?: number}`. Question non vide, maximum **2 000 caractères** ; aucun paramètre client de modèle, liste documentaire ou instruction système accepté.
- Réponse réussie : `{status: 'answered', reply, sources, citationValidation, durationMs, usage, ...estimationDeCoût}`.
- Abstention : `{status: 'abstained', reason, reply: messageDeSecoursConfiguré, sources: [], citationValidation: null, durationMs}`.
- Erreurs : 400 payload, 403 document hors périmètre/accès local refusé, 404 agent absent, 409 agent inactif ou configuration/périmètre modifié pendant génération, 429 test concurrent, 502 erreur fournisseur, 504 timeout. L'abstention est un résultat métier distinct d'une erreur réseau.

La prévisualisation n'est pas un endpoint public pour des clients externes. Sans authentification, les opérateurs locaux peuvent gérer les associations de tous les agents. La restriction documentaire protège le parcours d'inférence selon l'ensemble enregistré ; elle ne remplace pas une ACL utilisateur/organisation. Ne pas exposer ce serveur non authentifié via un proxy public.

### Filtrage exact de la récupération

`searchDocumentChunks(db, query, limit, documentId, {agentId})` ajoute au SQL FTS5 :

```sql
AND chunk.document_id IN (
  SELECT binding.document_id
  FROM support_agent_documents binding
  JOIN support_agents agent ON agent.id = binding.agent_id
  WHERE binding.agent_id = ? AND agent.status = 'active'
)
```

Ce filtre précède `ORDER BY bm25(...)` et `LIMIT`. Le test d'un agent ne récupère pas globalement des passages pour les masquer ensuite. L'index FTS5 est celui du projet, partagé ; aucune copie ni embeddings.
Le paramètre optionnel absent conserve le comportement legacy des appels existants. Le nouvel endpoint fournit toujours un objet de portée explicite ; une portée mal formée échoue sans recherche globale. Avec une association vide, aucun appel de récupération ni Groq n'est nécessaire.
Un `documentId` fourni par le client est vérifié contre les associations avant la récupération : un document connu mais non associé donne 403 sans recherche ni appel fournisseur.

### Contexte, politique et bornes

1. Lire la configuration persistée ; refuser les agents inactifs.
2. Récupérer au maximum **4 chunks** avec le périmètre SQL.
3. Appliquer un **garde lexical conservateur**, sans prétendre mesurer la pertinence sémantique : termes Unicode d'au moins 3 caractères, liste de mots fréquents exclus, maximum 32 termes distincts ; chunk d'au moins 20 caractères et intersection d'au moins `min(2, nombre de termes utiles de la question)` termes.
4. Sans passage passant ce garde, s'abstenir avant Groq. Ce garde peut aussi rejeter une question pertinente : c'est une limite explicite, pas un score de confiance.
5. Borner chaque extrait à **1 200 caractères** (les chunks actuels sont limités à 400) : contexte documentaire au maximum 4 800 caractères. Instructions métier limitées à 12 000 caractères par 5A et question à 2 000.
6. Fournir une politique **system** immuable ; configuration, question et passages sont des données JSON dans un message **user**. La configuration ne peut pas étendre les permissions SQL ou supprimer les contrôles serveur. L'obéissance du modèle au prompt n'est pas une garantie de sécurité ; les garde-fous déterministes restent côté serveur.
7. Appeler le modèle enregistré, température enregistrée, `max_completion_tokens <= 4096`, `reasoning_format: 'hidden'`, sans outils. Aucun repli vers un autre modèle ou assistant général.
8. Délai fournisseur **15 secondes**, AbortController et course de promesses, sans retry SDK automatique. Au maximum un test par agent et quatre appels fournisseur simultanés par processus ; pas de quota mensuel ni limite distribuée livrés.
9. Avant d'afficher la réponse, revérifier l'existence/statut/version de l'agent et l'ensemble documentaire. Une révocation ou modification concurrente rejette la réponse avec 409. Un contexte déjà envoyé au fournisseur sous autorisation ne peut pas être rétracté rétroactivement.

Aucune question, instruction, réponse ou extrait complet n'est journalisé par défaut par ce parcours. Les réponses restent en mémoire de la prévisualisation ; aucune conversation ou trace RAG persistante n'est créée.

### Citations et garanties d'abstention

Le contexte reçoit les labels `[S1]` etc. Le serveur réutilise l'extraction et la normalisation de citations existantes, y compris `【S1】`.
Une réponse vide/trop longue, un marqueur `[ABSTAIN]`, l'absence de citation, une référence inconnue ou une forme de référence S malformée provoquent le renvoi du message de secours, sans exposer la réponse rejetée ni inventer de source.
Seuls les passages effectivement récupérés, autorisés et cités sont renvoyés, avec documentId, chunkId, nom, extrait, offsets et page lorsqu'elle est connue.

**Garantie déterministe** : pas d'appel Groq sans périmètre/contexte lexical admissible, et pas de réponse modèle exposée sans références reconnues et présentes dans ce contexte. **Pas de garantie sémantique** : la présence d'un passage lexicalement proche et d'une citation correcte ne prouve pas que le passage contient la réponse ou implique toutes ses affirmations. Le modèle reçoit une consigne explicite d'abstention ; aucune évaluation avancée de factualité/entailment n'est implémentée. Le contrat annonce `factualEntailmentValidated: false` et l'interface explique cette limite.

### Studio : trois espaces, même configuration

- **Configuration** : formulaire 5A conservé et maintenu monté, même lorsqu'il est masqué ; valeurs, validateurs et persistance ne sont pas reconstruits à chaque navigation.
- **Knowledge Base** : catalogue paginé du Dashboard réutilisé, documents sélectionnés/associés, retrait sans suppression, sélection persistée uniquement après succès API, annulation et erreurs explicites.
- **Tester l'agent** : configuration active et sauvegardée, consultation de son périmètre, question indépendante, portée documentaire facultative restreinte aux associations, génération, abstention, erreurs et détails des citations.

Un brouillon de configuration ou d'associations bloque les changements d'espace/agent jusqu'à sauvegarde ou annulation. Une opération de sauvegarde ou génération en cours bloque aussi ces changements. Un retour sur un autre agent efface la prévisualisation précédente ; aucun historique de conversation n'est fabriqué. Le garde de fermeture d'onglet couvre aussi les associations sales ; la réserve de navigation Angular entre routes de 5A reste applicable.
Les réponses et extraits sont interpolés comme texte, sans rendu HTML fourni par le modèle.
Les appels de test qui atteignent Groq sont réels et peuvent être facturés. Usage et estimation tarifaire réutilisent les fonctions d'observabilité lorsque disponibles ; l'agrégation au Dashboard/FinOps et l'historique **par agent** ne sont pas ajoutés en 5B. Les abstentions et erreurs ne doivent pas être interprétées comme un coût nul.

### Tests de sécurité et démonstration

Les tests utilisent de vrais endpoints HTTP loopback, SQLite isolé et un Groq simulé. Ils couvrent : scopes disjoints entre deux agents avec mêmes mots-clés, filtre SQL avant LIMIT, documentId interdit refusé avant recherche, associations multiples/vides, doublons et IDs invalides, rollback forcé, conflits d'ensemble, fermeture/réouverture, cascade documentaire, références absentes/inventées, abstention, erreur fournisseur, timeout/abort, opérations concurrentes et modifications/révocations pendant génération. Les tests antérieurs de `/api/chat` et `/api/agent/run` restent exécutés.
Les tests Angular vérifient chargement/vide/erreurs, association/retrait/annulation, sauvegarde réelle, formulaire conservé, protection des brouillons, test actif/inactif, citations, abstention et erreurs réseau. Aucun test automatique ne contacte Groq.

Démonstration manuelle :

1. Dans le Generator existant, importer deux fichiers non sensibles avec des politiques distinctes ; attendre leur indexation réelle.
2. Dans Configuration, créer/sauvegarder deux agents et les activer.
3. Dans Knowledge Base du premier, associer uniquement le premier document puis enregistrer. Faire l'inverse pour le second.
4. Dans Tester l'agent, poser explicitement une question factuelle utilisant les termes du document autorisé ; examiner les sources et leurs extraits.
5. Interroger un sujet absent : constater l'abstention, distincte d'une erreur réseau. Ne pas attendre un rappel d'une question précédente.
6. Retirer tous les documents puis enregistrer : un nouveau test s'abstient sans appel IA.
7. Vérifier les sélections, l'annulation des brouillons, le responsive et le focus clavier. Ces clics manuels peuvent lancer des appels payants uniquement lors de l'envoi d'une question disposant d'un contexte admissible.

### Préparation de 5C

Ajouter des conversations/messages avec un propriétaire/agent explicite, une rétention/effacement définis et un contexte borné. Ne jamais utiliser l'historique client comme autorité documentaire ; revérifier les associations et l'état de l'agent à chaque tour. Définir authentification/autorisation avant une exposition publique et empêcher les fuites entre conversations. Réutiliser le pipeline 5B et les coûts disponibles, sans recopier les index ou persister les contenus dans les tables metadata-only existantes. Escalade et observabilité agrégée par agent restent 5D/5E.

### Validation de la livraison 5B

- **117 tests Angular réussis, 17 suites** ; **94 tests backend réussis**.
- Build production réussi : **426 399 octets bruts** au chargement initial ; cinq routes lazy conservées et budgets inchangés.
- Uniquement l'avertissement SCSS historique Agent Workspace à 7,48 kB ; aucun nouvel avertissement du composant Knowledge Base.
- Syntaxe des modules Node et `git diff --check` vérifiées.
- Aucun appel Groq payant pendant les tests. Les cas fournisseur utilisent des doubles ; les associations utilisent SQLite réellement ouvert dans des fichiers de test isolés.
- Vérification visuelle réelle non effectuée : Safari WebDriver refuse toujours les sessions sans « Allow remote automation ». Les captures utilisateur ont guidé la conservation du design ; aucune capture finale ou garantie de rendu responsive réel n'est revendiquée.


## Nettoyage post-5B — une seule expérience Agent

Audit sur `feat/phase-5-support-agent` à partir de `55a367744e3ee6cb1c84aae8bd8a9db999e85425` : working tree propre, 5A et 5B présentes, branche synchronisée. Aucune 5C implémentée ou publiée n'a été identifiée parmi les branches et fichiers disponibles ; les conversations restent futures.

| Élément | Décision | Conséquence |
| --- | --- | --- |
| Ancienne UI objectif/exemples/exécution/réponse/trace/retry | Supprimée | Plus de section Outils d'exploitation ni boutons d'exécution dans le produit |
| Ancien HTML/SCSS et modèle Angular `agent-run.model.ts` | Supprimés | Dépendances exclusives de l'UI retirée ; retrait de l'ancien avertissement de stylesheet |
| `AgentWorkspaceComponent` | Adapté | Route lazy conservée comme simple hôte de `AgentConfigurationComponent` |
| `AgentService.run()` | Supprimé | Service désormais limité aux configurations, documents et tests de support |
| Configuration / Knowledge Base / Tester l'agent | Conservés | Aucun changement de persistance, de formulaire ou de protection de brouillon |
| `server/agent.js` et ses deux outils | Conservés | Boucle bornée, arguments validés, résultats metadata-only et erreurs structurées réutilisables |
| `/api/agent/run` | Conservé et restreint | Opt-in local explicite et loopback obligatoires ; aucun appel frontend ni branchement au Studio |
| Architecture Explorer | Adapté | Flux interne backend documenté, sans ancien nœud UI ni liens vers l'interface supprimée |
| Guided Demo | Adapté | Ne propose plus ce moteur interne comme capacité produit directement accessible |

### Fonctions utiles et limites pour 5E

Le moteur expose `createAgentRunner`, `createAgentRouteHandler`, `AgentRunError` et la validation de l'objectif. Il conserve les schémas d'outils, le parseur strict d'arguments, les requêtes préparées et les limites : objectif 2 000 caractères, historique 25 lignes, quatre itérations/quatre outils, 20 secondes maximum. Les données métier complètes et noms de fichiers ne sont pas retournés par les outils.
`registerInternalAgentRoute` exige explicitement un garde et monte la route avec celui du Dashboard. Contrairement au comportement antérieur, un appel technique sans `DASHBOARD_TELEMETRY_LOCAL_ONLY=true` reçoit désormais 403, avant Groq. La restriction d'origine et le serveur loopback demeurent ; cela ne constitue pas une authentification de production.

Aucun nouveau moteur, outil, accès documentaire ou transfert humain n'est ajouté. Le Studio ne consomme pas ce runner et continue d'utiliser `/api/agents/:id/ask` pour 5B.
Pour la future validation humaine de 5E : définir des états de proposition/approbation/expiration persistés côté serveur, une identité d'approbateur, un lien à la version exacte des arguments et un audit avant toute exécution à effets de bord. Une instruction utilisateur ou un simple bouton frontend ne peut pas tenir lieu d'autorisation. Le point d'exécution d'outils existant pourra être adapté, sans réimplémenter une boucle agent concurrente. Ces capacités ne sont **pas implémentées** par ce nettoyage.

Les tests backend du runner restent conservés. Les tests exclusivement dédiés à son UI supprimée sont remplacés par des tests de la coquille Studio et de ses trois espaces ; le test du service HTTP legacy est retiré. Les suites détaillées 5A/5B restent inchangées. Les anciens chiffres de build ci-dessus décrivent les livraisons historiques ; l'avertissement SCSS historique disparaît après retrait de son import.

## Phase 5C — Conversations persistantes et mémoire courte

### Audit et réutilisation

Base : `11ab51363c6460654ee18fe0d6276ad342f53fee`, branche `feat/phase-5-support-agent`, propre et synchronisée après fetch. 5A et 5B sont présentes ; aucune 5C préalable n'a été trouvée. Les sections précédentes décrivent aussi l'historique des livraisons : leurs indications « futur » concernent leur date de rédaction.

`registerSupportKnowledgeRoutes()` expose désormais son gestionnaire de réponse à `support-conversations.js`. Aucun appel HTTP interne, nouveau moteur RAG ou nouvel outil n'est ajouté. `/ask` conserve sa question indépendante sans création de conversation. `/api/chat` et `/api/agent/run` restent séparés. Le filtrage par agent dans SQL, BM25, quatre passages, le garde lexical, les citations, l'abstention, le timeout et la limite partagée de quatre générations globales / une par agent sont réutilisés.

### Stockage et états

Migration additive `005_support_conversations.sql`, appliquée par le runner existant :

- `support_conversations` : UUID, agent avec cascade, titre de 80 caractères maximum, statut `open`, dates UTC. Index agent/date/ID.
- `support_messages` : séquence entière autoincrémentée pour l'ordre stable, UUID, conversation avec cascade, UUID d'envoi, rôle, texte, statut, date, références de sources et métadonnées. Unicité `(conversation, request_id, role)` ; un seul assistant `pending` par conversation.
- `support_agents.knowledge_revision` : compteur incrémenté par triggers lors d'ajouts/retraits d'associations. Il détecte aussi une révocation suivie d'une réautorisation pendant une génération.

Un envoi écrit atomiquement le message utilisateur `completed` et l'assistant `pending`. L'assistant devient `completed` (réponse citée), `abstained` (message de secours) ou `failed` (incident technique/périmètre modifié). La finalisation et la date d'activité sont transactionnelles. Les erreurs fournisseur ne deviennent pas des réponses réussies. Le texte d'une réponse rejetée n'est pas persisté.

`sources_json` conserve seulement les labels, IDs document/chunk et empreintes SHA-256 des passages, **pas une copie des chunks**. À la lecture, les extraits et métadonnées sont reconstruits depuis le store actuel autorisé. Les métadonnées de réponse peuvent conserver durée mesurée, usage fournisseur nullable, estimation tarifaire et validation d'identité des citations. Aucun score de confiance n'est créé ; l'entailment factuel n'est pas validé. Ces échanges ne sont pas ajoutés aux agrégats FinOps du Dashboard, limités à `/api/chat`. Absence de mesure ou d'estimation ne signifie pas coût nul, notamment après une erreur ou une abstention.

### Endpoints et pagination

Tous exigent le garde local explicite (`DASHBOARD_TELEMETRY_LOCAL_ONLY=true` et loopback), des UUID v4 et l'appartenance de la conversation à l'agent. Aucun mécanisme d'authentification multi-utilisateur n'est ajouté.

| Méthode | Route relative à `/api/agents/:id` | Contrat |
| --- | --- | --- |
| GET | `/conversations?limit=30&offset=0` | `{items,total,limit,offset}`, limite 1–50, offset 0–10 000, tri activité décroissante puis UUID |
| POST | `/conversations` | Corps JSON `{}` uniquement, 201 et conversation créée ; agent actif requis |
| GET | `/conversations/:conversationId?limit=30&before=N` | `{conversation,items,nextBefore}`, derniers messages ordonnés par séquence croissante, curseur exclusif vers les anciens |
| POST | `/conversations/:conversationId/messages` | JSON `{question,requestId}`, question non vide ≤ 2 000 caractères, UUID v4 d'idempotence ; `{items}` utilisateur/assistant |
| DELETE | `/conversations/:conversationId` | 204 après suppression réelle et cascade |

Les objets conversation utilisent les noms SQL (`agent_id`, `created_at`, `updated_at`), les messages un contrat camelCase (`requestId`, `createdAt`, `nextBefore` pour la page). Les paramètres SQL sont liés. Les champs et paramètres de pagination inconnus sont rejetés. CORS autorise `DELETE` uniquement sur la ressource d'une conversation précise ; les politiques des anciennes routes ne sont pas élargies.

Erreurs : 400 `invalid_id`/`invalid_body`/`invalid_page` ; 403 garde local ou origine interdite ; 404 `not_found` identique pour conversation absente ou d'un autre agent ; 409 `agent_inactive`, `conversation_busy`, `idempotency_conflict`, `scope_changed`, `conversation_limit` ou `message_limit` ; 429 limite partagée du pipeline ; 502 fournisseur et 504 timeout ; 500 stockage. Une erreur de génération peut renvoyer la paire persistée avec son état `failed`. Les détails privés du fournisseur ne sont pas exposés.

### Mémoire et recherche de suivi

La mémoire n'est pas un historique illimité : au maximum **six anciens messages utilisateur**, uniquement les tours ayant produit un assistant `completed`, avec **4 000 caractères au total, question actuelle incluse**. Les messages les plus récents sont prioritaires ; le plus ancien retenu peut être tronqué. Aucun ancien message assistant ni extrait historique n'est envoyé à Groq.

Recherche explicable, sans deuxième appel LLM : question actuelle puis derniers messages utilisateur du plus récent au plus ancien, maximum 4 000 caractères, envoyés au même `searchDocumentChunks()` scoped. Le tokenizer FTS existant conserve au plus 32 termes et utilise OR/BM25. Le garde lexical s'applique à cette requête enrichie. Le prompt distingue les questions historiques non fiables des nouvelles sources ; seules ces dernières peuvent étayer une réponse.

Limites : pas de résolution sémantique garantie de « ce produit » ; les termes d'un sujet précédent peuvent ramener du contexte peu pertinent. Les synonymes non présents lexicalement et les changements de sujet restent difficiles. Une citation valide prouve une identité de source, pas que chaque affirmation est étayée. Le système privilégie l'abstention lorsque ses gardes échouent, sans promettre zéro hallucination.

### Révocation, concurrence et reprise

Le pipeline recharge le périmètre à chaque tour et revalide statut, version d'agent, IDs autorisés et révision documentaire après Groq. La couche conversation revalide encore avant persistance, ainsi que l'existence de la conversation. Révocation, suppression et désactivation pendant génération empêchent de conserver la réponse tardive. Le timeout utilise AbortController et Promise.race ; aucune réponse fournisseur arrivée après le timeout ne finalise le message une seconde fois.

À la lecture historique, si un passage a disparu, changé ou n'est plus autorisé, **toute la réponse assistant concernée est masquée**, marquée `stale`, et ses sources sont retirées. La réponse originale reste en clair dans SQLite jusqu'à suppression de la conversation. Une réautorisation du même passage inchangé peut rendre l'historique à nouveau visible. Une révocation ne retire pas rétroactivement ce qui a déjà été vu, copié ou chargé dans un onglet : recharger l'historique applique la politique actuelle. Le code utilisateur passé est du contexte de question, jamais une nouvelle permission.

Une clé UUID par envoi évite les doublons : même clé et même question renvoient la paire existante (202 si encore pending, 200 sinon), sans nouvelle inférence. Même clé et autre question : 409. Une autre requête simultanée dans la conversation : 409 ; les limites par agent/globales du pipeline s'appliquent également. Un résultat failed n'est pas relancé automatiquement : un nouveau tour requiert une nouvelle clé. L'UI conserve la clé lors d'un retry réseau de la même saisie ; elle n'est pas persistée dans le navigateur.

Une génération se poursuit après déconnexion du navigateur, dans la limite du timeout, pour permettre de consulter son résultat après rechargement. Au démarrage **d'un unique processus BFF local**, les pending abandonnés passent en `failed` avec code `interrupted`. Aucun appel payant n'est relancé. Ce mécanisme n'est pas un coordinateur multi-processus ; ne pas partager ce fichier entre plusieurs BFF concurrents.

### Rétention, interface et limites de sécurité

Politique de **taille**, sans expiration automatique : 50 conversations maximum par agent, 200 messages (100 paires) maximum par conversation. Les quotas sont vérifiés transactionnellement ; une fois atteints, supprimer explicitement une conversation avant d'en créer une autre. Aucun timer de purge ni fausse promesse d'effacement automatique. La suppression confirmée dans l'UI appelle DELETE et supprime réellement les messages par cascade. Elle ne garantit pas l'effacement forensique du fichier SQLite, de ses sidecars ou de sauvegardes.

Le Studio ajoute **Conversations** à côté des trois espaces conservés. Liste paginée, création, sélection, confirmation de suppression, historique à curseur, citations inspectables, abstention et erreurs distinctes. Les réponses sont interpolées comme texte, jamais injectées en HTML. Les messages pending sont relus toutes les 1,5 secondes tant que le composant est présent ; le polling est annulé à sa destruction. Changer d'agent vide les données de l'ancien et ignore ses réponses HTTP tardives. Les opérations en cours bloquent la navigation du Studio ; les gardes de brouillon 5A/5B restent en place. Agent inactif : historique lisible, nouvelle génération interdite. La zone de messages défile indépendamment et les contrôles restent natifs au clavier.

Stockage **local en clair**, potentiellement sensible. Le garde loopback/CORS n'est pas une authentification ; ne pas publier ce BFF derrière un proxy public. Avant production : authentification, autorisation par utilisateur/organisation, chiffrement adapté, gestion des secrets, sauvegardes protégées, politique de conservation, gestion des données personnelles et revue de sécurité. Aucune conformité RGPD n'est revendiquée.

### Démonstration manuelle 5C

1. Démarrer le BFF local avec le flag local et une clé Groq uniquement côté serveur. Créer/activer un agent et lui associer un document de test non sensible sur les retours.
2. Ouvrir Conversations, créer un échange, demander la politique de retour puis « Et si le produit est déjà ouvert ? ». Les inférences manuelles explicites sont réelles et peuvent être payantes.
3. Inspecter les citations, comparer aux documents ; recharger Angular puis redémarrer le BFF et rouvrir l'échange. Aucun ancien pending ne doit déclencher d'inférence automatique.
4. Retirer le document de Knowledge Base, recharger l'historique : réponse masquée et sources absentes. Poser une autre question : aucune recherche globale ne doit contourner le périmètre vide.
5. Désactiver l'agent, consulter l'historique et vérifier les contrôles de génération désactivés. Supprimer avec confirmation et vérifier l'absence après rechargement.
6. Recontrôler Configuration (brouillon), Knowledge Base (brouillon), Tester l'agent indépendant, desktop/tablette/mobile et clavier. Le contrôle visuel réel reste nécessaire si Safari refuse WebDriver.

La Phase 5D pourra s'appuyer sur les UUID, les états et les conversations persistantes pour classifier les demandes et concevoir une escalade/n8n. Aucune classification, notification, intégration n8n ou validation humaine n'est implémentée en 5C. Le moteur technique `/api/agent/run` reste inchangé pour 5E.

### Validation automatisée de la livraison 5C

- Angular : **18 suites, 128 tests réussis** (`npm test -- --runInBand`). Les tests soumettent le formulaire natif, contrôlent les quatre espaces et les brouillons 5A/5B, création/sélection/suppression, retry, polling, changements d'agent, abstention et erreurs. JSDOM ne prouve pas l'activation clavier native ni le rendu responsive d'un navigateur.
- Backend : **115 tests réussis** (`npm test`), SQLite temporaire isolé et Groq simulé : réouverture réelle de SQLite, pagination, mémoire et suivi, isolation, révocations pendant/entre tours, retrait/réajout, timeout/réponse tardive, idempotence/concurrence, cascade, rollback, récupération pending, quotas, CORS et usage/coûts nullable. Non-régressions `/ask`, `/api/chat` et moteur interne incluses.
- Build production réussi, **426 215 octets initiaux**, cinq routes lazy conservées. Chunk agent : **62 062 octets** ; stylesheet Conversations : **2 753 octets**. Budgets inchangés (initial warning 500 kB ; composant warning 4 kB / error 8 kB), aucun avertissement Angular.
- `git diff --check`, vérification des imports et scan des fichiers concernés : aucun secret reconnaissable, fichier SQLite, sidecar ou artefact généré ajouté. Ce scan ne constitue pas une garantie exhaustive d'absence de secret dans l'historique du dépôt.
- Safari WebDriver réellement tenté : session refusée parce que « Allow remote automation » est désactivé. **Aucune validation visuelle desktop/tablette/mobile ni capture réalisée**. Aucun appel Groq réel dans les tests ; la qualité linguistique d'une conversation réelle reste à évaluer manuellement.
