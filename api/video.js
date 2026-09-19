const ALLOWED_HOSTS = [
  'douyinvod.com',
  'douyin.com',
  'douyincdn.com',
  'bytecdn.cn',
  'byteimg.com',
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tikwm.com',
];

function isAllowedHost(hostname) {
  const host = hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const source = new URL(String(req.query?.url || ''));
    if (source.protocol !== 'https:' || !isAllowedHost(source.hostname)) {
      res.status(400).json({ error: 'Unsupported video host' });
      return;
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      Accept: 'video/*,*/*;q=0.8',
      Referer: source.hostname.includes('tiktok') || source.hostname.includes('tikwm')
        ? 'https://www.tiktok.com/'
        : 'https://www.douyin.com/',
    };
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = await fetch(source, { method: req.method, redirect: 'follow', headers });
    if (![200, 206].includes(upstream.status)) {
      res.status(upstream.status).json({ error: `Video upstream returned ${upstream.status}` });
      return;
    }

    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900');
    res.status(upstream.status);
    if (req.method === 'HEAD') { res.end(); return; }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message || 'video proxy error' });
  }
};
