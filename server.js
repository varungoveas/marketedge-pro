const express = require('express');
const { MongoClient } = require('mongodb');
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

// ── MONGODB ──────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://varunantony1289_db_user:zlaXKdJ7o9sOQ1rt@cluster0.ip4y7ru.mongodb.net/?appName=Cluster0';
const DB_NAME = 'marketedge';
let db = null;

async function getDb() {
  if(db) return db;
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log('✓ MongoDB connected');
  return db;
}

// ── GEMINI API ───────────────────────────────────────────────────
const GEMINI_KEY = process.env.GEMINI_API_KEY || 'AIzaSyB87-YMzcyTAQetdpH45wTHT45ql5xguF4';
const MODELS = ['gemini-2.5-flash','gemini-2.5-flash-lite','gemini-2.5-flash-preview-05-20','gemini-2.5-pro'];

async function callGemini(prompt, maxTokens = 4000) {
  const payload = { contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.4,maxOutputTokens:maxTokens} };
  for (const model of MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,{
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal:AbortSignal.timeout(30000)
      });
      if(r.status===404||r.status===429) continue;
      if(!r.ok) { const e=await r.json(); if(e?.error?.message?.includes('key')) throw new Error('Invalid API key'); continue; }
      const d = await r.json();
      const text = d?.candidates?.[0]?.content?.parts?.[0]?.text;
      if(text) { console.log(`✓ Gemini via ${model}`); return text; }
    } catch(e) { if(e.message==='Invalid API key') throw e; }
  }
  throw new Error('All Gemini models failed');
}

// ── STOCK SYMBOLS ────────────────────────────────────────────────
const PORTFOLIO_SYMBOLS = {
  HYUNDAI:{primary:'HYUNDAIMOTOR.NS',fallbacks:['HYUNDAIMOTOR.BO']},
  TATAGOLD:{primary:'TATAGOLD.NS',fallbacks:['TATAGOLD.BO']},
  SWANDEFENCE:{primary:'SWANDEF.NS',fallbacks:['SWANDEF.BO']},
  ASHOKLEY:{primary:'ASHOKLEYLAND.NS',fallbacks:['ASHOKLEYLAND.BO']},
  FEDERALBNK:{primary:'FEDERALBNK.NS',fallbacks:['FEDERALBNK.BO']},
  BPCL:{primary:'BPCL.NS',fallbacks:['BPCL.BO']},
  BEL:{primary:'BEL.NS',fallbacks:['BEL.BO']},
  ENGINERSIN:{primary:'ENGINERSIN.NS',fallbacks:['ENGINERSIN.BO']},
  GOLDCASE:{primary:'GOLDCASE.NS',fallbacks:['GOLDCASE.BO']},
  TDPOWERSYS:{primary:'TDPOWERSYS.NS',fallbacks:['TDPOWERSYS.BO']},
  TATSILV:{primary:'TATSILV.NS',fallbacks:['TATSILV.BO']},
  BDL:{primary:'BDL.NS',fallbacks:['BDL.BO']},
  ADANIPOWER:{primary:'ADANIPOWER.NS',fallbacks:['ADANIPOWER.BO']},
  BANKINDIA:{primary:'BANKINDIA.NS',fallbacks:['BANKINDIA.BO']},
  UNIONBANK:{primary:'UNIONBANK.NS',fallbacks:['UNIONBANK.BO']},
  SUZLON:{primary:'SUZLON.NS',fallbacks:['SUZLON.BO']},
  GTLINFRA:{primary:'GTLINFRA.NS',fallbacks:['GTLINFRA.BO']},
};

const INDEX_SYMBOLS = { SENSEX:'^BSESN', NIFTY:'^NSEI', BANKNIFTY:'^NSEBANK', VIX:'^INDIAVIX' };

async function fetchSingle(sym) {
  for (const base of ['https://query1.finance.yahoo.com','https://query2.finance.yahoo.com']) {
    try {
      const r = await fetch(`${base}/v8/finance/chart/${sym}?interval=1d&range=1d`,{
        headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36','Accept':'application/json'}
      });
      if(!r.ok) continue;
      const d = await r.json();
      const meta = d?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice || meta?.previousClose;
      if(price && price > 0) return parseFloat(price.toFixed(2));
    } catch(e) {}
  }
  return null;
}

