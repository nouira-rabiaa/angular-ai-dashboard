# 🚀 Enterprise AI Engine & RAG Dashboard

> Conçu et développé par **Rabiaa NOUIRA**

Dashboard Angular 19 et BFF Node.js/Express : RAG lexical avec citations, génération de formulaires et suivi/prévision des coûts IA. Démonstration locale sans authentification utilisateur. Les Phases 5A/5B/5C ajoutent les configurations persistantes, les documents autorisés par agent, une prévisualisation RAG stricte et les conversations persistantes à mémoire bornée. La Phase 5D-1 ajoute des tickets persistants avec classification déterministe et audit ; les escalades effectives restent à développer.

## 🏗️ Architecture & Technical Stack

- **Frontend :** Angular 19 standalone, Signals, Reactive Forms, Tailwind CSS, cinq routes chargées à la demande.
- **Backend :** Express, Groq, Multer, pdf-parse, better-sqlite3.
- **RAG :** PDF/TXT/CSV → texte → segments de 400 caractères maximum → SQLite FTS5 `MATCH`, classement BM25 → contexte Groq. Aucun embedding ni recherche vectorielle. Les citations valident des références de passages, pas l’exactitude factuelle des réponses.
- **Observabilité :** tokens retournés par Groq, durées mesurées côté serveur et coûts estimés à partir des tarifs configurés. `/api/tokens` utilise séparément tiktoken; le service Transformers.js de sentiment n’est pas consommé par les parcours actuels.

Voir [ARCHITECTURE](docs/ARCHITECTURE.md), [TECHNIQUES](docs/TECHNIQUES.md) et [FinOps Phase 4](docs/FINOPS.md).

## Support Agent Studio — Phases 5A / 5B / 5C / 5D-1

Dans **Support Agent Studio** (`/agent-workspace`), créez, modifiez et activez/désactivez des configurations sauvegardées dans SQLite. Activez `DASHBOARD_TELEMETRY_LOCAL_ONLY=true` pour les API locales de configuration. L'ancienne interface « Outils d'exploitation » a été supprimée. Le moteur backend est conservé comme capacité technique locale, sans raccordement automatique au Studio.

Cinq espaces conservent le même design : **Configuration**, **Knowledge Base**, **Tester l’agent**, **Conversations** et **Tickets**. Associez explicitement des documents existants, puis envoyez une question à une configuration active. Le serveur filtre FTS5 dans SQL par agent et s'abstient si le contexte lexical ou les références sont insuffisants. Tester l’agent reste indépendant sans historique. Conversations conserve réellement les échanges dans SQLite avec mémoire utilisateur bornée, citations contrôlées et suppression confirmée. Le stockage local est en clair : ne saisissez pas de secrets. Limites : 50 conversations/agent, 200 messages/conversation, sans expiration automatique. La sauvegarde ne lance aucun appel IA et l'activation ne déploie pas un agent. Voir [périmètre, sécurité, tests et démonstration Phases 5A/5B/5C](docs/PHASE5_SUPPORT_AGENT.md).

Les tickets se créent manuellement ou depuis une conversation, après confirmation. Catégories/priorités/statuts contrôlés, filtres, historique transactionnel, idempotence et protection des brouillons FR/EN ; aucun appel Groq pour les opérations Tickets. La suppression d’une conversation conserve les textes confirmés du ticket et retire ses liens. [Migration 006, API, limites et scénario fictif NovaShop NS-2026-1042](docs/PHASE5D_TICKETS.md).

## ✨ Key Features & Deep Dive

### 1. RAG Pipeline & Recherche Lexicale

Les passages sont persistés dans SQLite, avec une portée par document ou tous documents. Le serveur envoie jusqu’à quatre passages à Groq et renvoie les sources citées/non citées. Sans passage retrouvé, il demande une réponse générale, sans prétendre à un fondement documentaire. Les anciens libellés UI évoquant la vectorisation ne décrivent pas le pipeline réel.

### 2. FinOps & Prévision des dépenses — Phase 4

Dans **Dashboard → Vue d’ensemble**, le suivi existant permet de filtrer les périodes, consulter les tokens/coûts par requête et l’historique journalier. Le panneau FinOps ajoute :

