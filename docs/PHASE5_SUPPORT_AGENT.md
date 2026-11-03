# Phase 5A — Support Agent Studio

Enterprise AI Dashboard — AI Operations & FinOps Platform.

## Objectif et périmètre livré

Créer, consulter, modifier et activer/désactiver des **configurations** de support client persistantes.
Le Studio vit dans la route existante `/agent-workspace` : aucune seconde page Agent concurrente.
L'activation est un état de configuration, **pas** un déploiement ni un chat de support opérationnel.
5A ne lance aucun appel Groq. Aucune réponse IA, citation, conversation ou escalade n'est fabriquée.

## Audit de la base existante

Base auditée : `f2e46f929578bf63143b4d78ca62375b74cebd21`, sur `main` synchronisée avec `origin/main`.
Les commits UI `a417dba` et `f2e46f9` sont intégrés ; les anciennes branches UI restent conservées.
Le working tree était propre avant création de `feat/phase-5-support-agent`.

| Élément | Avant 5A | Réutilisation / évolution |
| --- | --- | --- |
| Agent Workspace | Fonctionnel : objectif, exemples, attente, réponse, erreurs/retry et trace | Conservé dans « Outils d'exploitation », dépliable sous le Studio |
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
- **5B** : base documentaire autorisée par agent, recherche FTS5/BM25 et citations ; réponse d'insuffisance stricte.
- **5C** : conversations/messages persistants, reprise et contexte borné.
- **5D** : demandes d'escalade humaine et historique de traitement ; aucune notification externe implicite.
- **5E** : observabilité par agent, usage réel nullable, latence et coûts estimés avec les fonctions FinOps existantes.

Ces sous-phases futures ne sont pas annoncées comme implémentées.

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
La future intégration Groq utilisera le champ fournisseur `max_completion_tokens`, mais 5A ne transmet aucun paramètre à Groq.
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
Il n'existe encore ni RBAC, ni chiffrement applicatif au repos, ni liaison documentaire autorisée, ni sauvegarde métier automatique.
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
9. Déplier « Outils d'exploitation » pour retrouver l'ancien runner. Ne lancer une exécution Groq que sur action volontaire ; elle reste indépendante des configurations.
10. Contrôler desktop, tablette et mobile, focus clavier et avertissement de brouillon. La disponibilité de Safari WebDriver dépend de « Allow remote automation ».

## Plan détaillé de 5B

1. Ajouter une relation agent–document avec clés étrangères, sans copier les chunks ou reconstruire un index.
2. Filtrer dans SQL la recherche FTS5/BM25 sur l'ensemble **autorisé** par l'agent ; valider les associations côté serveur.
3. Séparer les règles serveur immuables des instructions métier configurables et traiter les documents comme données non fiables.
4. Réutiliser l'extraction des passages et l'identification des citations existantes. Refuser une réponse documentaire sans sources suffisantes, sans basculer silencieusement vers une réponse générale.
5. Tester l'absence de fuite inter-agent, les documents retirés, l'absence de résultat et les labels invalides, avec Groq simulé.
6. Préparer ensuite 5C : conversations/messages, contexte borné, isolation, budget de tokens et effacement explicite. Ne pas mélanger ces données aux traces metadata-only existantes.

Avant production : définir authentification/autorisation, politique de rétention des configurations/conversations, chiffrement/sauvegardes et contrôles d'accès documentaires. Revalider les capacités du fournisseur et conserver coûts manquants/usage indisponible comme tels.

## Validation de cette livraison

- Frontend : **108 tests réussis, 16 suites** (`npm test -- --runInBand`).
- Backend : **83 tests réussis** (`npm test`), bases isolées et doubles Groq.
- Build production : réussi, initial **423 704 octets bruts**, cinq routes lazy conservées, budgets inchangés.
- Seul avertissement : stylesheet historique Agent Workspace **7,48 kB** pour un seuil d'avertissement de 4 kB ; erreur à 8 kB. Aucun nouvel avertissement du Studio.
- Vérifications de syntaxe Node et `git diff --check` réussies.
- Contrôle visuel non réalisé : Safari WebDriver refuse la session tant que « Allow remote automation » est désactivé. Aucune capture desktop/mobile ou validation de rendu réel n'est revendiquée.
