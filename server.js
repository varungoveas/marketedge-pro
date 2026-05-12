const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Verified Yahoo Finance symbols — each has NSE primary + BSE fallback
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
    const missing = [];

    const tasks = Object.entries(SYMBOLS).map(async ([key, cfg]) => {
      // Try primary ticker
      let price = await fetchSingle(cfg.primary);

      // Try fallbacks if primary failed
      if (!price) {
        for (const fb of cfg.fallbacks) {
          price = await fetchSingle(fb);
          if (price) break;
        }
      }

      if (price) {
        prices[key] = price;
      } else {
        missing.push(key);
      }
    });

    await Promise.all(tasks);

    const now = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit'
    });

    console.log(`✓ ${Object.keys(prices).length}/17 prices at ${now}${missing.length ? ' | Missing: ' + missing.join(', ') : ' | All fetched!'}`);

    res.json({
      prices,
      updated: now,
      count: Object.keys(prices).length,
      missing: missing
    });
  } catch(err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message, prices: {} });
  }
});

// GET /quote?tickers=SUNPHARMA,HDFCBANK — fetch any NSE/BSE stocks
app.get('/quote', async (req, res) => {
  try {
    const tickerStr = req.query.tickers || '';
    const tickers = tickerStr.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);

    if (!tickers.length) return res.status(400).json({ error: 'Use ?tickers=SUNPHARMA,HDFCBANK' });
    if (tickers.length > 20) return res.status(400).json({ error: 'Max 20 tickers' });

    const prices = {};
    await Promise.all(tickers.map(async (ticker) => {
      for (const sym of [ticker + '.NS', ticker + '.BO']) {
        const price = await fetchSingle(sym);
        if (price) { prices[ticker] = price; break; }
      }
    }));

    const now = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit'
    });

    const missing = tickers.filter(t => !prices[t]);
    console.log(`Quote: ${Object.keys(prices).length}/${tickers.length} at ${now}${missing.length ? ' | Missing: ' + missing.join(', ') : ''}`);

    res.json({ prices, updated: now, count: Object.keys(prices).length, missing });
  } catch(err) {
    res.status(500).json({ error: err.message, prices: {} });
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'MarketEdge Price Server v3.1',
    endpoints: {
      '/prices': 'All 17 portfolio prices',
      '/quote?tickers=SUNPHARMA,HDFCBANK': 'Any NSE/BSE stock prices'
    }
  });
});

app.listen(PORT, () => console.log(`MarketEdge Price Server v3.1 on port ${PORT}`));
