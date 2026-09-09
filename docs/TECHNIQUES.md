🔬 Modern Techniques & AI Stack Deep Dive
Ce document expose en détail les choix technologiques de pointe, les algorithmes de deep learning et les briques d'intelligence artificielle intégrés dans l'Enterprise AI Dashboard par Rabiaa NOUIRA.
1. Schéma Global du Pipeline IA & Data Flow
Le schéma ci-dessous retrace le parcours d'une requête et l'interaction entre le front-end, le BFF, les moteurs d'embedding locaux et les services cloud :

+-----------------------------------------------------------------------------------------+
|                                    CLIENT (BROWSER)                                     |
|                                  Angular 19 Standalone                                  |
|   +--------------------------+                         +----------------------------+   |
|   |   Transformers.js (WASM) |                         |  Signals State Management  |   |
|   |  - Client-side ML/Embed  |                         |  - Defensive UI (Loading)  |   |
|   +--------------------------+                         +----------------------------+   |
+-----------------------------------------------------------------------------------------+
             |                                                         |
             | 1. Requête / Upload de fichiers (Multipart via Multer)  | 2. Rendu de Formulair Dynamique
             v                                                         v
+-----------------------------------------------------------------------------------------+
|                              BFF BACK-END (Node.js / Express)                           |
|   +--------------------------+                         +----------------------------+   |
|   |        tiktoken          |                         | Better-SQLite3             |   |
|   | - Token Tracking & FinOps|                         | - Prepared Statements      |   |
|   +--------------------------+                         +----------------------------+   |
+-----------------------------------------------------------------------------------------+
             |                                                         |
             v                                                         v
+-----------------------------------+                     +-------------------------------+
|       VECTOR RAG PIPELINE         |                     |     PERSISTENCE & SECURITY    |
|  - Intelligent Text Chunking      |                     |  - Stockage structuré local   |
|  - Cosine Similarity Math Engine  |                     |  - Isolation anti-injections  |
+-----------------------------------+                     +-------------------------------+
2. Analyse Détaillée des Techniques & Avantages Métiers
A. Pipeline RAG (Retrieval-Augmented Generation) & Recherche Sémantique
Le Principe : Le RAG permet d'injecter du contexte métier réel dans un LLM (Grand Modèle de Langage) afin de lui fournir une base de connaissances exacte, éliminant ainsi les hallucinations et garantissant des réponses ancrées dans l'entreprise.
Le Chunking Intelligent : Les documents bruts (PDF, CSV) soumis par l'utilisateur sont découpés algorithmiquement en segments de texte (chunks) de taille optimisée pour maximiser la pertinence contextuelle.
Similarité Cosinus (Cosine Similarity) :
Fonctionnement mathématique : Calcul de l'angle vectoriel entre l'embedding de la requête utilisateur et les embeddings des chunks documentaires stockés.
Valeur Ajoutée UI : L'interface affiche en direct le niveau de pertinence sous forme de badge visuel (ex: Cosine Similarity: 71.3%), offrant une traçabilité totale et transparente de la source de l'information.
B. Observabilité & FinOps en Temps Réel
Le Contexte : En milieu professionnel, l'utilisation d'APIs d'IA génère des coûts variables qu'il est impératif de surveiller pour éviter les dérives budgétaires.
Indicateurs clés du Dashboard :
Latence Moyenne (ms) : Mesure de la réactivité globale de l'inférence de bout en bout (du front-end jusqu'au retour du LLM).
Consommation de Tokens : Suivi granulaire et audit du volume textuel échangé.
Coût Estimé ($) : Calcul dynamique à la volée du coût financier de chaque requête (au centime près).
Taux de Succès (%) : Indicateur de résilience garantissant la haute disponibilité des services d'IA.
C. Optimisation & IA Embarquée (tiktoken & Transformers.js)
tiktoken (Audit & Précision) :
Utilité : Bibliothèque d'encodage officielle d'OpenAI exécutée côté back-end. Elle permet de compter de manière exacte le nombre de tokens avant l'appel API, optimisant ainsi la taille des contextes et garantissant un calcul FinOps rigoureux.
Transformers.js (Client-Side ML) :
Utilité : Intégration de modèles de Deep Learning d'Hugging Face exécutés directement dans le navigateur de l'utilisateur grâce au WebAssembly (WASM) et WebGPU.
Avantage : Décharge le serveur Node.js des calculs textuels basiques ou de la vectorisation préliminaire, réduisant la latence réseau et les coûts d'infrastructure.
D. Génération Dynamique & UI Défensive
Dynamic Form Generation :
Fonctionnement : L'IA analyse les requêtes textuelles complexes et renvoie un schéma de données au format JSON structuré. Le front-end Angular interprète ce schéma à la volée pour instancier dynamiquement des formulaires interactifs adaptés au besoin utilisateur.
UI/UX Défensive (Double-Click Prevention) :
Fonctionnement : Encapsulation stricte des états de chargement via les Signals (isLoading = signal(false)), avec une réinitialisation garantie dans les blocs de succès (next) et d'erreur (error) des flux asynchrones.
Avantage : Élimine définitivement les bugs de boutons figés et empêche l'envoi de requêtes en double en cas de clics frénétiques de l'utilisateur.
