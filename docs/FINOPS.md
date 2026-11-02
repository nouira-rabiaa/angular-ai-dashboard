# FinOps Phase 4 — suivi, prévision et simulation

## Audit et périmètre

Référence de départ : `main` au commit `f969fad`. Réutilisés : `observability.js` (usage fournisseur et calcul des coûts), `inference_history` / `inference_steps`, migrations numérotées, agrégats et séries `/api/dashboard`, historique Angular par requête. Les projections, scénarios, budget persistant et alertes étaient absents. Aucun nouveau service externe, tarif par défaut ou moteur RAG n’est ajouté.

Les montants sont des **estimations USD**. « Observé » désigne le coût estimé à l’instant de la trace, pas un relevé de facturation. Les tokens d’inférence restent ceux fournis par Groq; tiktoken ne les remplace pas. Les calculs de simulation acceptent des moyennes fractionnaires, distinctes des usages entiers du fournisseur. Les valeurs négatives, absentes, non finies ou hors limites sont rejetées ou restent indisponibles.

## Configuration

Le serveur lit `GROQ_MODEL_PRICING` au démarrage : un objet JSON par identifiant exact du modèle, avec deux nombres strictement positifs et finis : `inputUsdPerMillion` et `outputUsdPerMillion`. Exemple de **structure à compléter**, et non tarifs fournis :

```text
{"<identifiant-modele>":{"inputUsdPerMillion":<tarif-verifie>,"outputUsdPerMillion":<tarif-verifie>}}
```

La formule commune est `(tokensEntrée × tarifEntrée + tokensSortie × tarifSortie) / 1 000 000`. Sans usage fournisseur complet, `/api/chat` conserve un coût null. Une configuration manquante/invalide ne déclenche pas de prix de remplacement; les modèles non tarifés ne sont pas proposés dans le simulateur. Un dépassement de capacité numérique produit également une valeur indisponible.

Les tarifs publics configurés, jamais la clé API, sont envoyés au navigateur. Les coûts historiques stockés ne sont pas recalculés rétroactivement quand les tarifs changent.

## Prévision

Toutes les dates sont UTC et l’horloge vient du serveur, non d’un paramètre client.

1. Lire les traces des **30 derniers jours terminés**, en excluant le jour courant incomplet.
2. Commencer au premier jour avec une trace dans cette fenêtre. Le nombre `N` de jours calendaires inclut les jours suivants sans activité enregistrée. Ces jours valent zéro sous l’hypothèse d’un historique continu; un jour avec des traces non tarifées reste inconnu.
3. Exiger `N ≥ 7`, au moins 10 requêtes tarifées, au moins 3 jours avec activité tarifée et **aucune trace de coût inconnu** dans cette fenêtre. Sinon : `insufficient_data` (« Données insuffisantes ») ou `unavailable` (couverture partielle), sans nombre prévisionnel.
4. Avec `C` la somme des coûts connus : `r = C / N`. Projections à compter du jour courant : `P7 = 7 × r`, `P30 = 30 × r`. Le graphique montre le coût quotidien estimé `r`, pas un cumul. Les dates manquantes avec coût inconnu coupent la courbe historique.

### Fin de mois

Soit `O` le coût estimé déjà observé ce mois, `T` la partie de `O` enregistrée aujourd’hui, et `F` le nombre de jours civils après aujourd’hui jusqu’à la fin du mois :

`E = O + r × F + max(0, r − T)`.

Cette formule complète la journée courante jusqu’au rythme moyen sans compter deux fois ses dépenses déjà enregistrées; si `T > r`, cette dépense est conservée intégralement. La durée du mois est calculée, y compris février bissextile. Si une trace du mois a un coût inconnu, `E` est indisponible, même si les projections 7/30 jours restent calculables sur leur propre fenêtre. Le sous-total observé connu reste affiché avec sa couverture.

Aucune tendance, saisonnalité, croissance, intervalle de confiance ou garantie budgétaire n’est déduit de cette moyenne. L’échantillon, ses dates, jours actifs et nombres de requêtes tarifées/non tarifées sont affichés.

