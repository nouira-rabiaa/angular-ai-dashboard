# Phase 5D-1 — Tickets persistants

## Audit et intégration

Base : `9ad786e4b4e55fc8cab0d1e8a72c6e085be1775d`, branche `feat/phase-5-support-agent`, propre avant ce travail. Les migrations 001–005, UUID d’agents/conversations/messages, contrôles d’appartenance, garde local, services Angular et Transloco existants sont réutilisés. Aucun ticket n’existait à cette base. Les décisions ci-dessous ont été établies avant implémentation et complètent le travail repris après interruption.

Les tickets sont intégrés comme cinquième espace du Studio, sans route supplémentaire. Configuration, Base documentaire, Tester l’agent et Conversations sont conservés. Le chat reste monté pendant la navigation vers Tickets ; un brouillon Tickets bloque le changement d’agent, d’espace ou de ticket tant qu’il n’est pas confirmé ou annulé. La bascule FR/EN ne recrée pas les formulaires et ne provoque aucune requête HTTP. Les contenus métier restent dans leur langue initiale.

**Périmètre :** création manuelle ou depuis une conversation, classification par règles ou choix manuel, liste/recherche/filtres/pagination, détail, modification de statut/priorité/catégorie et événements. Aucun Groq, transfert humain, n8n, tool calling supplémentaire ou fonctionnalité 5D-2/5D-3/5E. Le produit reste une démonstration locale sans authentification.

## Migration 006

`server/migrations/006_support_tickets.sql` est additive et suit `runMigrations()` : transaction par fichier et clé dans `schema_migrations`, clés étrangères activées. Les migrations précédentes ne sont pas réécrites.

- `support_tickets` : UUID stable non nul, `agent_id`, `conversation_id` et `source_message_id` facultatifs, titre 1–160 caractères, description 1–4 000, catégorie/priorité/statut contrôlés, source/raison de classification, confiance toujours NULL, version entière positive et horodatages UTC. `closed_at` est présent uniquement pour `closed` ; rouvrir le ticket le remet à NULL. Les transitions entre les cinq statuts sont autorisées : aucun workflow d’approbation humaine n’est prétendu.
- `request_id` et hash SHA-256 du payload normalisé ; unicité `(agent_id, request_id)` pour la création.
- `support_ticket_events` : ID croissant, ticket, type, anciennes/nouvelles valeurs, date et origine `local_user` / `system`. Création et classification initiale produisent chacune un événement. Les mutations et événements sont dans la même transaction. Aucun endpoint ne modifie/supprime un événement ; un trigger interdit UPDATE de l’historique.
- Index agent/date, agent/statut/date, conversation, message et ticket/ID d’événement.
- Triggers et clés étrangères empêchent les références à une conversation d’un autre agent ou à un message d’une autre conversation, y compris via une écriture SQL hors API.

Suppression d’une conversation : ticket conservé, liens conversation/message mis à NULL, événements système, version incrémentée pour chaque lien retiré. Suppression d’un message seul : seul le lien source est retiré et audité. **Le titre et la description copiés puis confirmés dans le ticket restent conservés**, même après suppression de la conversation : ce sont désormais des données de support indépendantes. Cette rétention est annoncée avant confirmation. Suppression physique d’un agent : cascade sur ses tickets et événements, conformément à la cascade existante par agent. Aucun endpoint de suppression d’agent ou ticket n’est ajouté.

Les tests créent uniquement des bases temporaires ou en mémoire, vérifient le passage exact 001–005 → 006, la réouverture, les contraintes et `foreign_key_check`. Sur une base sans 006, le démarrage volontaire du backend applique cette migration automatiquement : effectuer d’abord une sauvegarde SQLite cohérente hors Git, notamment si WAL est actif. La base locale de démonstration a déjà reçu 006 et la réparation explicite décrite plus bas, après autorisation et sauvegarde vérifiée. Les tests n’appliquent aucune migration à cette base locale.

## API et sécurité

