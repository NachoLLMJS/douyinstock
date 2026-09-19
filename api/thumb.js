module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=21600');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

  try {
    const srcUrl = String(req.query?.url || '').trim();
    if (!srcUrl || !/^https?:\/\//i.test(srcUrl)) {
      res.status(400).json({ error: 'valid url required' });
      return;
    }

    const imgResp = await fetch(srcUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': 'https://www.tiktok.com/',
      },
    });

    if (!imgResp.ok) {
      res.status(imgResp.status).json({ error: 'Could not fetch image: ' + imgResp.status });
      return;
    }

    const ct = imgResp.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await imgResp.arrayBuffer());
    res.setHeader('Content-Type', ct);
    res.status(200).send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message || 'thumb proxy error' });
  }
};
