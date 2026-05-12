const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Default portfolio symbols
const PORTFOLIO_SYMBOLS = {
  HYUNDAI:     'HYUNDAIMOTOR.NS',
  TATAGOLD:    'TATAGOLD.NS',
  SWANDEFENCE: 'SWANDEF.NS',
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

const FALLBACKS = {
  SWANDEFENCE: ['SWANDEF.BO', 'SWANDEFENSE.NS'],
  ASHOKLEY:    ['ASHOKLEYLAND.BO', 'M_M.NS'],
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

// GET /prices — returns all portfolio prices
app.get('/prices', async (req, res) => {
  try {
    const prices = {};
    const tasks = Object.entries(PORTFOLIO_SYMBOLS).map(async ([key, sym]) => {
      let price = await fetchSingle(sym);
      if (!price && FALLBACKS[key]) {
        for (const fb of FALLBACKS[key]) {
          price = await fetchSingle(fb);
          if (price) break;
        }
      }
      if (price) prices[key] = price;
    });
    await Promise.all(tasks);

    const now = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit'
    });
    console.log(`Portfolio: ${Object.keys(prices).length}/17 at ${now}`);
    res.json({ prices, updated: now, count: Object.keys(prices).length });
  } catch(err) {
    res.status(500).json({ error: err.message, prices: {} });
  }
});

// GET /quote?tickers=SUNPHARMA,HDFCBANK,TCS — fetch any NSE stocks
app.get('/quote', async (req, res) => {
  try {
    const tickerStr = req.query.tickers || '';
    const tickers = tickerStr.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    
    if (tickers.length === 0) {
      return res.status(400).json({ error: 'No tickers provided. Use ?tickers=SUNPHARMA,HDFCBANK' });
    }
    if (tickers.length > 20) {
      return res.status(400).json({ error: 'Max 20 tickers per request' });
    }

    const prices = {};
    const tasks = tickers.map(async (ticker) => {
      // Try NSE first, then BSE
      const syms = [ticker + '.NS', ticker + '.BO'];
      for (const sym of syms) {
        const price = await fetchSingle(sym);
        if (price) { prices[ticker] = price; break; }
      }
    });
    await Promise.all(tasks);

    const now = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit'
    });
    console.log(`Quote: ${Object.keys(prices).length}/${tickers.length} at ${now}. Missing: ${tickers.filter(t=>!prices[t]).join(',')}`);
    res.json({ prices, updated: now, count: Object.keys(prices).length, requested: tickers.length });
  } catch(err) {
    res.status(500).json({ error: err.message, prices: {} });
  }
});

app.get('/', (req, res) => {
  res.json({ 
    status: 'MarketEdge Price Server v3.0',
    endpoints: {
      '/prices': 'Get all 17 portfolio prices',
      '/quote?tickers=SUNPHARMA,HDFCBANK': 'Get prices for any NSE/BSE stocks'
    }
  });
});

app.listen(PORT, () => console.log(`Server v3.0 on port ${PORT}`));