Toutes les routes exigent le garde local existant : `DASHBOARD_TELEMETRY_LOCAL_ONLY=true` et requête loopback réelle. Le préflight CORS ajoute PATCH uniquement au détail d’un ticket ; aucun PUT/DELETE supplémentaire. Les anciennes routes conservent leur politique.

| Méthode | Route | Contrat |
| --- | --- | --- |
| GET | `/api/agents/:id/tickets` | `{items,total,limit,offset,counts}` ; filtres `status`, `priority`, `category`, `conversationId`, `search` |
| POST | `/api/agents/:id/tickets` | `{requestId,title,description,conversationId?,sourceMessageId?,category?,priority?}` ; 201 ou 200 pour un replay |
| GET | `/api/agents/:id/tickets/:ticketId` | Détail appartenant à cet agent |
| PATCH | `/api/agents/:id/tickets/:ticketId` | `version` et au moins un de `status`, `priority`, `category` |
| GET | `/api/agents/:id/tickets/:ticketId/events` | Événements paginés par ID croissant |

Pagination par défaut 25, maximum 50, offset 0–10 000. Liste triée `updated_at DESC, id ASC`, recherche littérale titre/description jusqu’à 100 caractères, sans joker SQL. La recherche `lower()` SQLite n’offre pas de normalisation linguistique Unicode complète. Limite : 1 000 tickets par agent. Les compteurs sont les totaux réels de l’agent **tous filtres confondus** ; `total` correspond aux filtres. L’agent se filtre par le chemin/choix d’agent du Studio. Les conversations proposées pour association sont bornées au maximum existant de 50 par agent.

Les associations sont vérifiées côté serveur ; une référence inter-agent retourne 404, sans détail d’une autre ressource. La séparation par agent est un contrôle applicatif local, pas du multi-tenant authentifié. Les champs inconnus, mauvais types, UUID, limites et enums invalides sont refusés. POST/PATCH exigent JSON et aucun paramètre de requête. Titre/description et rattachements sont immuables après création dans cette phase. Aucune modification de schéma via l’API, ni SQL utilisateur.

Erreurs structurées `{code,error}` : 400 (`invalid_body`, `invalid_query`, `invalid_id`), 404 (`not_found`, `invalid_reference`), 409 (`idempotency_conflict`, `version_conflict`, `ticket_limit`), 500 (`storage_error`). Le garde local peut répondre 403 selon son contrat existant. Un HttpContext interne préserve les erreurs HTTP structurées pour `SupportTicketService` à travers l’intercepteur global, dont le comportement historique est conservé par défaut pour les autres consommateurs. Il n’ajoute aucun en-tête réseau. Le frontend traduit des erreurs sûres selon le statut HTTP, sans afficher de SQL ou stack trace. Les textes de conversation ne sont pas ajoutés aux logs techniques.

## Classification et idempotence

Taxonomie persistée indépendante de la langue :

- Catégories : `technical`, `billing`, `account`, `product`, `defective_product`, `returns`, `delivery`, `general`, `other`.
- Priorités : `low`, `medium`, `high`, `urgent`.
- Statuts : `open`, `in_progress`, `waiting`, `resolved`, `closed`.
- Sources : `manual`, `rules`. Aucune classification IA ni mesure de confiance.

Sans catégorie/priorité explicites, le serveur normalise accents/casse puis applique des mots-clés bornés, dans cet ordre : produit défectueux, retour/remboursement, livraison, facturation, compte, technique, produit, information générale ; sinon `other`. La raison enregistre la catégorie et la priorité ainsi que `keywords` ou `default`, sans recopier de texte privé. Pour la priorité : urgent/critical/critique → urgent ; blocked/blocking/outage/bloqué/bloquante/panne → high ; suggestion/feature request → low ; sinon medium. La préférence d’un mot-clé et les négations ne sont pas comprises sémantiquement : ces règles explicables restent corrigibles et ne décident jamais d’un remboursement ou d’une autre action métier.

