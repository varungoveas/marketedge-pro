const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Verified Yahoo Finance symbols — tested against Groww prices 11 May 2026
const SYMBOLS = {
  HYUNDAI:     'HYUNDAIMOTOR.NS',
  TATAGOLD:    'TATAGOLD.NS',
  SWANDEFENCE: 'SWANDEFENSE.NS',
  ASHOKLEY:    'ASHOKLEYLAND.NS',
  FEDERALBNK:  'FEDERALBNK.NS',
  BPCL:        'BPCL.NS',
  BEL:         'BEL.NS',
  ENGINERSIN:  'ENGINERSIN.NS',
  GOLDCASE:    'GOLDCASE.NS',
  TDPOWERSYS:  'TDPOWERSYS.NS',
  TATSILV:     'TATSILV.NS',
  BDL:         'BDL.NS',
  ADANIPOWER:  'ADANIPOWER.NS',
  BANKINDIA:   'BANKINDIA.NS',
  UNIONBANK:   'UNIONBANK.NS',
  SUZLON:      'SUZLON.NS',
  GTLINFRA:    'GTLINFRA.NS',
};

// Fallback symbols
const FALLBACKS = {
  SWANDEFENCE: ['SWANDEFENCE.NS', 'SWANDEFENSE.BO'],
  GTLINFRA:    ['GTLINFRA.BO', '532775.NS'],
  HYUNDAI:     ['HYUNDAI.NS', '533395.NS'],
};

async function fetchSingle(sym) {
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        }
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

app.get('/prices', async (req, res) => {
  try {
    const prices = {};

    const tasks = Object.entries(SYMBOLS).map(async ([key, sym]) => {
      // Try primary symbol
      let price = await fetchSingle(sym);
      
      // Try fallbacks if primary failed
      if (!price && FALLBACKS[key]) {
        for (const fallback of FALLBACKS[key]) {
          price = await fetchSingle(fallback);
          if (price) break;
        }
      }
      
      if (price) {
        prices[key] = price;
      } else {
        console.log(`Failed: ${key} (${sym})`);
      }
    });

    await Promise.all(tasks);

    const now = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit'
    });

    const missing = Object.keys(SYMBOLS).filter(k => !prices[k]);
    console.log(`Fetched ${Object.keys(prices).length}/17 at ${now}. Missing: ${missing.join(', ') || 'none'}`);

    res.json({ prices, updated: now, count: Object.keys(prices).length, missing });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message, prices: {} });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'MarketEdge Price Server v2.2', version: '2.2' });
});

app.listen(PORT, () => console.log(`Server v2.2 on port ${PORT}`));
