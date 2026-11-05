# Workflow Automation — API et interface de gestion locale

## Architecture et frontière

Le sixième espace du Support Agent Studio, **Automatisation des workflows / Workflow
Automation**, réutilise `createWorkflowLocalEngine` sans deuxième moteur. Il reste
sur `/agent-workspace`, dans la route lazy existante. Le composant visité reste monté
pendant la navigation, comme Conversations et Tickets. Aucune simulation, préparation,
récupération ou reprise ne se produit sur un GET, une navigation ou une bascule FR/EN.

`WorkflowManagementService` appelle uniquement le BFF local. Le contexte HTTP existant
préserve les erreurs structurées à travers l’intercepteur. Tous les endpoints sont
sous `/api/agents/:id/workflow-automation`, derrière le garde local et le CORS existants.
Ils ne gèrent ni URL de workflow, ni secret, ni callback externe. Aucun worker/timer
n’est lancé lors de l’enregistrement des routes dans `server/index.js`.

Le moteur reçoit trois commandes supplémentaires : `prepareAgent`, `simulateRun` et
`recoverRun`, avec confirmation, version attendue et clé de commande persistante.
Elles exécutent les primitives de matérialisation, claim, finalisation et récupération
existantes, dans une transaction SQLite. La sélection de préparation est limitée à
l’agent et la simulation à **un run précis** ; le moteur global simulateOnce n’est
pas exposé par HTTP. Les leases/fences restent contrôlés par le moteur.

Aucun schéma nouveau n’est nécessaire. Les migrations 001–008 restent inchangées,
et 007/008 sont désormais enregistrées sur la base locale préparée. Leur application
a eu lieu séparément de l’implémentation, sans réinitialisation.

## Configuration et portée

La liaison locale est unique par agent, pour `handoff.requested`, cible fixe
`local_simulator`. Sa création est confirmée et toujours désactivée. Son état est
modifié avec sa révision attendue. Il n’y a pas de nom, destination ou credential
libre à éditer : la configuration autorisée est volontairement limitée à l’activation.

Le commutateur du simulateur et sa capacité sont **partagés par toute l’application**.
L’écran l’annonce avant confirmation. La capacité va de 1 à 10 000 runs non terminaux.
Modifier ce réglage via un agent ne prétend pas donner une permission propre à cet
agent : l’application est locale, mono-opérateur déclaratif et non authentifiée.
Désactiver le simulateur partagé met en pause les travaux de tous les agents.
Les APIs de lecture et d’exécution par run restent strictement scopées à leur agent.

Activer liaison et simulateur ne matérialise ni n’exécute rien. Les nouveaux transferts
confirmés capturent des reçus ; le bouton **Préparer les exécutions** crée les runs
éligibles dans la capacité. À saturation, les reçus restent différés, sans refuser
les transferts. Un reçu capturé pendant l’arrêt du simulateur reste en pause : sa
reprise explicite est nécessaire avant préparation. Réactivation seule : aucun replay.

## Endpoints et contrats JSON

Tous les POST exigent JSON, zéro query param, champs autorisés uniquement et
`requestId` UUID v4 / `confirm: true`. Les commandes sur un objet existant exigent
`expectedVersion` (révision de liaison, version des settings, du reçu ou du run selon
la route). Les chemins restent stables au changement de langue.

| Méthode / suffixe | Contrat |
| --- | --- |
| GET (aucun suffixe) | Vue d’ensemble : `{binding,settings,receipts,runs,lastActivity}` |
| POST `/bindings` | `{requestId,confirm}` → liaison désactivée, ou réponse initiale au replay |
| POST `/bindings/:bindingId/state` | `{requestId,confirm,expectedVersion,enabled}` → liaison |
| POST `/dispatcher` | `{requestId,confirm,expectedVersion,enabled,capacity?}` → réglage partagé |
| POST `/prepare` | `{requestId,confirm,expectedVersion}` → `{created,deferred}` dans le lot examiné, jusqu’à 100 reçus |
| GET `/receipts` | `limit,offset,state?` → `{items,total,limit,offset}` |
| POST `/receipts/:receiptId/resume` | `{requestId,confirm,expectedVersion}` → reçu repris |
| GET `/receipts/:receiptId/history` | `limit,offset` → audit paginé |
| GET `/runs` | `limit,offset,state?,ticketId?,search?` → runs enrichis paginés |
| GET `/runs/:runId` | Détail scoped enrichi |
| GET `/runs/:runId/history` | `limit,offset` → audit paginé |
| POST `/runs/:runId/simulate` | `{requestId,confirm,expectedVersion}` → résultat de simulation ciblée |
| POST `/runs/:runId/resume` | Même commande → reprise si transition/budget/capacité autorisés |
| POST `/runs/:runId/recover` | Même commande → running avec lease expirée devient unknown ; n’exécute rien |

Exemple de commande (identifiant illustratif, jamais une clé d’authentification) :

```json
{
  "requestId": "00000000-0000-4000-8000-000000000001",
  "confirm": true,
  "expectedVersion": 1
}
```

