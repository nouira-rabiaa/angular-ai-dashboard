import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Groq from 'groq-sdk';
import { encoding_for_model } from 'tiktoken';
import Database from 'better-sqlite3';
const db = new Database('submissions.db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Stockage vectoriel en mémoire pour le RAG (associé aux chunks de documents uploadés)
let vectorDatabase = [];

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

console.log('✅ Base de données SQLite initialisée avec succès.');

// Fonction utilitaire : Calcul de similarité cosinus pour la recherche vectorielle
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return normA === 0 || normB === 0 ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Fonction simple de génération d'embedding de repli
function getSimpleEmbedding(text) {
  const vector = new Array(128).fill(0);
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    vector[i % 128] += charCode / 1000;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return magnitude === 0 ? vector : vector.map(val => val / magnitude);
}

// 1. Route Chat LLM avec support RAG (Recherche Vectorielle & Cosine Similarity)
app.post('/api/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt requis' });

    let systemPrompt = "Tu es un assistant IA d'entreprise performant et concis.";
    let matchedDocumentName = null;
    let matchScorePercent = null;

    if (vectorDatabase.length > 0) {
      const queryVector = getSimpleEmbedding(prompt);
      let bestMatch = null;
      let highestScore = -1;

      for (const item of vectorDatabase) {
        const score = cosineSimilarity(queryVector, item.vector);
        if (score > highestScore) {
          highestScore = score;
          bestMatch = item;
        }
      }

      if (bestMatch && highestScore > 0.1) {
        systemPrompt += `\n\n[CONTEXTE RAG EXTRAIT DU DOCUMENT : ${bestMatch.fileName}] (${(highestScore * 100).toFixed(1)}% de similarité)\n${bestMatch.chunk}\n[FIN DU CONTEXTE]\nUtilise en priorité les informations ci-dessus pour répondre.`;
        matchedDocumentName = bestMatch.fileName;
        matchScorePercent = (highestScore * 100).toFixed(1);
      }
    }

    const activeModels = [
      'openai/gpt-oss-120b',
      'groq/compound',
      'openai/gpt-oss-20b',
      'qwen/qwen3.8-27b'
    ];

    let completion = null;
    let lastError = null;

    for (const model of activeModels) {
      try {
        completion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          model: model,
          temperature: 0.7,
          max_tokens: 1500
        });

        if (completion) break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!completion) {
      throw lastError || new Error("Aucun modèle n'a pu répondre.");
    }

    const replyText = completion.choices[0]?.message?.content || 'Aucune réponse.';
    const tokensUsed = completion.usage?.total_tokens || Math.ceil(replyText.length / 4);

    return res.json({ 
      reply: replyText,
      tokens: tokensUsed,
      documentName: matchedDocumentName,
      vectorMeta: matchScorePercent ? { score: matchScorePercent } : null
    });

  } catch (error) {
    console.error('❌ Erreur Groq /api/chat :', error?.message || error);
    return res.status(500).json({ error: 'Erreur génération LLM' });
  }
});

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

// 3. Route Upload, Parsing & Vectorisation Document
app.post('/api/document/parse', upload.single('file'), async (req, res) => {
  try {
    console.log('--- Traitement du document & Vectorisation RAG ---');

    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    let extractedText = '';

    if (req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf')) {
      const pdfParseModule = await import('pdf-parse/lib/pdf-parse.js');
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const data = await pdfParse(req.file.buffer);
      extractedText = data.text;
    } else if (
      req.file.mimetype === 'text/plain' ||
      req.file.mimetype === 'text/csv' ||
      req.file.originalname.endsWith('.csv') ||
      req.file.originalname.endsWith('.txt')
    ) {
      extractedText = req.file.buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Format non supporté (PDF, TXT, CSV uniquement).' });
    }

    const cleanText = extractedText.trim();

    const chunkSize = 400;
    const chunks = [];
    for (let i = 0; i < cleanText.length; i += chunkSize) {
      chunks.push(cleanText.slice(i, i + chunkSize));
    }

    vectorDatabase = [];
    for (const chunk of chunks) {
      const vector = getSimpleEmbedding(chunk);
      vectorDatabase.push({
        fileName: req.file.originalname,
        chunk,
        vector
      });
    }

    const insertHistoryStmt = db.prepare(`
      INSERT INTO documents_history (filename, file_type, character_count, chunks_count, status, created_at) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const fileExtension = req.file.originalname.split('.').pop().toLowerCase();

    insertHistoryStmt.run(
      req.file.originalname,
      fileExtension,
      cleanText.length,
      chunks.length,
      'Success',
      new Date().toISOString()
    );

    console.log(`✅ Document vectorisé et enregistré en BDD : ${chunks.length} chunks stockés.`);

    return res.json({
      filename: req.file.originalname,
      text: cleanText,
      characterCount: cleanText.length,
      chunksGenerated: chunks.length
    });
  } catch (error) {
    console.error("Erreur parsing & embedding document :", error);
    return res.status(500).json({ error: "Échec de l'extraction et vectorisation du document." });
  }
});

app.post('/api/generate-form', async (req, res) => {
  try {
    const { prompt, ragContext } = req.body; // Supposons que tu récupères ton contexte RAG ici

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

    // On isole proprement le contexte RAG pour ne pas perturber le format JSON
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
      model: 'openai/gpt-oss-120b', // 🟢 Modèle de production actif et ultra-stable sur Groq
      temperature: 0.1,
      max_tokens: 1500
    });

    let rawContent = completion.choices[0]?.message?.content || '{}';

    // Double sécurité de nettoyage au cas où le LLM mettrait des balises
    rawContent = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();

    // Si le LLM a quand même renvoyé du texte parasite autour du JSON, on extrait le premier '{' et le dernier '}'
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

// Route globale pour récupérer l'historique unifié (Formulaires + Documents)
app.get('/api/dashboard/history', (req, res) => {
  try {
    const forms = db.prepare(`
      SELECT id, 
             form_data as title, 
             'form' as type, 
             created_at 
      FROM form_submissions
    `).all();

    const documents = db.prepare(`
      SELECT id, 
             filename as title, 
             file_type as type, 
             character_count,
             chunks_count,
             status,
             created_at 
      FROM documents_history
    `).all();

    const combinedHistory = [...forms, ...documents].sort((a, b) => {
      return new Date(b.created_at) - new Date(a.created_at);
    });

    res.json(combinedHistory);
  } catch (error) {
    console.error("Erreur récupération historique dashboard :", error);
    res.status(500).json({ error: "Impossible de récupérer l'historique." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur BFF démarré sur http://localhost:${PORT}`);
});