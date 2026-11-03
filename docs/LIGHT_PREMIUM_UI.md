# Light Premium SaaS

Base : `49c803d2d0f0e57430f9898cdde3d44774d39217`, branche feature propre. Tailwind v4/PostCSS conservés, aucune dépendance ajoutée. Les tokens de `client/src/_premium.scss` centralisent la palette claire, les états, les espacements, la typographie, les rayons et ombres. Sidebar navy, actions bleues, accents secondaires violets, surfaces blanches.

UI-1 concerne le shell et les primitives visuelles ; UI-2 les espaces Dashboard/Chat/FinOps et le formulaire dynamique ; UI-3 les quatre espaces du Studio, la visite et l’explorateur. Aucune métrique, identité d’utilisateur ou santé de service fictive n’est ajoutée pour imiter la référence. Pas de FR/EN, nouvelle démo commerciale ou fonctionnalité 5D.

Le BFF reste local et sans authentification, SQLite en clair. Le design ne modifie ni permissions, ni calculs, ni persistance. Les tests JSDOM ne prouvent pas le rendu responsive ; les contrôles en navigateur non exécutés restent une réserve explicite.

## Inventaire UI-2

Dashboard : cartes et filtres unifiés, historique, tableaux et modales conservés. FinOps : cartes, champs et alertes à tokens communs, coûts toujours estimés, aucun calcul modifié. Chat : panneaux complémentaires à partir de 1280 px, saisie et import accessibles au clavier, citations et détails d'exécution conservés, états de chargement corrigés pour décrire le RAG lexical réel. Les anciens sélecteurs SCSS de chat sans consommateur dans le template ou le TypeScript ont été remplacés par des styles de layout utilisés. Formulaire dynamique : surface claire, champs, validations et états désactivés cohérents, schéma et soumission inchangés.
