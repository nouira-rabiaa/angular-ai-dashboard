# Noms produit et terminologie

## Convention métier

| Domaine | Anglais | Français |
| --- | --- | --- |
| Agents | Agent Configuration | Configuration des agents |
| Knowledge | Agent Knowledge Base | Base documentaire des agents |
| Conversations | Conversation Management | Gestion des conversations |
| Tickets | Ticket Management | Gestion des tickets |
| Escalation | Human Handoff | Transfert à un opérateur |
| Automation | Workflow Automation | Automatisation des workflows |
| Tools | Agent Tools & Approvals | Outils et approbations |
| Tracing | Execution Tracing | Traçabilité des exécutions |
| Evaluation | Agent Evaluation | Évaluation des agents |

Les titres courts Configuration, Base documentaire, Conversations et Tickets restent
adaptés aux onglets. Les titres complets s'utilisent lorsqu'ils clarifient le contexte.
Cette nomenclature ne signifie pas que toutes ces capacités sont implémentées :
automatisation des workflows, outils et approbations avancés et évaluation restent
hors du périmètre de ce nettoyage. Le transfert est déclaratif et local, sans envoi
à un conseiller externe ni identité authentifiée.

## Audit avant modification

- Quatre textes affichables par langue contenaient des phases : bandeau du Studio,
  aide d'une option de configuration, prévisualisation documentaire et description
  du moteur interne dans Architecture Explorer. Guided Demo n'en affichait pas.
- Trois noms de clés Transloco comprennent un ancien identifiant de planification.
  Ils restent stables pour éviter un renommage de références ; leurs valeurs affichées
  n'en contiennent plus. Aucun nouvel identifiant technique n'utilise cette convention.
- Les routes Angular/API, services, modèles et migrations utilisent déjà des noms
  fonctionnels : aucun renommage nécessaire. Les numéros de migrations sont des
  versions de schéma, pas des noms de fonctionnalités à traduire.
- Les intitulés de tests, notes de livraison, commits et branche Git peuvent décrire
  l'historique du développement. Ces références ne sont pas des libellés produit.

## Changements et compatibilité

Les catalogues FR/EN retirent les quatre mentions et emploient Human Handoff /
Transfert à un opérateur pour la terminologie du panneau existant. Aucun traitement
métier, contrat HTTP, statut persistant ou contenu utilisateur n'est traduit/modifié.
Les clés de compatibilité sont notamment :

- `configuration.enterprise_ai_dashboard_phases_5a_5b_5c`
- `knowledge.previsualisation_documentaire_5b`
- `architecture.module_backend_local_conserve_pour_5e_sans`

Les documents techniques actifs utilisent des titres fonctionnels. Les fichiers
historiques `PHASE5_SUPPORT_AGENT.md`, `PHASE5D_TICKETS.md` et
`PHASE5D_ESCALATIONS.md` gardent leur chemin pour préserver les liens entrants.
Les anciennes ancres de sections sont conservées explicitement. La roadmap, les
résultats de livraisons et les audits datés gardent leurs références de suivi interne.
Ne pas renommer migrations appliquées, endpoints ou symboles pour du branding.
Pour tout nouveau code, privilégier des noms tels que `ticket-management`,
`human-handoff`, `workflow-automation`, `execution-tracing`, `agent-evaluation`.

## Périmètre de cette intervention

Des travaux de transfert humain non committés étaient déjà présents au début de
cette tâche. Ils sont conservés, sans poursuite de leur implémentation. Seuls leurs
libellés, les assertions correspondantes et la documentation sont harmonisés ici.
Le backend local n'est pas démarré, aucune migration locale n'est appliquée, aucun
commit ni push n'est créé par ce nettoyage.

Un test de terminologie parcourt toutes les valeurs FR/EN et interdit les identifiants
de phase dans les textes affichables. Les clés internes et les contenus métier ne
sont pas soumis à cette règle de traduction.

## Validation historique du nettoyage de terminologie

Les résultats ci-dessous concernent cette intervention initiale. Le dernier audit
de clôture confirme 215 tests Angular / 29 suites, 161 tests backend et 1 030 clés
FR/EN ; recette fonctionnelle Safari déclarée par le propriétaire, sans couverture
responsive exhaustive ni validation de production. Voir l’[état de clôture local du Studio](PHASE5_SUPPORT_AGENT.md#cloture-locale-human-handoff-workflow).

- Tests Angular complets : **26 suites, 196 tests réussis**.
- Tests backend complets : **138 tests réussis**, bases isolées.
- Build Angular production : réussi, sans avertissement Angular.
- FR/EN : **933 clés par langue**, interpolations et 895 références vérifiées ;
  zéro identifiant de phase dans les valeurs affichables des deux catalogues.
- **24 liens documentaires locaux** vérifiés, y compris les anciennes ancres référencées.
- `git diff --check` : réussi. Aucun renommage de migration, structure SQLite,
  endpoint, service ou modèle ; aucune nouvelle dépendance.
- Aucun contrôle visuel n’avait été réalisé lors du nettoyage initial. La recette
  fonctionnelle ultérieure a validé le panneau de transfert et sa sélection ;
  les nouveaux libellés ne constituent pas une preuve de responsive à toutes les largeurs.

Fichiers touchés spécifiquement par ce nettoyage (les autres modifications du
working tree appartiennent aux travaux de transfert humain préexistants) :

```text
README.md
client/src/app/i18n/catalogs/fr.json
client/src/app/i18n/catalogs/en.json
client/src/app/i18n/product-terminology.spec.ts
client/src/app/components/agent-workspace/agent-escalations.component.spec.ts
docs/ARCHITECTURE.md
docs/TECHNIQUES.md
docs/FINOPS.md
docs/OBSERVABILITY.md
docs/I18N.md
docs/PHASE5_SUPPORT_AGENT.md
docs/PHASE5D_TICKETS.md
docs/PHASE5D_ESCALATIONS.md
docs/PRODUCT_TERMINOLOGY.md
```