// ── PORTFOLIO ROUTES ─────────────────────────────────────────────

// Save portfolio
app.post('/portfolio/save', async (req, res) => {
  try {
    const { user, portfolio } = req.body;
    if(!user || !portfolio) return res.status(400).json({ error: 'user and portfolio required' });
    const key = user.toLowerCase().trim();
    const database = await getDb();
    await database.collection('portfolios').updateOne(
      { user: key },
      { $set: { user: key, portfolio, updatedAt: new Date() } },
      { upsert: true }
    );
    console.log(`✓ Portfolio saved for ${key} (${portfolio.length} stocks)`);
    res.json({ ok: true, user: key, stocks: portfolio.length });
  } catch(e) {
    console.error('Save error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Load portfolio
app.get('/portfolio/load', async (req, res) => {
  try {
    const user = (req.query.user||'').toLowerCase().trim();
    if(!user) return res.status(400).json({ error: 'user required' });
    const database = await getDb();
    const doc = await database.collection('portfolios').findOne({ user });
    if(!doc) return res.json({ ok: false, portfolio: null, message: 'No portfolio found for ' + user });
    console.log(`✓ Portfolio loaded for ${user} (${doc.portfolio.length} stocks)`);
    res.json({ ok: true, user, portfolio: doc.portfolio, updatedAt: doc.updatedAt });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// List all users
app.get('/portfolio/users', async (req, res) => {
  try {
    const database = await getDb();
    const docs = await database.collection('portfolios').find({}, { projection: { user:1, portfolio:1, updatedAt:1 } }).toArray();
    res.json({ users: docs.map(d => ({ name: d.user, stocks: d.portfolio.length, updatedAt: d.updatedAt })) });
  } catch(e) {
    res.json({ users: [] });
  }
});

// ── PRICE ROUTES ─────────────────────────────────────────────────

app.get('/prices', async (req, res) => {
  const prices = {}, missing = [];
  await Promise.all(Object.entries(PORTFOLIO_SYMBOLS).map(async ([key, cfg]) => {
    let price = await fetchSingle(cfg.primary);
    if(!price) for(const fb of cfg.fallbacks){ price=await fetchSingle(fb); if(price) break; }
    if(price) prices[key]=price; else missing.push(key);
  }));
  const now = new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  console.log(`Prices: ${Object.keys(prices).length}/17${missing.length?' | Missing:'+missing.join(','):' | All OK'}`);
  res.json({ prices, updated:now, count:Object.keys(prices).length, missing });
});

app.get('/quote', async (req, res) => {
  const tickers = (req.query.tickers||'').split(',').map(t=>t.trim().toUpperCase()).filter(Boolean).slice(0,20);
  if(!tickers.length) return res.status(400).json({error:'Use ?tickers=SUNPHARMA'});
  const prices = {};
  await Promise.all(tickers.map(async t => {
    for(const sym of [t+'.NS',t+'.BO']){ const p=await fetchSingle(sym); if(p){prices[t]=p;break;} }
  }));
  const now = new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  res.json({prices,updated:now,count:Object.keys(prices).length,missing:tickers.filter(t=>!prices[t])});
});

app.get('/indices', async (req, res) => {
  const indices = {};
  await Promise.all(Object.entries(INDEX_SYMBOLS).map(async ([key,sym]) => {
    const p = await fetchSingle(sym); if(p) indices[key]=p;
  }));
  const now = new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  res.json({indices,updated:now});
});

app.post('/ai', async (req, res) => {
  try {
    const { prompt, maxTokens } = req.body;
    if(!prompt) return res.status(400).json({error:'prompt required'});
    const text = await callGemini(prompt, maxTokens||4000);
    res.json({text,ok:true});
  } catch(e) {
    res.status(500).json({error:e.message,ok:false});
  }
});

app.get('/', async (req, res) => {
  let userCount = 0;
  try { const d = await getDb(); userCount = await d.collection('portfolios').countDocuments(); } catch(e) {}
  res.json({ status:'MarketEdge Pro Server v5.0 + MongoDB', users: userCount });
});

app.listen(PORT, () => {
  console.log(`MarketEdge Pro Server v5.0 on port ${PORT}`);
  getDb().catch(e => console.error('MongoDB connection failed:', e.message));
});
