const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

// ── GEMINI API KEY (stored securely on server) ──────────────────────
const GEMINI_KEY = process.env.GEMINI_API_KEY || 'AIzaSyB87-YMzcyTAQetdpH45wTHT45ql5xguF4';

// Gemini models to try in order
const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.5-flash-preview-04-17',
  'gemini-2.5-pro'
];

async function callGemini(prompt, maxTokens = 4000) {
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens }
  };

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000)
      });
      if (r.status === 404) continue; // model not found, try next
      if (r.status === 429) continue; // rate limited, try next model
      if (!r.ok) {
        const err = await r.json();
        const msg = err?.error?.message || '';
        if (msg.toLowerCase().includes('api key')) throw new Error('Invalid API key');
        continue;
      }
      const d = await r.json();
      const text = d?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        console.log(`✓ Gemini response via ${model} (${text.length} chars)`);
        return text;
      }
    } catch(e) {
      if (e.message === 'Invalid API key') throw e;
      console.log(`✗ ${model}: ${e.message}`);
    }
  }
  throw new Error('All Gemini models failed or rate limited');
}

// ── STOCK PRICE SYMBOLS ─────────────────────────────────────────────
const SYMBOLS = {
  HYUNDAI:     { primary: 'HYUNDAIMOTOR.NS', fallbacks: ['HYUNDAIMOTOR.BO', 'HYUNDAI.NS'] },
  TATAGOLD:    { primary: 'TATAGOLD.NS',     fallbacks: ['TATAGOLD.BO'] },
  SWANDEFENCE: { primary: 'SWANDEF.NS',      fallbacks: ['SWANDEF.BO'] },
  ASHOKLEY:    { primary: 'ASHOKLEYLAND.NS', fallbacks: ['ASHOKLEYLAND.BO'] },
  FEDERALBNK:  { primary: 'FEDERALBNK.NS',  fallbacks: ['FEDERALBNK.BO'] },
  BPCL:        { primary: 'BPCL.NS',         fallbacks: ['BPCL.BO'] },
  BEL:         { primary: 'BEL.NS',          fallbacks: ['BEL.BO'] },
  ENGINERSIN:  { primary: 'ENGINERSIN.NS',   fallbacks: ['ENGINERSIN.BO'] },
  GOLDCASE:    { primary: 'GOLDCASE.NS',     fallbacks: ['GOLDCASE.BO'] },
  TDPOWERSYS:  { primary: 'TDPOWERSYS.NS',  fallbacks: ['TDPOWERSYS.BO'] },
  TATSILV:     { primary: 'TATSILV.NS',      fallbacks: ['TATSILV.BO'] },
  BDL:         { primary: 'BDL.NS',          fallbacks: ['BDL.BO'] },
  ADANIPOWER:  { primary: 'ADANIPOWER.NS',   fallbacks: ['ADANIPOWER.BO'] },
  BANKINDIA:   { primary: 'BANKINDIA.NS',    fallbacks: ['BANKINDIA.BO'] },
  UNIONBANK:   { primary: 'UNIONBANK.NS',    fallbacks: ['UNIONBANK.BO'] },
  SUZLON:      { primary: 'SUZLON.NS',       fallbacks: ['SUZLON.BO'] },
  GTLINFRA:    { primary: 'GTLINFRA.NS',     fallbacks: ['GTLINFRA.BO'] },
};

async function fetchSingle(sym) {
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' }
      });
      if (!r.ok) continue;
      const d = await r.json();
      const meta = d?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice || meta?.previousClose;
      if (price && price > 0) return parseFloat(price.toFixed(2));
    } catch(e) {}
  }
  return null;
}

// ── ROUTES ──────────────────────────────────────────────────────────

// GET /prices — all 17 portfolio prices
app.get('/prices', async (req, res) => {
  const prices = {};
  const missing = [];
  await Promise.all(Object.entries(SYMBOLS).map(async ([key, cfg]) => {
    let price = await fetchSingle(cfg.primary);
    if (!price) for (const fb of cfg.fallbacks) { price = await fetchSingle(fb); if (price) break; }
    if (price) prices[key] = price; else missing.push(key);
  }));
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  console.log(`Prices: ${Object.keys(prices).length}/17 at ${now}${missing.length ? ' | Missing: '+missing.join(',') : ' | All OK'}`);
  res.json({ prices, updated: now, count: Object.keys(prices).length, missing });
});

// GET /quote?tickers=SUNPHARMA,HDFCBANK — any NSE stock
app.get('/quote', async (req, res) => {
  const tickers = (req.query.tickers||'').split(',').map(t=>t.trim().toUpperCase()).filter(Boolean).slice(0,20);
  if (!tickers.length) return res.status(400).json({ error: 'Use ?tickers=SUNPHARMA,HDFCBANK' });
  const prices = {};
  await Promise.all(tickers.map(async (t) => {
    for (const sym of [t+'.NS', t+'.BO']) { const p = await fetchSingle(sym); if (p) { prices[t]=p; break; } }
  }));
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  res.json({ prices, updated: now, count: Object.keys(prices).length, missing: tickers.filter(t=>!prices[t]) });
});

// POST /ai — proxy all Gemini AI calls
app.post('/ai', async (req, res) => {
  try {
    const { prompt, maxTokens } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    const text = await callGemini(prompt, maxTokens || 4000);
    res.json({ text, ok: true });
  } catch(e) {
    console.error('AI error:', e.message);
    res.status(500).json({ error: e.message, ok: false });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'MarketEdge Pro Server v4.0', endpoints: ['/prices', '/quote?tickers=X', 'POST /ai'] });
});

app.listen(PORT, () => console.log(`MarketEdge Pro Server v4.0 on port ${PORT}`));