Réponse de vue d’ensemble : `binding` nullable ; `settings` contient enabled, capacity
et version ; `receipts` et `runs` sont des compteurs réels par état, tous filtres
confondus ; `lastActivity` est nullable, en millisecondes Unix. Ne pas le présenter
comme un état de disponibilité globale ni inventer une date lorsque NULL.

Le run conserve ses propriétés moteur et reçoit `event`, `ticketId`, `handoffId`,
`sourceEventId`, `bindingRevision`, `lastError` nullable et `result` nullable. Le seul
résultat positif est `simulated_success`, aucune action métier. `lastError` est le
dernier code d’incident audité, éventuellement antérieur à un succès ultérieur, pas
un corps d’erreur fournisseur ou une preuve que le run est encore en échec.

L’audit exposé contient ID, type, états avant/après, version, fence et date. Il n’expose
pas les hashes/commandes/réponses d’idempotence ou des erreurs SQLite. Aucun endpoint
ne modifie ou ne supprime l’audit. Le reçu expose sa projection minimale existante,
sans texte client ou note d’opérateur.

Pagination : 25 par défaut, maximum 50, offset 0–100 000. Ordre de listes : date puis
ID, décroissant par date ; audit par ID croissant. Recherche littérale bornée à 100
caractères dans les identifiants run/ticket/transfert uniquement. Pas de recherche
sur des descriptions clients. Un ticketId filtre est vérifié dans l’agent. Les
appartenances agent/liaison/reçu/run sont vérifiées avant tout accès ou commande.

Erreurs génériques `{code,error}` : 400 paramètres/confirmation invalides ; 403 garde
local ; 404 ressource absente ou d’un autre agent ; 409 version, idempotence,
transition, désactivation, budget, capacité ou run non prêt ; 500 stockage générique.
Aucun SQL, stack, secret ou texte privé n’est ajouté à la réponse par ces handlers.

## États, confirmations et brouillons

Écran : vue d’ensemble, configuration, compteurs par état, reçus et historique,
listes de runs avec recherche/filtre/page, détail et audit. Les états paused/unknown/
failed ne montrent la reprise que si des tentatives restent disponibles ; le moteur
valide ensuite la transition et la capacité. La récupération d’une lease encore
valide est refusée. Une simulation n’est possible que pour queued/retry_wait dû.

Les lectures ont un timeout de 15 secondes, les réponses périmées sont ignorées et
les subscriptions sont annulées à la destruction. Les erreurs sont traduites par
statut, sans afficher les messages internes. L’absence d’activité/résultat est un
état indisponible explicite, pas zéro ou un succès fictif.

Toute mutation demande une confirmation séparée, avec l’état d’activation visé et
la capacité lorsqu’elle est concernée. Les doubles clics sont bloqués pendant le POST.
Une réponse incertaine garde la confirmation, le payload et sa clé ; Réessayer
renvoie la même commande. Après conflit, annuler explicitement, actualiser, rouvrir
le détail et vérifier l’état courant avant une nouvelle intention. Un replay renvoie
la réponse initiale ; l’écran relit ensuite l’état actuel.

La saisie de capacité et les confirmations bloquent le changement d’espace/agent
via le garde de brouillon existant. Annuler ne défait pas une écriture déjà commitée.
La bascule FR/EN conserve les filtres, formulaires, DOM et clé en cours ; les contrôles
ne déclenchent aucune requête de mutation à cette occasion. Les textes métier et
identifiants restent inchangés. Labels natifs, focus visible, régions alert/status,
cartes compactes et grilles responsive par container query.

## État SQLite local et procédure Safari de référence

**État de clôture : les huit migrations, dont 007 et 008, sont déjà enregistrées
sur la base locale.** La sauvegarde SQLite externe a été vérifiée, l’intégrité est
correcte et aucune violation de clé étrangère n’a été constatée à la préparation.
Ne pas réappliquer les migrations ni recréer les données NovaShop. Pour une autre
base, conserver la préparation séparée avec sauvegarde et comparaison des données.

Pour une validation sans données réelles : utiliser les tests de ce dépôt, qui
créent leurs bases temporaires ; ne pas déplacer ou réinitialiser la base NovaShop.

