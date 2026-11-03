import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import Groq from 'groq-sdk';
import { encoding_for_model } from 'tiktoken';
import Database from 'better-sqlite3';
import { registerInternalAgentRoute, createAgentRunner } from './agent.js';
import { createChatHandler } from './chat-handler.js';
import { createDashboardHandlers, registerDashboardRoutes } from './dashboard-routes.js';
import { createFinopsHandlers, registerFinopsRoutes } from './finops.js';
import { registerSupportKnowledgeRoutes } from './support-knowledge.js';
import { registerSupportAgentRoutes } from './support-agents.js';
import { runMigrations } from './migration-runner.js';
import { validateLocalDemoBinding } from './local-demo-security.js';
import { createCorsPolicy, parseCorsAllowedOrigins } from './cors-policy.js';
import { registerLegacyHistoryRoutes } from './legacy-history-routes.js';
import {
  createDocumentParseHandler,
  initializeDocumentStore,
  searchDocumentChunks
} from './document-store.js';

const db = new Database('submissions.db');
db.pragma('foreign_keys = ON');

const app = express();
const PORT = process.env.PORT || 3000;
const localTelemetryEnabled = process.env.DASHBOARD_TELEMETRY_LOCAL_ONLY === 'true';
const HOST = validateLocalDemoBinding({
  host: process.env.HOST,
  nodeEnv: process.env.NODE_ENV,
  telemetryLocalOnly: process.env.DASHBOARD_TELEMETRY_LOCAL_ONLY
});

app.use(createCorsPolicy(parseCorsAllowedOrigins()));
app.use(express.json());

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Création de la table SQLite
db.exec(`
  CREATE TABLE IF NOT EXISTS form_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS documents_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    character_count INTEGER,
    chunks_count INTEGER,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

initializeDocumentStore(db);
runMigrations(db);

console.log('✅ Base de données SQLite initialisée avec succès.');

const runAgent = createAgentRunner({ groq, db });

registerLegacyHistoryRoutes(app);

const dashboardHandlers = createDashboardHandlers(db, { localOnlyEnabled: localTelemetryEnabled });
registerDashboardRoutes(app, dashboardHandlers);
registerFinopsRoutes(app, createFinopsHandlers(db), dashboardHandlers.middleware);
registerSupportAgentRoutes(app, db, dashboardHandlers.middleware);
registerSupportKnowledgeRoutes(app, { db, groq }, dashboardHandlers.middleware);

// 1. Route Chat LLM avec support RAG
app.post('/api/chat', createChatHandler({ groq, db }));

// 2. Route Tokens
app.post('/api/tokens', (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.json({ tokens: 0 });

    const enc = encoding_for_model('gpt-4o');
    const tokens = enc.encode(text);
    enc.free();

    res.json({ tokens: tokens.length });
  } catch (error) {
    res.status(500).json({ error: 'Erreur tokens' });
  }
});

// 3. Route Upload, Parsing & Indexation Lexicale Document
const handleDocumentParse = createDocumentParseHandler({ db });
app.post('/api/document/parse', (req, res, next) => {
  upload.single('file')(req, res, error => {
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Fichier trop volumineux (limite 10 Mo).'
        : 'Téléversement invalide.';
      return res.status(400).json({ error: message });
    }
    next();
  });
}, handleDocumentParse);

// 4. Route Génération de Formulaires (Structured Outputs)
app.post('/api/generate-form', async (req, res) => {
  try {
    const { prompt, ragContext } = req.body;

    const systemPrompt = `Tu es une API de génération de formulaires JSON dynamiques.
RÈGLE ABSOLUE : Tu dois répondre EXCLUSIVEMENT avec un objet JSON valide, sans texte avant, sans texte après, sans balises markdown (\`\`\`json). N'écris aucune phrase de politesse.

Structure JSON attendue :
{
  "title": "Titre",
  "description": "Description",
  "fields": [
    {
      "name": "id",
      "label": "Libellé",
      "type": "text | email | number | textarea | select | checkbox",
      "required": true,
      "placeholder": "",
      "options": []
    }
  ]
}`;

    const userMessage = `
Contexte additionnel (RAG) :
<contexte>
${ragContext || 'Aucun contexte spécifique'}
</contexte>

Demande de l'utilisateur : ${prompt}
`;

   const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      model: 'openai/gpt-oss-120b',
      temperature: 0.1,
      max_tokens: 1500
    });

    let rawContent = completion.choices[0]?.message?.content || '{}';
    rawContent = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();

    const jsonStartIndex = rawContent.indexOf('{');
    const jsonEndIndex = rawContent.lastIndexOf('}');
    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
      rawContent = rawContent.substring(jsonStartIndex, jsonEndIndex + 1);
    }

    const schema = JSON.parse(rawContent);
    res.json({ schema });

  } catch (error) {
    console.error('Erreur /api/generate-form :', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Route de traitement des données de formulaire soumises
app.post('/api/submit-form', async (req, res) => {
  try {
    const formData = req.body;
    
    if (!formData || Object.keys(formData).length === 0) {
      return res.status(400).json({ error: 'Aucune donnée reçue' });
    }

    const stmt = db.prepare('INSERT INTO form_submissions (form_data) VALUES (?)');
    const info = stmt.run(JSON.stringify(formData));

    return res.json({ 
      success: true, 
      message: `Formulaire enregistré en base de données (ID: ${info.lastInsertRowid}) !`,
      submissionId: info.lastInsertRowid,
      data: formData 
    });

  } catch (error) {
    console.error('❌ Erreur d\'enregistrement BDD :', error?.message || error);
    return res.status(500).json({ error: 'Erreur lors de l\'enregistrement en base de données' });
  }
});

registerInternalAgentRoute(app, runAgent, dashboardHandlers.middleware);

app.listen(PORT, HOST, () => {
  console.log(`Serveur BFF démarré sur http://${HOST}:${PORT}`);
});