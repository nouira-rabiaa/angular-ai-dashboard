# 🚀 Enterprise AI Engine & RAG Dashboard

> Conçu et développé par **Rabiaa NOUIRA**

An enterprise-grade AI dashboard featuring a real-time **RAG (Retrieval-Augmented Generation)** pipeline, **FinOps telemetry**, **dynamic form generation**, and client-side intelligence, built with **Angular 19** and a **Node.js BFF (Backend-For-Frontend)** architecture.

---

## 🏗️ Architecture & Technical Stack

[ Angular 19 (Standalone & Signals) ] <---> [ Node.js / Express BFF ] <---> [ LLM API / Groq / OpenAI ]
|                                         |
[ Transformers.js ]                         [ Vector RAG / SQLite ]

* **Front-End :** Angular 19 (Standalone Components, Signals pour une réactivité granulaire), SCSS modulaire.
* **Back-End (BFF) :** Node.js, Express, Multer (gestion des flux binaires multipart), Better-SQLite3.
* **AI & Intelligence Pipeline :** 
  * *RAG & Vector Search :* Découpage intelligent (*Chunking*), calcul de similarité vectorielle (**Cosine Similarity**).
  * *Token Tracking & Optimization :* **tiktoken** pour le décompte précis des tokens et l'analyse des coûts.
  * *Client-Side ML :* **Transformers.js** pour l'exécution de modèles directement dans le navigateur (WebAssembly/WebGPU).

---

## ✨ Key Features & Deep Dive

### 1. RAG Pipeline & Semantic Search
* **Ingestion de documents :** Support des formats PDF et CSV via un système de parsing asynchrone sécurisé par le BFF.
* **Recherche Sémantique & Similarité Cosinus :** Calcul mathématique de la pertinence contextuelle pour injecter uniquement les fragments de texte pertinents au LLM, éliminant ainsi les hallucinations.
* **Traçabilité UI :** Affichage en temps réel de badges visuels de similarité (ex: `Cosine Similarity: 71.3%`) directement dans l'interface de chat.

### 2. Real-Time FinOps & Observability Dashboard
* **Indicateurs de production pilotés par Angular Signals :**
  * **Latence Moyenne (ms) :** Suivi de la réactivité de bout en bout de l'inférence.
  * **Consommation de Tokens :** Suivi granulaire via *tiktoken*.
  * **Coût Estimé ($) :** Calcul dynamique en temps réel du coût des requêtes API.
  * **Taux de Succès (%) :** Indicateur de résilience et de haute disponibilité.

### 3. Dynamic Form Generation & SQLite Persistence
* **Génération de formulaires à la volée :** L'IA analyse les requêtes textuelles (ex: "génère un formulaire de contact") et retourne un schéma JSON structuré.
* **Rendu Dynamique :** Angular interprète ce schéma pour instancier les composants de formulaires de manière dynamique.
* **Persistance Sécurisée :** Enregistrement structuré des données validées dans une base de données **SQLite** en utilisant des requêtes préparées (*Prepared Statements*) pour contrer les injections SQL.

---

## 🛡️ Best Practices & Engineering Standards

* **Separation of Concerns (SoC) :** Isolation stricte des responsabilités entre les services HTTP Angular, les routes du BFF Node.js et la logique de persistance.
* **Defensive UI/UX :** Gestion rigoureuse des états de chargement (`isLoading = signal(false)`) garantie à la fois dans les blocs de succès et d'erreur pour éviter les bugs de boutons figés (*double-click prevention*).
* **Sécurisation des secrets :** Masquage des clés d'API sensibles derrière la couche BFF Node.js.

---

## 🛠️ Getting Started Locally

### Prerequisites
* Node.js (v18+ recommandé)
* Angular CLI (v19)
* Clé API fournisseur LLM (Groq / OpenAI)

### 1. Clone the repository
```bash
git clone [https://github.com/nouira-rabiaa/angular-ai-dashboard.git](https://github.com/nouira-rabiaa/angular-ai-dashboard.git)
cd angular-ai-dashboard
2. Configure and Run the Backend (BFF)
Bash
cd server
npm install
# Crée un fichier .env avec tes variables :
# PORT=3000
# API_KEY=ta_cle_api_ici
node server.js
3. Run the Angular Front-End
Bash
cd ../client
npm install
ng serve
Ouvre ton navigateur à l'adresse : http://localhost:4200.
👨‍💻 Author
Rabiaa NOUIRA
Enterprise Full-Stack & AI Engineer
📝 License
Ce projet est open-source et mis à disposition sous la licence MIT.
