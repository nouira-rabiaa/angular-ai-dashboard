# Workflow Automation — moteur local

L’extension [API et interface de gestion](WORKFLOW_AUTOMATION_UI.md) expose désormais
les commandes locales confirmées. Ce document décrit les primitives du moteur ;
aucun transport sortant ni scheduler n’est ajouté par cette extension.

## Périmètre livré

Fondation serveur sans HTTP sortant, webhook, callback réseau, timer, interface
Angular nouvelle ou commande de démarrage automatique. Le transport n8n n’est pas
implémenté. L’ensemble reste local et sans authentification multi-utilisateur.
Les UUID de workers sont des identifiants de corrélation, pas des identités vérifiées.

Les décisions et transitions sont fixées dans la
[conception, section 14](WORKFLOW_AUTOMATION_DESIGN.md#14-décisions-finales--local-engine-foundation).
Une demande de transfert humain n’est jamais refusée à cause de la capacité logique
ou d’une désactivation. La saturation produit un report durable ; une impossibilité
physique de commit SQLite reste une erreur de stockage, avec rollback complet.

## Schéma

`008_workflow_local_engine.sql` est une migration additive. Les fichiers 001–007
restent inchangés. Aucun changement n’est appliqué à la base réelle dans cette tâche.

| Table | Responsabilité |
| --- | --- |
| workflow_settings | Dispatcher désactivé par défaut, capacité globale, version |
| workflow_bindings | Agent, seul événement `handoff.requested`, cible fixe `local_simulator`, enabled=false, révision |
| workflow_receipts | Capture durable et unique liaison/événement, révision figée, payload minimal, état/version |
| workflow_runs | Un run par reçu, état/version, fencing token, worker/lease, budget de trois claims, échéance |
| workflow_audit | Captures, saturation, transitions, commandes et résultats idempotents, horodatages ; UPDATE/DELETE interdits |

Le trigger après insertion d’un événement `requested` du transfert capture le reçu
pour chaque liaison activée appartenant à l’agent du ticket, dans la même transaction
que l’escalade et son audit. Aucun appel du module dans le handler Human Handoff
n’est nécessaire ; ses contrats HTTP restent inchangés. Si le dispatcher est arrêté,
le reçu est capturé paused ; il ne sera jamais repris par la seule réactivation.

Le payload ne contient que schemaVersion, type, sourceEventId, IDs d’agent/ticket/
transfert, version du transfert et enum du motif. Ni note, titre, description,
opérateur, conversation, document, en-tête, credential ou URL. Les identifiants
snapshots restent conservés après suppression métier ; ils ne sont pas anonymes.

Les triggers de suppression des tickets annulent les runs non réussis et les reçus
sans run encore en attente, révoquent le fence et conservent l’audit. Supprimer un
agent désactive ses liaisons, met leur lien agent à NULL et suit les cascades Tickets
existantes. Les runs réussis restent inchangés. Supprimer une conversation conserve
le ticket, donc ses reçus/runs. Aucune purge automatique ; une rétention future
exige un cadrage, notamment pour préserver les clés de déduplication.

## API de module, sans nouvel endpoint

`createWorkflowLocalEngine(db, { now })` exige foreign_keys=ON. L’horloge injectable
est en millisecondes entières ; par défaut Date.now. Chaque mutation est une
transaction immédiate, sans I/O réseau. L’adaptateur de gestion instancie le moteur lors de l’enregistrement des routes dans `server/index.js`, sans lancer de worker.

| Fonction | Usage |
| --- | --- |
| createBinding({agentId,requestId,confirm}) | Liaison unique désactivée par agent |
| setBinding({agentId,bindingId,expectedVersion,enabled,requestId,confirm}) | Révision optimiste, activation/désactivation explicite |
| setDispatcher({expectedVersion,enabled,capacity?,requestId,confirm}) | Commutateur et capacité persistés ; arrêt met en pause |
| materialize() | Jusqu’à 100 reçus deferred transformés en runs dans la capacité ; reports audités |
| claim(workerUUID) | Claim explicite d’un run queued/retry_wait dû ; lease 30 s, tentative et fence incrémentés |
| finish({runId,worker,fence,outcome}) | success, transient_failure, permanent_failure ou lost_response ; pas de texte libre |
| recover() | Leases running expirées → unknown et révocation du fence ; aucune reprise automatique |
| resumeReceipt({agentId,receiptId,expectedVersion,requestId,confirm}) | paused → deferred, uniquement si activations effectives |
| resumeRun({agentId,runId,expectedVersion,requestId,confirm}) | paused/unknown/failed → queued, budget conservé ; capacité contrôlée pour failed |
| simulateOnce(workerUUID) | Matérialise, claim puis succès déterministe, sans réseau |
| getSettings(), getBinding(agentId,id), getReceipt(agentId,id), getRun(agentId,id) | Lectures de l’état courant |
| listReceipts(agentId,page), listRuns(agentId,page), history(agentId,runId,page), receiptHistory(agentId,receiptId,page) | Lectures paginées et audit sûr |

`confirm` doit être strictement true ; requestId est un UUID v4. La confirmation
reste déclarative, pas une approbation authentifiée. Pagination : 25 par défaut,
100 maximum, offset 0–100 000. Les méthodes scopées vérifient l’existence de l’agent
et l’appartenance avant de retourner des données. Les méthodes worker/settings sont
internes et ne doivent pas être exposées telles quelles comme API non authentifiée.

Révision de liaison, version de reçu/run et fencing sont séparés. Les commandes
manuelles gardent scope, clé, hash et réponse initiale dans l’audit : même intention
→ même réponse ; même clé/payload différent → idempotency_conflict. Relire l’objet
pour l’état courant après un replay. Les résultats du worker suivent la même règle
par run/fence/propriétaire, avec refus d’un fence périmé ou d’une lease expirée.
Un résultat contradictoire est refusé, pas ajouté comme seconde finalisation.

Les retries transitoires attendent 5 puis 30 secondes ; aucune attente n’est exécutée
par le module : un prochain claim après échéance est nécessaire. Trois claims au
maximum, y compris après reprise manuelle. lost_response ou crash ambigu donnent
unknown, jamais un succès présumé. Réactivation seule : aucun paused repris.

La capacité borne les runs queued/running/retry_wait/paused/unknown ; les reçus
restent non bornés pour préserver les événements éligibles. L’alerte de saturation
est consultable par receiptHistory (`capacity_deferred`), sans multiplier cet événement
à chaque matérialisation. Le stockage physique doit être surveillé ; aucun écran de
supervision ou système d’alertes externe n’est livré dans cette fondation.

## Validation manuelle ultérieure

1. La base locale de recette a désormais les huit migrations, dont 007 et 008.
   Ne pas les réappliquer. Sur une autre base, revoir les migrations manquantes et
   préparer une sauvegarde vérifiée avant un démarrage qui les appliquerait.
2. Exécuter `node --test server/workflow-local-engine.test.js` : uniquement des bases
   créées automatiquement sous le répertoire temporaire système, aucune donnée locale.
3. Pour une inspection manuelle, préparer une base de test isolée avec migrations,
   agent et ticket fictifs. Ne pas pointer les fonctions vers `server/submissions.db`.
4. Créer une liaison désactivée, vérifier qu’un transfert confirmé ne crée pas de reçu.
5. Activer explicitement liaison et dispatcher, capacité 1 ; créer deux transferts
   fictifs successifs en respectant la limite d’un transfert actif par ticket.
6. Appeler materialize : un run queued et un reçu deferred ; les deux demandes métier
   sont conservées. Examiner receiptHistory pour la saturation.
7. Appeler simulateOnce : succès local sans remboursement, notification ou n8n.
   Matérialiser ensuite le reçu reporté.
8. Réserver un run avec claim, avancer l’horloge de test de 30 s, appeler recover :
   unknown. Vérifier le refus de l’ancien worker, puis la reprise confirmée/versionnée.
9. Désactiver/réactiver : vérifier qu’aucun paused ne repart sans reprise distincte.
10. Vérifier audit, clés d’idempotence, fermeture/réouverture de la base de test.

Les primitives du moteur n’ajoutent pas d’interface à elles seules ; l’extension
API/UI et Human Handoff ont depuis été validés fonctionnellement dans Safari par
le propriétaire. La couverture exhaustive du responsive reste non confirmée.
Aucune commande ci-dessus n’installe ou ne démarre n8n. L’application locale de
007/008 est déjà confirmée ; toute migration future nécessite une préparation
et une sauvegarde séparées. La recette Safari du moteur via son API/UI est validée
manuellement par le propriétaire ; voir l’[état de clôture local du Studio](PHASE5_SUPPORT_AGENT.md#cloture-locale-human-handoff-workflow).

## Validation historique — fondations avant API et recette Safari

Les nombres ci-dessous décrivent la livraison initiale du moteur. Dernier audit
de clôture : 215 tests Angular / 29 suites, 161 tests backend, 1 030 clés FR/EN,
build production réussi ; ils ne prouvent pas une aptitude à la production.
Les scénarios manuels et limites sont distingués dans l’[état de clôture local du Studio](PHASE5_SUPPORT_AGENT.md#cloture-locale-human-handoff-workflow).

- Moteur local : **15 tests réussis**, sans serveur ni réseau.
- Backend complet : **155 tests réussis**, dont deux tests d’intégration Human Handoff
  validant la capture unique en cas de retry, la saturation, la pause et le rollback
  lorsqu’un stockage durable échoue. Les serveurs des autres suites sont loopback,
  les bases temporaires ; aucun appel n8n ou Groq réel.
- Angular : **196 tests, 26 suites réussis**.
- Build production : réussi, aucun avertissement Angular ; initial **439 835 octets**.
- FR/EN : **933 clés**, interpolations et 895 références vérifiées par prebuild.
- `git diff --check` : réussi. Migrations 001–007 identiques à leurs empreintes
  relevées avant cette tâche. Aucun changement de dépendance ou budget.
- Lors de cette étape initiale uniquement : 007/008 absentes et backend non démarré.
  Depuis la préparation et la recette autorisées, 007/008 sont enregistrées ;
  liaison et simulateur partagé sont désactivés en fin de recette. Aucun n8n réel.

Fichiers de cette intervention :

```text
docs/WORKFLOW_AUTOMATION_DESIGN.md
docs/WORKFLOW_LOCAL_ENGINE.md
server/migrations/008_workflow_local_engine.sql
server/workflow-local-engine.js
server/workflow-local-engine.test.js
server/inference-history.test.js
server/support-knowledge.test.js
server/support-tickets.test.js
server/support-escalations.test.js
```

Les modifications aux tests existants adaptent le nombre de migrations et conservent
de véritables fixtures historiques à six migrations pour la réparation 006 ; aucun
test existant n’est supprimé ou désactivé. Les nouveaux tests de migration comparent
les lignes des tables préexistantes avant/après, puis vérifient les clés étrangères.
Aucun commit, staging ou push. Les travaux Human Handoff et terminologie préexistants
restent dans le working tree ; la branche et main restent sur leurs commits initiaux.