Les deux champs peuvent être fournis ensemble pour un choix manuel. Une correction effective de catégorie/priorité passe la source à `manual` et est auditée. Au premier passage depuis `rules`, un événement `classification_changed` (« Correction manuelle de classification ») accompagne le changement de priorité ou de catégorie : il décrit la provenance de la classification, sans modifier implicitement l’autre champ. Un changement de statut seul conserve cette provenance ; les changements manuels suivants ne répètent pas cet événement et un enregistrement sans changement ne produit aucun événement. Le formulaire demande une confirmation explicite avant POST ; il affiche le résultat réellement enregistré, sans inventer de classification prédictive.

Une création est identifiée par `(agent_id, requestId)`. Même clé et même payload normalisé → même ticket sans nouvel événement ; même clé et payload différent → 409. Le frontend bloque les doubles clics pendant l’envoi et conserve la clé lors d’un retry du même brouillon après erreur réseau. Modifier le brouillon crée une nouvelle intention et une nouvelle clé : après un envoi incertain, réessayer **sans le modifier** ou recharger la liste avant d’en créer un autre. Annuler n’annule pas une écriture qui aurait déjà réussi côté serveur.

Une mise à jour exige la version courante. Un conflit préserve la saisie : annuler les changements locaux, recharger le détail puis réappliquer. Une mise à jour sans changement réel ne crée ni version ni événement. Les lectures et écritures frontend ont un timeout de 15 secondes ; une lecture de conversation est toujours un GET, jamais une génération.

## Tests et limites

Les tests backend couvrent migrations/contraintes/persistance, classification FR/EN et NovaShop, appartenance API/SQL, validation, pagination/filtres/tri/recherche littérale, idempotence concurrente, patch optimiste, fermeture/réouverture, événements, rollback forcé, suppression conversation/message/agent, quota et garde/CORS. Aucun appel Groq réel.

Les tests Angular couvrent service scoped, liste et états, formulaires et confirmation, retry/idempotence, classification manuelle, brouillons FR/EN, filtres/pages, détail/statut/version, événements et retours tardifs, conversation d’origine, destruction, affichage sûr du texte. Les tests d’intégration Studio démontrent NovaShop, les protections du brouillon, la conservation du chat monté et l’absence de requête de génération. Tous les anciens tests restent présents ; seules les attentes du nombre de migrations et du cinquième onglet sont adaptées.

La validation responsive réelle reste à effectuer : Safari WebDriver refuse les sessions sans « Allow remote automation ». Aucune capture ni validation Safari desktop/mobile n’est revendiquée. CSS dédié au composant, sans nouveau framework, déplacement global ou augmentation de budget.

## Scénario Safari NovaShop — données fictives

1. Après sauvegarde cohérente de la base et validation technique, démarrer normalement le backend local avec son flag local et le frontend. Le démarrage applique 006 automatiquement ; aucun script de reset n’est nécessaire.
2. Sélectionner ou enregistrer un agent **NovaShop — démonstration fictive**. L’activer permet de créer une conversation ; sauvegarde et activation n’effectuent aucun appel IA.
3. Dans Conversations, créer une nouvelle conversation **sans envoyer de message**. Cliquer « Créer un ticket ». Si l’on utilise plutôt une conversation de test déjà remplie, seuls le dernier message utilisateur chargé et son ID préremplissent la description ; aucune conversation n’est modifiée.
4. Saisir le titre « NovaShop — casque Bluetooth défectueux — NS-2026-1042 » et la description « Scénario fictif : Sophie Martin signale un casque Bluetooth défectueux pour la commande NS-2026-1042 ». Garder la conversation sélectionnée et la classification par règles.
5. Cliquer « Vérifier avant création » : aucun ticket enregistré à cette étape. Vérifier l’association et le contenu ; basculer EN puis FR pour constater la conservation de la saisie. Confirmer une seule fois.
6. Vérifier le ticket réel : catégorie **Produit défectueux**, priorité **Moyenne**, statut **Ouvert**, source **Règles déterministes**, événements Création et Classification initiale. Aucune décision de remplacement/remboursement ni inférence IA n’a été déclenchée.
7. Recharger la page, sélectionner le même agent puis Tickets : le ticket doit persister. Rechercher `NS-2026-1042`, filtrer la catégorie et ouvrir le détail.
8. Passer à **En cours**, enregistrer, puis vérifier l’événement avec anciennes/nouvelles valeurs. Fermer puis rouvrir le ticket pour tester `closed_at`. Modifier manuellement la priorité/catégorie si nécessaire et vérifier l’audit.
9. Ouvrir la conversation liée. Un message non envoyé dans une autre conversation doit être conservé et empêcher son remplacement silencieux. Tester le passage Conversations/Tickets, les filtres, le clavier et les largeurs 375/768/1280/1440 px.
10. Facultativement supprimer la conversation fictive via son contrôle existant : le ticket demeure, ses liens deviennent absents et les événements système sont visibles. Ses textes confirmés restent stockés.

