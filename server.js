const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Allow requests from your GitHub Pages site
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// NSE ticker → Yahoo Finance symbol mapping
const SYMBOLS = {
  HYUNDAI:     'HYUNDAIMOTOR.NS',
  TATAGOLD:    'TATAGOLD.NS',
  SWANDEFENCE: 'SWANDEFENCE.NS',
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

// GET /prices — returns all stock prices
app.get('/prices', async (req, res) => {
  try {
    const symbols = Object.values(SYMBOLS).join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,symbol`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      // Try query2
      const url2 = url.replace('query1', 'query2');
      const r2 = await fetch(url2, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r2.ok) throw new Error(`Yahoo returned ${response.status}`);
      const d2 = await r2.json();
      return sendPrices(d2, res);
    }

    const data = await response.json();
    sendPrices(data, res);

  } catch (err) {
    res.status(500).json({ error: err.message, prices: {} });
  }
});

function sendPrices(data, res) {
  const results = data?.quoteResponse?.result || [];
  const reverseMap = {};
  Object.entries(SYMBOLS).forEach(([k, v]) => reverseMap[v] = k);

  const prices = {};
  results.forEach(q => {
    const key = reverseMap[q.symbol];
    if (key && q.regularMarketPrice) {
      prices[key] = parseFloat(q.regularMarketPrice.toFixed(2));
    }
  });

  res.json({
    prices,
    updated: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    count: Object.keys(prices).length
  });
}

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'MarketEdge Price Server running', version: '1.0' });
});

app.listen(PORT, () => {
  console.log(`Price server running on port ${PORT}`);
});
