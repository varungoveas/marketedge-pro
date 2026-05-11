const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Verified Yahoo Finance symbols for NSE stocks
const SYMBOLS = {
  HYUNDAI:     '533395.NS',       // Hyundai Motor India NSE code
  TATAGOLD:    'TATAGOLD.NS',
  SWANDEFENCE: 'SWANDEFENSE.NS',  // Note: Yahoo uses SWANDEFENSE not SWANDEFENCE
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

// Fallback symbols to try if primary fails
const FALLBACK_SYMBOLS = {
  HYUNDAI:     'HYUNDAI.NS',
  SWANDEFENCE: 'SWANDEFENCE.NS',
  GTLINFRA:    'GTLINFRA.BO',    // Try BSE if NSE fails
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
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });
      if (!r.ok) continue;
      const d = await r.json();
      const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && price > 0) return parseFloat(price.toFixed(2));
    } catch(e) {}
  }
  return null;
}

app.get('/prices', async (req, res) => {
  try {
    const prices = {};

    // Fetch all in parallel
    const tasks = Object.entries(SYMBOLS).map(async ([key, sym]) => {
      let price = await fetchSingle(sym);
      // Try fallback symbol if primary failed
      if (!price && FALLBACK_SYMBOLS[key]) {
        price = await fetchSingle(FALLBACK_SYMBOLS[key]);
      }
      if (price) prices[key] = price;
      else console.log(`Failed to fetch: ${key} (${sym})`);
    });

    await Promise.all(tasks);

    const now = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit'
    });

    console.log(`Fetched ${Object.keys(prices).length}/17 prices at ${now}`);
    console.log('Missing:', Object.keys(SYMBOLS).filter(k => !prices[k]));

    res.json({ prices, updated: now, count: Object.keys(prices).length });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message, prices: {} });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'MarketEdge Price Server v2.1 running' });
});

app.listen(PORT, () => console.log(`Server v2.1 running on port ${PORT}`));