Les parcours NovaShop (création, catégorie produit défectueux, persistance après rechargement, statut/priorité, audit et conversation vers ticket) ont été validés manuellement dans Safari par le propriétaire. Cela ne constitue pas une validation responsive instrumentée. Le commit local de livraison est autorisé ; aucun push ni fusion dans main dans cette revue finale.

## Résultats de validation finale

- `npm test --prefix client -- --runInBand` : **24 suites, 182 tests réussis**.
- `npm test --prefix server` : **130 tests réussis**, dont les tests Tickets et la mise à niveau 001–005 → 006 ; aucun appel Groq réel.
- `npm run build --prefix client -- --stats-json` : réussi, aucun avertissement Angular. Le runner de migration de la base locale n’est pas lancé par ces commandes.
- `npm run check:i18n --prefix client` : **883 clés non vides par langue**, interpolations et références vérifiées.
- Bundle initial brut : **439 835 octets**, soit **+207 octets** par rapport à UX-3B (439 628). Transfert estimé Angular : **106,46 kB**. Chunk lazy du Studio : **102 979 octets**. Catalogues différés : **67 220 octets FR**, **57 859 octets EN** ; ils sont chargés selon la stratégie i18n existante et ne sont pas compris dans le total initial.
- Stylesheet Tickets : **2 996 octets** ; maximum des stylesheets de composant : **3 971 octets** (compilation Sass puis minification esbuild, mesure séparée ; le build Angular confirme le respect des budgets). Budgets conservés : initial 500 kB/1 MB, composant 4/8 kB. Cinq routes lazy conservées.
- `git diff --check` : réussi. Aucun changement des dépendances, budgets, pipeline RAG, calculs FinOps ou anciennes migrations 001–005. Aucun commit/push.
- Aucun avertissement relevé dans les journaux de cette validation finale ; aucun test supprimé ou désactivé.
- Safari WebDriver : session refusée car « Allow remote automation » n’est pas activé ; aucune validation visuelle responsive ni capture réalisée.

## Fichiers de cette livraison locale

34 fichiers liés à la livraison :

```text
README.md
client/scripts/check-i18n.mjs
client/src/app/components/agent-workspace/agent-configuration.component.html
client/src/app/components/agent-workspace/agent-configuration.component.ts
client/src/app/components/agent-workspace/agent-conversations.component.html
client/src/app/components/agent-workspace/agent-conversations.component.ts
client/src/app/components/agent-workspace/agent-workspace.component.spec.ts
client/src/app/i18n/catalogs/en.json
client/src/app/i18n/catalogs/fr.json
client/src/app/i18n/ui-shell.spec.ts
client/src/app/interceptors/error.interceptor.ts
client/src/app/services/agent.service.ts
docs/ARCHITECTURE.md
docs/I18N.md
docs/PHASE5_SUPPORT_AGENT.md
docs/TECHNIQUES.md
server/cors-policy.js
server/index.js
server/inference-history.test.js
server/support-knowledge.test.js
client/src/app/components/agent-workspace/agent-tickets.component.html
client/src/app/components/agent-workspace/agent-tickets.component.scss
client/src/app/components/agent-workspace/agent-tickets.component.spec.ts
client/src/app/components/agent-workspace/agent-tickets.component.ts
client/src/app/components/agent-workspace/ticket-studio.integration.spec.ts
client/src/app/interceptors/preserve-http-error.ts
client/src/app/models/support-ticket.model.ts
client/src/app/services/support-ticket.service.spec.ts
client/src/app/services/support-ticket.service.ts
docs/PHASE5D_TICKETS.md
server/migrations/006_support_tickets.sql
server/support-tickets.js
server/support-tickets.test.js
server/schema-repairs/support-tickets.js
```

