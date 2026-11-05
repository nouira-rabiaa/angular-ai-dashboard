<a id="phase-5d-2--escalade-humaine-locale"></a>

# Transfert à un opérateur

## Diagnostic et architecture

Base de travail : `c3b0a86041a9ab2e28b445ae41adf45728890f71`, branche
`feat/phase-5-support-agent`, working tree propre au départ. 5D-1 fournit déjà
les tickets, leurs versions, la classification déterministe et l'audit transactionnel.
5A/5B/5C, conversations, citations, RAG et FinOps sont conservés.

Le détail Tickets intègre un panneau d'escalade autonome, sans nouvel onglet ni route
Angular. Les identifiants de ticket et d'agent bornent toutes les API. Un opérateur
local doit explicitement demander et confirmer l'escalade puis chaque décision.
Aucune classification ou réponse IA ne crée une escalade automatiquement.
Le flag de configuration historique `escalationEnabled` n'est pas une permission
utilisateur : ce panneau est une action déclarative de l'opérateur local, distincte
de l'agent configuré. Il n'y a aucune authentification ou identité vérifiée.

## Migration additive 007

`007_support_escalations.sql` ajoute deux tables sans modifier les lignes ou enums de
006. `support_escalations` : UUID, ticket FK cascade, motif, précisions, état, opérateur
local nullable, dernière note, version entière positive et dates UTC de demande,
affectation, résolution ou annulation. Les précisions sont limitées à 2 000 caractères,
l'opérateur à 100 et les notes à 4 000. Motif `other` : précisions obligatoires dans l'API.

Un index unique partiel interdit plusieurs escalades actives (`requested`, `assigned`)
pour un ticket. Les états de ticket et d'escalade sont indépendants : une résolution
d'escalade ne résout pas automatiquement le ticket, ne change ni sa priorité ni sa
classification. Un ticket fermé peut être examiné, sans être rouvert implicitement.
Une nouvelle demande est possible après résolution/annulation, jusqu'à 100 par ticket.

`support_escalation_events` conserve les décisions `requested`, `assigned`, `noted`,
`resolved`, `cancelled` avec état avant/après, opérateur déclaré, note et date. Chaque
mutation et son événement sont dans une transaction immédiate. Les événements ont un
ID croissant et ne sont ni modifiables par API ni modifiables par UPDATE SQL (trigger).
Ils ne sont pas inviolables contre un administrateur SQLite ; la suppression physique
d'un agent/ticket entraîne une cascade, conformément au modèle local existant.
L'audit 5D-1 reste intact. Supprimer une conversation ne supprime pas ses tickets,
donc ne supprime pas leurs escalades.

### Transitions

| Action | Source autorisée | Destination | Conditions |
| --- | --- | --- | --- |
| Demander | Aucune escalade active | requested | Motif valide, confirmation |
| Affecter | requested | assigned | Opérateur non vide |
| Ajouter une note | requested ou assigned | Inchangée | Note non vide |
| Résoudre | assigned | resolved | Note de résolution non vide |
| Annuler | requested ou assigned | cancelled | Note d'annulation non vide |

Les états terminaux ne sont pas réouverts. Une nouvelle escalade constitue une
nouvelle demande. L'affectation ne sauvegarde que l'opérateur ; une note est sauvée
par l'action explicite correspondante, la résolution ou l'annulation. Les notes
successives sont toutes conservées dans l'audit, même si seule la dernière apparaît
sur le détail. Il n'y a ni réaffectation ni annuaire d'opérateurs en 5D-2.

## API

Préfixe : `/api/agents/:id/tickets/:ticketId/escalations`.

| Méthode | Suffixe | Contrat |
| --- | --- | --- |
| GET | Aucun | `{active,items,total,limit,offset}` ; 25 par défaut, 50 max |
| POST | Aucun | `{requestId,reason,details?}` ; 201, 200 si rejeu |
| PATCH | `/:escalationId` | `{requestId,version,action,operator? ou note?}` |
| GET | `/:escalationId/events` | Historique croissant, `{items,total,limit,offset}` |

