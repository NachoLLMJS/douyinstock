const FLAP_UPLOAD_API = 'https://funcs.flap.sh/api/upload';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const body = req.body || {};
    const action = String(body.action || '');
    if (action === 'quote-auth') {
      const token = String(req.body.token || '');
      if (!/^0x[0-9a-fA-F]{40}$/.test(token) || token.toLowerCase() === ZERO_ADDRESS) {
        return res.status(400).json({ ok: false, error: 'Invalid quote token address' });
      }
      try {
        const url = `https://quotes.taxed.fun/v2/curve-signature?chain_id=56&quote_token=${encodeURIComponent(token)}`;
        const response = await fetchWithTimeout(url, { headers: {
        Accept: 'application/json',
        Origin: 'https://flap.sh',
        Referer: 'https://flap.sh/',
        'User-Agent': 'Mozilla/5.0 ZFUN ZEC Launcher',
      } }, 12000);
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || data.allowed !== true) {
          return res.status(400).json({ ok: false, error: 'This asset is not currently approved by Flap as a quote token' });
        }
        if (!/^\d{1,78}$/.test(String(data.price || '')) || !Number.isSafeInteger(data.deadline) || data.deadline <= Math.floor(Date.now() / 1000) + 10 || !/^0x[0-9a-fA-F]{130}$/.test(String(data.signature || ''))) {
          return res.status(502).json({ ok: false, error: 'Flap returned an invalid or expired quote authorization' });
        }
        return res.status(200).json({ ok: true, price: String(data.price), deadline: data.deadline, signature: data.signature, name: data.name || '', symbol: data.symbol || '' });
      } catch (error) {
        return res.status(502).json({ ok: false, error: 'Flap quote authorization is unavailable', detail: error.message });
      }
    }

    if (action !== 'upload-meta') {
      res.status(400).json({ error: `Unknown action: ${String(body.action || '')}` });
      return;
    }

    const imageBase64 = String(body.imageBase64 || '').trim();
    const mimeType = String(body.mimeType || '').trim().toLowerCase();
    const description = String(body.description || '').trim().slice(0, 2000);
    const creator = String(body.creator || '').trim();
    if (!imageBase64 || !MIME_EXTENSIONS[mimeType]) {
      res.status(400).json({ error: 'A PNG, JPEG, WEBP, or GIF image is required.' });
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(creator)) {
      res.status(400).json({ error: 'A valid creator wallet is required.' });
      return;
    }

    const image = Buffer.from(imageBase64, 'base64');
    if (!image.length || image.length > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: 'Image must be between 1 byte and 5 MB.' });
      return;
    }

    const query = `mutation Create($file: Upload!, $meta: MetadataInput!) {
      create(file: $file, meta: $meta)
    }`;
    const form = new FormData();
    form.append('operations', JSON.stringify({
      query,
      variables: {
        file: null,
        meta: {
          website: body.website ? String(body.website).slice(0, 500) : null,
          twitter: body.twitter ? String(body.twitter).slice(0, 500) : null,
          telegram: body.telegram ? String(body.telegram).slice(0, 500) : null,
          description,
          creator: creator || ZERO_ADDRESS,
        },
      },
    }));
    form.append('map', JSON.stringify({ 0: ['variables.file'] }));
    form.append('0', new Blob([image], { type: mimeType }), `token.${MIME_EXTENSIONS[mimeType]}`);

    const upstream = await fetch(FLAP_UPLOAD_API, {
      method: 'POST',
      body: form,
      headers: { Accept: 'application/json' },
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok || payload.errors?.length) {
      const message = payload.errors?.[0]?.message || payload.message || `Flap upload returned ${upstream.status}`;
      res.status(502).json({ error: message });
      return;
    }

    const cid = payload?.data?.create;
    if (typeof cid !== 'string' || !cid.trim()) {
      res.status(502).json({ error: 'Flap upload did not return a metadata CID.' });
      return;
    }
    res.status(200).json({ ok: true, cid: cid.trim() });
  } catch (error) {
    console.error('[flap]', error.message);
    res.status(500).json({ error: error.message || 'Flap metadata upload failed.' });
  }
};
