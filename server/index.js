import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Groq from 'groq-sdk';
import { encoding_for_model } from 'tiktoken';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// 1. Route Chat LLM (Modèles actifs confirmés de ton compte)
app.post('/api/chat', async (req, res) => {
  try {
    const { prompt, context } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt requis' });

    let systemPrompt = "Tu es un assistant IA d'entreprise performant et concis.";

    if (context && typeof context === 'string' && context.trim().length > 0) {
      const truncatedContext = context.slice(0, 12000);
      systemPrompt += `\n\n[CONTEXTE DOCUMENT JOINT]\n${truncatedContext}\n[FIN DU CONTEXTE]\nUtilise en priorité les informations du document ci-dessus pour répondre à la demande de l'utilisateur.`;
    }

    // Modèles actifs extraits directement du dump de ton API Groq
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

        if (completion) {
          console.log(`✅ Réponse générée avec succès via : ${model}`);
          break;
        }
      } catch (err) {
        lastError = err;
        console.warn(`⚠️ Modèle ${model} indisponible, tentative suivante...`);
      }
    }

    if (!completion) {
      throw lastError || new Error("Aucun modèle n'a pu répondre.");
    }

    return res.json({ reply: completion.choices[0]?.message?.content || 'Aucune réponse.' });

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

// 3. Route Upload & Parsing Document (RAG)
app.post('/api/document/parse', upload.single('file'), async (req, res) => {
  try {
    console.log('--- Traitement du document ---');

    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    console.log(`Fichier reçu : ${req.file.originalname} (${req.file.mimetype})`);

    let extractedText = '';

    if (req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf')) {
      // Import dynamique de pdf-parse
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
    console.log(`✅ Extraction réussie (${cleanText.length} caractères)`);

    return res.json({
      filename: req.file.originalname,
      text: cleanText,
      characterCount: cleanText.length
    });
  } catch (error) {
    console.error("Erreur parsing document :", error);
    return res.status(500).json({ error: "Échec de l'extraction du document PDF." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur BFF démarré sur http://localhost:${PORT}`);
});