Motifs : `refund_validation`, `complex_complaint`, `insufficient_information`,
`human_requested`, `other`. Actions PATCH : `assign`, `note`, `resolve`, `cancel`.
Le chemin vérifie l'appartenance ticket/agent avant toute lecture ou écriture.
Champs inconnus, types, enums, UUID v4, bornes, méthodes et références invalides sont
refusés. PATCH exige la version courante ; conflit ou transition interdite → 409.
Les erreurs 400/403/404/409/500 restent génériques, sans SQL, notes ou données clients
dans les logs ajoutés. Le garde loopback local existant est réutilisé. CORS autorise
PATCH uniquement sur une ressource d'escalade, sans nouveau DELETE ou PUT.

Chaque écriture porte une clé UUID d'idempotence. L'unicité ticket/clé et le hash du
payload normalisé s'appliquent à toutes les décisions : même clé/payload → réponse
initiale sans nouvel événement ; payload différent → 409. Le hash PATCH inclut
l'escalade et la version. Le replay est vérifié avant la version courante afin de
supporter une réponse perdue. Angular recharge la liste après succès pour afficher
l'état actuel, plutôt que de considérer une réponse rejouée comme l'état le plus récent.

## Interface, brouillons et sécurité

Toutes les actions demandent confirmation et sont bloquées pendant l'envoi. Un échec
conserve la confirmation, la saisie et la clé du même payload. Modifier les champs
crée une nouvelle intention : après une réponse incertaine, réessayer sans changement
ou vérifier l'historique avant toute nouvelle action. L'annulation des saisies
n'annule pas une écriture qui aurait déjà réussi. En cas de conflit, abandonner
explicitement les saisies, actualiser puis ouvrir à nouveau le détail actuel.

Les brouillons d'escalade remontent au garde du Studio : changement de ticket,
d'agent ou d'espace bloqué ; beforeunload prévient une sortie accidentelle. Le
changement FR/EN conserve les formulaires, notes et confirmations et ne lance aucune
inférence. Les données utilisateur restent dans leur langue originale et s'affichent
en texte, sans HTML interprété. Contrôles natifs, labels englobants, focus visible,
messages d'erreur/status et disposition responsive sans dépendance supplémentaire.

Stockage local en clair, identité déclarative, aucune isolation multi-utilisateur
ou livraison à un vrai conseiller. Les événements contiennent volontairement les
notes métier ; ne pas y saisir de secrets. Leur rétention suit celle des tickets.
L'historique est paginé, offset maximal 10 000 ; aucun export ou purge n'est ajouté.

## Migration locale et réparation historique

