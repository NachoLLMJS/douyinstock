const ALLOWED_INTERVALS = new Set(['15m', '1h', '4h', '1d']);

async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'ZFUN-ZEC-Market/1.0' },
    });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const interval = ALLOWED_INTERVALS.has(String(req.query?.interval)) ? String(req.query.interval) : '1h';
  const limit = Math.min(500, Math.max(24, Number(req.query?.limit) || 168));
  const urls = [
    `https://api.binance.com/api/v3/klines?symbol=ZECUSDT&interval=${interval}&limit=${limit}`,
    `https://api.binance.us/api/v3/klines?symbol=ZECUSDT&interval=${interval}&limit=${limit}`,
  ];

  try {
    let rows = null;
    for (const url of urls) {
      try {
        const response = await fetchWithTimeout(url);
        const candidate = await response.json().catch(() => null);
        if (response.ok && Array.isArray(candidate)) {
          rows = candidate;
          break;
        }
      } catch (_) {
        // Try Binance's second public endpoint when a region blocks the first.
      }
    }
    if (!rows) return res.status(502).json({ error: 'Binance market data is unavailable.' });
    const candles = rows.map(row => ({
      time: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    })).filter(item => Number.isFinite(item.time) && Number.isFinite(item.close));
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
    return res.status(200).json({ symbol: 'ZECUSDT', interval, source: 'Binance public market data', candles });
  } catch (error) {
    return res.status(502).json({ error: 'Binance market data is unavailable.', detail: error.message });
  }
};