- Coût observé **estimé** du mois UTC, couverture tarifée et sous-totaux par modèle.
- Projections sur 7 jours, 30 jours et fin de mois; comparaison graphique de l’historique et des coûts quotidiens projetés, avec tableau accessible.
- Budget mensuel partagé persisté dans SQLite et alertes locales à **80 % / 100 %**, séparées entre observé et projeté.
- Simulation sans appel IA : requêtes/jour, tokens moyens d’entrée/sortie, modèle aux tarifs configurés et budget de scénario.
- États chargement, erreur, historique vide, **Données insuffisantes** et coûts indisponibles. Aucun tarif par défaut ni coût inconnu remplacé par zéro.

**Formule :** moyenne journalière des coûts des jours UTC terminés (fenêtre maximale de 30 jours), puis multiplication par l’horizon. Minimum : 7 jours calendaires, 10 requêtes tarifées, 3 jours actifs et 100 % de couverture de coût dans l’échantillon. La fin de mois tient compte du mois civil et évite de compter deux fois le jour courant. Les détails, limites et règles de couverture figurent dans [FINOPS.md](docs/FINOPS.md).

Les estimations ne sont **jamais** une facture. La couverture est limitée aux traces `/api/chat` persistées, sans garantie de couvrir tous les appels ou tentatives Groq. Aucune notification externe n’est envoyée.

### 3. Dynamic Form Generation & SQLite Persistence

La génération retourne un schéma JSON interprété par Angular. La soumission est une action distincte, persistée avec des paramètres SQL liés. Les formulaires ne récupèrent pas automatiquement le contexte RAG. Le moteur interne historique reste distinct du chat et du Studio de support ; il n’a plus d’interface utilisateur et nécessite le mode local explicitement activé.

## 🛡️ Best Practices & Engineering Standards

- Clé Groq côté serveur; pas de clé nécessaire pour les calculs FinOps ou leurs tests.
- BFF lié au loopback; télémétrie et FinOps activés uniquement par configuration explicite. CORS n’est pas une authentification : ne pas exposer cette démonstration par tunnel ou reverse proxy public.
- Paramètres numériques validés côté serveur. Budget partagé entre utilisateurs de la même base locale, sans isolation multi-utilisateur.
- Aucune modification du pipeline FTS5/BM25 par la Phase 4; migration additive `002_finops_budget.sql`.

## 🛠️ Getting Started Locally

Utiliser Node.js 24 (comme la CI). Depuis la racine :

```bash
npm ci
(cd client && npm ci --legacy-peer-deps)
(cd server && npm ci)
```

Configurer `server/.env` localement (ne pas le committer) :

```dotenv
GROQ_API_KEY=<votre-cle-locale>
DASHBOARD_TELEMETRY_LOCAL_ONLY=true
HOST=127.0.0.1
PORT=3000
```

Ajouter `GROQ_MODEL_PRICING` avec les identifiants exacts et tarifs USD **vérifiés par vos soins** par million de tokens d’entrée/sortie, conformément à [la configuration](docs/FINOPS.md#configuration). Sans tarifs valides, les simulations sont indisponibles; les coûts historiques déjà persistés restent consultables. Redémarrer le BFF après une modification de configuration.

Dans deux terminaux :

```bash
# Terminal backend
cd server
npm start
```

```bash
# Terminal frontend
cd client
npm start
```

Ouvrir `http://localhost:4200/dashboard`. SQLite est créé au démarrage dans le répertoire de travail du serveur; les migrations s’appliquent automatiquement. Aucun ancien fichier de données n’est nécessaire.

Pour utiliser FinOps : consulter la couverture et les projections, enregistrer un budget positif (champ vide pour le désactiver), puis sélectionner un modèle tarifé et lancer une simulation. Le budget de scénario est indépendant du budget persistant. Le panneau FinOps utilise le mois courant et sa fenêtre fixe, indépendamment du filtre de période des métriques existantes.

### Validation sans appels IA payants

```bash
(cd server && npm test)
(cd client && npm test -- --runInBand)
(cd client && npm run build)
git diff --check
```

## 👨‍💻 Author

Rabiaa NOUIRA — Enterprise Full-Stack & AI Engineer

## 📝 License

MIT.