### Diagnostic : ancienne version de la migration 006 déjà enregistrée

Une base ayant appliqué une version intermédiaire de 006 peut refuser les nouvelles
catégories (dont `defective_product`) et l'événement `classified`. Le backend renvoie
alors `500 storage_error` et la transaction annule la création entière. Relancer le
serveur ou modifier le fichier 006 ne réapplique pas une migration déjà enregistrée.

`server/schema-repairs/support-tickets.js` exporte une réparation de maintenance
explicite, non raccordée aux routes ni au démarrage. Elle reconstruit les deux tables
Tickets avec le schéma 006 courant dans une transaction, préserve les lignes et le
compteur des événements, recrée les index/déclencheurs et vérifie les clés étrangères.
Les conversations, messages et versions de migrations ne sont pas modifiés. Une
dépendance entrante inconnue provoque un refus. Cette opération n'est pas une remise
à zéro et n'est pas exécutée automatiquement : sauvegarde vérifiée, arrêt des écritures
et approbation explicite sont nécessaires avant toute application à une base locale.
Les tests reproduisent les deux contraintes historiques sur une base temporaire,
puis vérifient la réparation, la conservation et le rejeu idempotent.


## Réparation reproductible et validation finale

La réparation locale autorisée a été appliquée après sauvegarde durable hors dépôt.
À cette étape, les compteurs 0 ticket / 0 événement / 1 conversation / 4 messages
étaient identiques avant/après, ainsi que les empreintes des données de toutes les
tables ; `integrity_check` retournait `ok` et `foreign_key_check` aucune violation.
Aucun ticket de test n’a été créé localement par cette réparation. Les créations
manuelles NovaShop ultérieures sont distinctes de cette vérification.

Pour une autre base touchée par cette version intermédiaire, faire une sauvegarde
SQLite en ligne vérifiée (intégrant le WAL), arrêter les écritures et le backend,
puis exécuter depuis `server`, uniquement après approbation de maintenance :

```bash
TICKET_DB_PATH=/chemin/absolu/vers/la/base.db node --input-type=module <<'NODE'
import Database from 'better-sqlite3';
import { repairSupportTicketSchema } from './schema-repairs/support-tickets.js';
if (!process.env.TICKET_DB_PATH) throw new Error('Explicit database path required');
const db = new Database(process.env.TICKET_DB_PATH, { fileMustExist: true });
try {
  db.pragma('foreign_keys = ON');
  if (db.pragma('integrity_check', { simple: true }) !== 'ok' || db.pragma('foreign_key_check').length) {
    throw new Error('Pre-repair integrity verification failed');
  }
  console.log(repairSupportTicketSchema(db)); // compteurs uniquement
  if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Integrity verification failed');
} finally { db.close(); }
NODE
```

La transaction restaure intégralement l’état initial si une reconstruction ou
vérification échoue. Le test de régression couvre aussi le compteur d’événements
avec des trous et un schéma non pris en charge provoquant un rollback. Les schémas
personnalisés exigent une revue préalable ; cet outil cible uniquement les tables
Tickets de 006 et ne remplace pas un système général de migration. Ne pas effacer
`schema_migrations` pour forcer une réapplication. Après réparation : vérifier les
empreintes des données, les contraintes et les lectures API, puis redémarrer un seul BFF.

La revue finale ajoute un test dédié aux modifications de priorité et de provenance,
aux changements de statut seuls et aux mises à jour sans changement. L’application
reste locale, en clair et sans authentification multi-utilisateur ; CORS et loopback
ne remplacent pas l’authentification ou l’autorisation par utilisateur. Aucune
confidentialité multi-tenant, notification externe, escalade humaine, intégration n8n
ou outil de Phase 5E n’est livrée ici. 5D-2, 5D-3 et 5E restent hors périmètre.
