🏛️ Architecture & Clean Code - Enterprise AI Dashboard
Ce document détaille l'architecture logicielle globale, les flux de données et les standards de conception de niveau production mis en œuvre dans ce projet par Rabiaa NOUIRA.
1. Schéma Global de l'Architecture (Monorepo & BFF)
Le schéma ci-dessous illustre la circulation des données de l'utilisateur jusqu'aux services d'intelligence artificielle et la base de données locale :
+---------------------------------------------------------------------------------+
|                               CLIENT (Browser)                                  |
|                               Angular 19 Standalone                             |
|    +------------------------+   +------------------------+                      |
|    | Reactive UI / Signals  |   | Transformers.js (WASM) |                      |
|    +------------------------+   +------------------------+                      |
+---------------------------------------------------------------------------------+
                                       |
                                       | HTTPS / JSON / Multipart (FormData)
                                       v
+---------------------------------------------------------------------------------+
|                         BACKEND BFF (Node.js / Express)                         |
|    +------------------------+   +------------------------+                      |
|    | Multer (File Parsing)  |   | tiktoken (Token Audit) |                      |
|    +------------------------+   +------------------------+                      |
+---------------------------------------------------------------------------------+
               |                                              |
               v                                              v
+-----------------------------+                +------------------------------+
|     AI & VECTOR PIPELINE    |                |      LOCAL PERSISTENCE       |
|  - Chunking de documents    |                |  - SQLite (Better-SQLite3)   |
|  - Cosine Similarity (RAG)  |                |  - Prepared Statements       |
|  - Groq / OpenAI LLM APIs   |                |    (Anti-Injections SQL)     |
+-----------------------------+                +------------------------------+
2. Architecture Détaillée par Couche
A. Front-End : Angular 19 & Réactivité Moderne
Standalone Components : Refonte de l'architecture sans modules encombrants (NgModule). Chaque composant importe directement ses dépendances, ce qui optimise le tree-shaking (élimination du code mort) et réduit drastiquement la taille du bundle initial.
Signals (signal, computed) vs RxJS : Utilisation des Signals pour la gestion fine des états locaux (indicateurs de chargement, formulaires dynamiques, métriques de télémétrie). Les Signals garantissent une réactivité synchrone et ultra-rapide, sans la complexité des flux asynchrones superflus pour l'UI.
Isolation du réseau (Services dédiés) : Le principe de responsabilité unique est respecté : les composants ne font jamais d'appels HTTP bruts. Toute la communication passe par des services d'API typés en TypeScript.
B. Back-End : Le Pattern BFF (Backend-For-Frontend)
Passerelle de Sécurité : Le serveur Node.js/Express fait office de bouclier. Il centralise les clés d'API secrètes (Groq/OpenAI) pour qu'elles ne soient jamais exposées dans le code source du navigateur client.
Gestion des flux binaires : Utilisation de Multer pour la gestion de la mémoire et le traitement asynchrone des fichiers lourds (PDF, CSV) soumis par l'utilisateur.
3. Bonnes Pratiques & Standards de Développement
Pour garantir la maintenabilité, la sécurité et la scalabilité de l'application, plusieurs bonnes pratiques industrielles ont été appliquées :
1. Sécurité des Données & Prepared Statements (SQLite)
Problématique : Les insertions en base de données sont souvent vulnérables aux injections SQL si les données utilisateur sont concaténées directement dans les requêtes.
Bonne pratique appliquée : Utilisation systématique de Prepared Statements (requêtes préparées) avec better-sqlite3. La structure de la requête SQL est compilée à l'avance, et les données entrantes sont injectées de manière strictement cloisonnées, neutralisant tout risque d'injection.
2. UI/UX Défensive (Gestion des états de chargement)
Problématique : Un utilisateur qui clique frénétiquement sur un bouton de soumission peut provoquer des doublons de requêtes ou bloquer l'interface si une erreur réseau survient.
Bonne pratique appliquée : Encapsulation stricte des états de chargement via les Signals (isLoading.set(true) au départ, et garantie absolue de libération isLoading.set(false) dans les blocs next et error des observables). Cela élimine définitivement les bugs de boutons figés (frozen UI).
3. Separation of Concerns (SoC)
Problématique : Le code monolithique ou couplé est difficile à tester et à faire évoluer.
Bonne pratique appliquée : Cloisonnement rigoureux :
Le Front-End gère uniquement l'affichage, l'ergonomie et la réactivité.
Le BFF gère l'orchestration, le parsing de fichiers et l'audit des tokens.
La couche de persistence gère exclusivement l'intégrité des données en base locale.
4. Typage Stricte TypeScript
Évitement absolu du type any. Utilisation d'interfaces et de types stricts partagés (ou alignés) entre les charges utiles du front-end et les réponses du BFF pour garantir une robustesse à la compilation.