## Budget et alertes

`002_finops_budget.sql` crée `finops_settings`, avec une seule ligne partagée par base locale. Le budget mensuel positif (maximum 1 milliard USD) s’applique aux mois suivants jusqu’à modification; null le désactive. Les tables d’inférence/documents/formulaires sont préservées, sans réécriture des données.

`consommation = montant / budget × 100`. À partir de 80 % : vigilance; à partir de 100 % : atteint/dépassé. L’interface distingue **observé estimé** et **projection fin de mois**. Si le mois contient des coûts inconnus, le sous-total connu peut déjà justifier une alerte 80/100 %, mais un montant inférieur ne permet pas de déclarer le budget respecté. Les barres sont bornées à 100 %, le pourcentage textuel peut dépasser 100 %.

Aucune notification externe ni tâche planifiée : les alertes sont recalculées au chargement, à l’actualisation et après enregistrement du budget. Aucun découpage par utilisateur ou historique des budgets n’est implémenté.

## Simulation

L’utilisateur choisit le modèle configuré, les requêtes/jour (entier 0 à 1 000 000), les tokens moyens d’entrée/sortie (nombres 0 à 10 000 000) et un budget de scénario positif optionnel. Les coûts simulés ne sont pas enregistrés comme des dépenses réelles.

`coûtMensuel = coûtParRequête × requêtesParJour × joursDuMoisCourantUTC`.

Aucun appel Groq n’est fait. Le budget de simulation n’écrit pas le budget partagé; les dépassements sont indiqués séparément. Un modèle sans tarif renvoie `unavailable`, jamais un coût inventé.

## Endpoints et sécurité

Tous réutilisent le middleware de télémétrie locale : activation explicite `DASHBOARD_TELEMETRY_LOCAL_ONLY=true`, connexion loopback, politique CORS d’origine existante. Les écritures utilisent POST déjà autorisé par CORS; aucune méthode n’a été ajoutée à la politique globale.

- `GET /api/dashboard/finops` : fenêtre historique, projections, mois courant, couverture et sous-totaux par modèle, budget/alertes et tarifs configurés. Les filtres de période du Dashboard historique ne modifient pas cette fenêtre.
- `POST /api/dashboard/finops/budget` : `{ "monthlyBudgetUsd": nombrePositifOuNull }`.
- `POST /api/dashboard/finops/simulate` : `{ "model": "identifiant", "requestsPerDay": entier, "inputTokens": moyenne, "outputTokens": moyenne, "monthlyBudgetUsd": nombrePositifOuNull }`.

Champs inattendus et paramètres invalides : 400; accès non autorisé par les gardes existantes : 403; échec SQLite : réponse 500 générique, sans détail interne. Les calculs ne lisent ni prompts, ni extraits, ni données de formulaires.

## Limites de couverture

Seules les traces `/api/chat` persistées sont utilisées. La génération de formulaires, l’Agent Workspace distinct, les appels extérieurs, les tentatives Groq ayant échoué et les traces perdues lors d’un incident de persistance peuvent représenter des coûts non couverts. Une couverture de 100 % signifie « toutes les traces de cet échantillon sont tarifées », pas « toute la facture fournisseur est connue ». Absence d’événement enregistré ne prouve pas que le système fonctionnait ou que les coûts externes étaient nuls. Les tarifs ou usages manquants peuvent empêcher une prévision; il faut compléter la configuration et accumuler de nouvelles traces, sans inventer l’historique.

La démonstration n’est pas authentifiée et doit rester locale; ne pas l’exposer par proxy public. Les calculs ne constituent pas un conseil financier ni une facture. La Phase 5 n’est pas commencée.

## Vérifications

`server/finops.test.js` couvre coûts, données manquantes, seuils, projections, calendrier UTC, simulation, persistance et erreurs HTTP/CORS. La migration reste idempotente et préserve l’historique existant. Les tests Angular couvrent les états, formulaires, alertes et interruption des courbes sur données inconnues. Aucun test ne contacte Groq ou n’utilise une base métier réelle.
