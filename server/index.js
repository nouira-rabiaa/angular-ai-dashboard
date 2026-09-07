import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { encoding_for_model } from 'tiktoken';
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // Limite à 5 Mo
// 1. Toujours charger dotenv EN PREMIER
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 2. Transmettre la clé explicitement au SDK
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || 'dummy_key_for_init',
});

// Route 1 : Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Serveur BFF opérationnel' });
});

// Route 2 : Tiktoken
app.post('/api/tokens/count', (req, res) => {
  try {
    const { text, model = 'gpt-4o' } = req.body;
    if (!text) return res.status(400).json({ error: 'Le champ "text" est requis.' });

    const encoder = encoding_for_model(model);
    const tokens = encoder.encode(text);
    const tokenCount = tokens.length;
    encoder.free();

    res.json({ text, tokenCount, model });
  } catch (error) {
    res.status(500).json({ error: 'Erreur tiktoken', details: error.message });
  }
});

// Route 3 : Groq Proxy
// Route 3 : Proxy sécurisé vers Groq
// Route 3 : Proxy sécurisé vers Groq
app.post('/api/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Le prompt est obligatoire.' });

    // Liste des modèles supportés
    const models = ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'mixtral-8x7b-32768'];
    let reply = null;

    for (const model of models) {
      try {
        const completion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: model,
        });
        reply = completion.choices[0]?.message?.content;
        if (reply) break;
      } catch (e) {
        // Continue vers le modèle suivant si échec
      }
    }
// Endpoint pour analyser un fichier PDF et extraire son contenu
app.post('/api/document/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    let extractedText = '';

    if (req.file.mimetype === 'application/pdf') {
      const data = await pdfParse(req.file.buffer);
      extractedText = data.text;
    } else if (req.file.mimetype === 'text/plain' || req.file.mimetype === 'text/csv') {
      extractedText = req.file.buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Format de fichier non supporté. Utilisez PDF, TXT ou CSV.' });
    }

    res.json({
      filename: req.file.originalname,
      text: extractedText,
      characterCount: extractedText.length
    });
  } catch (error: any) {
    console.error('Erreur traitement document:', error);
    res.status(500).json({ error: 'Échec de l\'extraction du document' });
  }
});
    // Réponse de secours si la clé API a une restriction
    if (!reply) {
      reply = `[Mode Demo] Analyse pour "${prompt}" : Angular 19 offre de superbes performances grâce aux Signals et à l'architecture Standalone sans NgModules.`;
    }

    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: 'Erreur Serveur', details: error.message });
  }
});
app.listen(PORT, () => {
  console.log(`🚀 Serveur BFF démarré sur http://localhost:${PORT}`);
});