Pendant l’implémentation initiale, les tests utilisaient des bases isolées et le
backend avait été arrêté pour éviter une application involontaire de 007. Depuis,
la préparation locale a confirmé huit migrations, dont 007 et 008 déjà appliquées,
avec sauvegarde externe cohérente vérifiée et contrôles d’intégrité. La recette
Safari Human Handoff est validée manuellement par le propriétaire : demande,
affectation, note, résolution, historique durable, sélection corrigée et indépendance
du ticket. Voir l’[état de clôture local du Studio](PHASE5_SUPPORT_AGENT.md#cloture-locale-human-handoff-workflow).
Sur une autre base non préparée, sauvegarder et vérifier les données avant tout
démarrage appliquant des migrations manquantes ; ne pas réappliquer 007 localement.

La réparation 006 reste une maintenance exceptionnelle destinée au schéma
intermédiaire de 5D-1. Après 007, elle refuse la dépendance entrante des escalades,
même si elles sont vides. Ne jamais supprimer les tables ou les entrées de migration
pour contourner ce refus ; une adaptation nécessite une maintenance dédiée et une
sauvegarde. Aucun reset ni réapplication de migration historique n'est nécessaire.

## Scénario manuel Safari NovaShop

Après revue et préparation de la base locale :

1. Ouvrir le ticket fictif existant « Produit défectueux — Casque Bluetooth — NS-2026-1042 ».
2. Demander une escalade, motif validation du remboursement, compléter les précisions.
3. Vérifier puis confirmer une seule fois ; constater `requested`, puis ouvrir le détail.
4. Saisir un opérateur fictif, affecter et confirmer ; constater `assigned` et sa date.
5. Ajouter une note « Demande examinée, aucun remboursement exécuté », confirmer.
6. Saisir la note de résolution, résoudre et confirmer ; constater `resolved` et sa date.
7. Recharger, ouvrir le ticket puis l'escalade ; vérifier notes, dates et historique.
8. Vérifier le statut/priorité/catégorie du ticket inchangés par ces opérations.
9. Tester séparément l'annulation d'une demande fictive, après confirmation.
10. Vérifier FR/EN, brouillons, clavier et largeurs 375/768/1280/1440 px.

Aucun remboursement, e-mail, notification ou appel IA n'est effectué par ces actions.
Aucune exécution du scénario NovaShop dans la base locale n'est automatisée ici.

## Hors périmètre

5D-3/n8n, 5E/tool calling/approbations avancées, authentification multi-utilisateur,
remboursements et e-mails réels, Trace Explorer 5F et Evaluation Lab 5G. Aucun changement
RAG, FinOps ou Guided Demo. Aucun commit, push ou fusion avant revue manuelle.

## Résultats historiques — implémentation initiale du transfert

Les mesures ci-dessous précèdent les extensions et la correction de sélection.
Les résultats courants sont indiqués dans l’[état de clôture local du Studio](PHASE5_SUPPORT_AGENT.md#cloture-locale-human-handoff-workflow).

- Angular : **25 suites, 193 tests réussis**, commande `npm test --prefix client -- --runInBand`.
- Backend : **138 tests réussis**, commande `npm test --prefix server` ; uniquement
  bases isolées et HTTP loopback, aucun appel Groq réel.
- `npm run build --prefix client -- --stats-json` : production réussie.
- Catalogues : **933 clés FR et EN**, interpolations et 895 références vérifiées par
  `npm run check:i18n --prefix client` (également exécuté par prebuild).
- Initial : **439 835 octets bruts**, inchangé par rapport à 5D-1. Chunk lazy du
  Studio : **121 757 octets** contre 102 979 auparavant, soit +18 778 octets.
- Styles escalade : **1 752 octets** après Sass/minification esbuild ; maximum des
  composants **3 971 octets** selon la même mesure. Le build Angular respecte les
  budgets inchangés : initial 500 kB / 1 MB, composants 4 / 8 kB, sans avertissement Angular.
- Les cinq routes `loadComponent` sont préservées ; aucune dépendance ou budget modifié.
- `git diff --check` : réussi lors de cette étape initiale. À cette date de
  développement, 007 était absente et le backend arrêté ; cette situation historique
  est remplacée par la préparation locale et la clôture décrites plus haut.
- Safari n'a pas été automatisé pour cette livraison ; aucune capture ou validation
  responsive réelle n'est revendiquée. Aucun Playwright/Puppeteer installé ; aucune
  dépendance de navigateur n'a été ajoutée. La recette fonctionnelle Safari a depuis
  été validée par le propriétaire ; la couverture responsive exhaustive reste non confirmée.
- Les tests backend existants de JSON malformé peuvent écrire une trace body-parser
  de diagnostic dans le journal des tests ; aucun contenu client réel n'est utilisé.
  Aucun nouveau log de données métier n'est ajouté par les endpoints d'escalade.

## Fichiers de la livraison initiale — historique

27 fichiers modifiés ou créés, non stagés et non committés :

```text
README.md
client/src/app/components/agent-workspace/agent-escalations.component.html
client/src/app/components/agent-workspace/agent-escalations.component.scss
client/src/app/components/agent-workspace/agent-escalations.component.spec.ts
client/src/app/components/agent-workspace/agent-escalations.component.ts
client/src/app/components/agent-workspace/agent-tickets.component.html
client/src/app/components/agent-workspace/agent-tickets.component.spec.ts
client/src/app/components/agent-workspace/agent-tickets.component.ts
client/src/app/components/agent-workspace/ticket-studio.integration.spec.ts
client/src/app/i18n/catalogs/en.json
client/src/app/i18n/catalogs/fr.json
client/src/app/models/support-escalation.model.ts
client/src/app/services/support-ticket.service.spec.ts
client/src/app/services/support-ticket.service.ts
docs/ARCHITECTURE.md
docs/I18N.md
docs/PHASE5D_ESCALATIONS.md
docs/PHASE5_SUPPORT_AGENT.md
docs/TECHNIQUES.md
server/cors-policy.js
server/index.js
server/inference-history.test.js
server/migrations/007_support_escalations.sql
server/support-escalations.js
server/support-escalations.test.js
server/support-knowledge.test.js
server/support-tickets.test.js
```
