# Dark Enterprise — étapes UX

## UX-1 : socle

Audit initial sur `f4877610f30a7ec8109d469999e5ccf260b7459f`, branche feature propre et synchronisée. Angular 19.2, Tailwind 4.3.3 et `@tailwindcss/postcss` déjà déclarés et verrouillés ; aucun changement de dépendance nécessaire. Le plugin est déclaré dans `client/.postcssrc.json`, avec installation reproductible des dépendances racine puis client selon CI. Pas de configuration Tailwind v3 ajoutée.

Les tokens de `client/src/_theme.scss` centralisent surfaces, texte, bordures, accents et états. Ils servent aux utilitaires Tailwind et aux SCSS progressivement migrés. Le layout utilise ces tokens dès UX-1 ; les composants de route sont harmonisés dans UX-2. Pas de police distante ni bibliothèque de composants supplémentaire. Les focus clavier sont visibles, les états conservent des textes, le système réduit les animations selon la préférence utilisateur.

Les cinq routes restent lazy. Les données proviennent des services existants ; aucun faux indicateur ou résultat d'inférence n'est ajouté. Le BFF reste local, sans authentification, avec SQLite en clair. Le thème n'apporte aucune sécurité supplémentaire. Coûts estimés, citations et RAG FTS5/BM25 conservent leur sens.

Les tests automatisés ne certifient pas le rendu responsive. Safari WebDriver nécessite l'activation de l'automatisation distante ; aucun autre navigateur n'est installé dans Applications à l'audit. Les validations visuelles non exécutées doivent rester signalées dans chaque livraison.