Le propriétaire a validé le parcours fonctionnel ci-dessous dans Safari. La liaison
(révision 3) et le simulateur partagé ont été désactivés à la fin ; un reçu materialized
et un run succeeded à une tentative persistent. Le ticket est resté Ouvert et le
transfert Demandé. Ce parcours reste une référence, pas une instruction de le rejouer
ou de réactiver la configuration après clôture. Voir l’[état de clôture local du Studio](PHASE5_SUPPORT_AGENT.md#cloture-locale-human-handoff-workflow).

Pour une recette ultérieure explicitement autorisée, après préparation de la base :

1. Ouvrir Support Agent Studio, sélectionner Support Client Demo et Workflow Automation.
2. Vérifier le mode Simulation locale, liaison absente/désactivée et aucun run ajouté
   par l’ouverture. Créer une liaison désactivée avec confirmation, si elle n’existe pas.
3. Activer la liaison avec confirmation, puis autoriser explicitement le simulateur
   **partagé**. Ne pas supposer que ces deux opérations exécutent un workflow.
4. Ouvrir le ticket NovaShop fictif existant et confirmer une nouvelle demande de
   transfert humain, si aucune n’est active. Ne pas recréer un transfert déjà existant
   pour contourner un conflit. Les anciens événements ne sont pas rattrapés.
5. Revenir à Workflow Automation : constater le reçu durable. Si paused, le reprendre
   explicitement. Préparer les exécutions et vérifier run queued ou reçu deferred
   si capacité atteinte ; les demandes de transfert ne sont pas perdues à saturation.
6. Ouvrir le run, vérifier ticket/transfert/source/version puis Simuler et Confirmer.
   Vérifier Succès simulé, tentatives et audit. Ticket et transfert ne changent pas.
7. Recharger et vérifier la persistance. Tester séparément les filtres, pagination,
   erreurs/conflicts et la reprise d’éléments paused sur données fictives.
8. Désactiver la liaison, vérifier l’absence de nouvelle éligibilité, puis si souhaité
   arrêter le simulateur partagé. Une réactivation ne reprend pas les paused.
9. Vérifier FR/EN, confirmation conservée, navigation clavier et largeurs 375, 768,
   1280 et 1440 px. Ne pas déclarer ces contrôles visuels réussis avant observation.

## Limites et suite réseau

Aucun n8n, webhook, callback externe, secret, e-mail, remboursement, timer, service
d’authentification, Agent Tools & Approvals ou Execution Tracing global. Une seule
liaison/événement/cible locale par agent. La configuration partagée n’est pas une
permission multi-utilisateur. Ni purge, ni export, ni traitement automatique de file.
Les runs de simulation n’ajoutent aucun coût IA aux métriques FinOps.

Les prochaines étapes n8n restent celles de la conception : contrats de transport,
authentification, protection contre le rejeu, secrets, callbacks corrélés, incertitudes
et revue des effets distants. Cette API locale n’autorise pas ces étapes implicitement.

## Résultats de validation exécutée

- Angular complet, dernier audit de clôture : **29 suites, 215 tests réussis**,
  incluant les régressions de sélection et d’historique Human Handoff.
- Backend complet : **161 tests réussis**, bases temporaires/en mémoire. Les tests
  d’API utilisent un serveur loopback éphémère ; le simulateur n’effectue aucun HTTP sortant.
- Build production : réussi, sans avertissement Angular. Initial **441 107 octets**,
  soit +1 272 octets par rapport aux 439 835 précédents.
- Nouveau CSS minifié : **1 937 octets** ; maximum des composants **3 971 octets**,
  mesurés séparément par Sass + esbuild. Le build confirme les budgets Angular
  inchangés : initial warning 500 kB/error 1 MB ; styles composants warning 4/error 8 kB.
- FR/EN : **1 030 clés**, interpolations et 961 références vérifiées par prebuild.
- Cinq routes lazy, aucune nouvelle dépendance et `git diff --check` réussi.
- Recette fonctionnelle Safari validée manuellement par le propriétaire. La
  vérification exhaustive des largeurs responsive n’est pas confirmée. Les réserves
  de non-démarrage pendant l’implémentation ne décrivent plus l’état local préparé.
- Build de production réussi ne signifie pas validation de production : application
  locale sans authentification multi-utilisateur, sans transport n8n.
- Le test backend de JSON invalide produit une trace body-parser attendue, sans échec.
- Aucun commit, staging ou push ; main et les migrations existantes inchangés.

## Fichiers de l’extension initiale — historique

24 fichiers créés ou modifiés pour cette tâche ; les autres changements du working tree sont préexistants.

```text
README.md
client/src/app/components/agent-workspace/agent-configuration.component.html
client/src/app/components/agent-workspace/agent-configuration.component.ts
client/src/app/components/agent-workspace/agent-workflows.component.html
client/src/app/components/agent-workspace/agent-workflows.component.scss
client/src/app/components/agent-workspace/agent-workflows.component.spec.ts
client/src/app/components/agent-workspace/agent-workflows.component.ts
client/src/app/components/agent-workspace/agent-workspace.component.spec.ts
client/src/app/components/agent-workspace/workflow-studio.integration.spec.ts
client/src/app/i18n/catalogs/en.json
client/src/app/i18n/catalogs/fr.json
client/src/app/i18n/ui-shell.spec.ts
client/src/app/models/workflow-management.model.ts
client/src/app/services/workflow-management.service.spec.ts
client/src/app/services/workflow-management.service.ts
docs/I18N.md
docs/WORKFLOW_AUTOMATION_DESIGN.md
docs/WORKFLOW_AUTOMATION_UI.md
docs/WORKFLOW_LOCAL_ENGINE.md
server/index.js
server/workflow-local-engine.js
server/workflow-local-engine.test.js
server/workflow-management.js
server/workflow-management.test.js
```
