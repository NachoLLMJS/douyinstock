const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const OFFICIAL_HOT_URL = 'https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web';

async function fetchJson(url, opts = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json,text/plain,*/*',
        Referer: 'https://www.douyin.com/',
        ...(opts.headers || {}),
      },
    });
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { resp, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstUrl(value) {
  const urls = value?.url_list;
  if (!Array.isArray(urls)) return '';
  // Some p3 / p5-ex image edges intermittently reject server-side requests.
  // Prefer the stable signed mirrors included by Douyin in the same payload.
  const preferred = urls.find((url) => String(url).includes('p26-sign.'))
    || urls.find((url) => String(url).includes('p11-sign.'))
    || urls.find(Boolean);
  return safeText(preferred);
}

function mapOfficialHotWord(item, index) {
  const id = safeText(String(item.group_id || ''));
  const title = safeText(item.word) || `Douyin trend #${index + 1}`;
  const sentenceId = safeText(String(item.sentence_id || ''));
  return {
    rank: Number(item.position || index + 1),
    id,
    title,
    views: Number(item.hot_value || 0),
    likes: 0,
    comments: 0,
    shares: 0,
    duration: 0,
    author: 'Douyin Hot Board',
    username: 'douyin',
    region: 'CN',
    thumbnail: firstUrl(item.word_cover),
    videoUrl: id ? `https://open.douyin.com/player/video?vid=${encodeURIComponent(id)}&autoplay=0` : '',
    shareUrl: sentenceId
      ? `https://www.douyin.com/hot/${encodeURIComponent(sentenceId)}`
      : `https://www.douyin.com/search/${encodeURIComponent(title)}`,
    source: 'official-douyin-hot',
    playback: 'embed',
    videoCount: Number(item.video_count || 0),
  };
}

async function fetchOfficialDouyin(count) {
  const { resp, json, text } = await fetchJson(OFFICIAL_HOT_URL);
  if (!resp.ok) throw new Error(`Douyin hot board ${resp.status}`);
  const words = json?.data?.word_list;
  if (!Array.isArray(words) || !words.length) {
    throw new Error(safeText(json?.status_msg) || text.slice(0, 120) || 'Douyin hot board returned no items');
  }
  return words
    .map(mapOfficialHotWord)
    .filter((item) => item.id && item.title && item.thumbnail)
    .slice(0, count)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function mapTikwmVideo(video, rank) {
  const id = safeText(String(video.video_id || video.aweme_id || rank));
  const username = safeText(video.author?.unique_id || video.author?.id || '');
  const videoUrl = safeText(video.play || video.wmplay || '');
  return {
    rank,
    id,
    title: safeText(video.title || video.desc) || `Video #${rank}`,
    views: Number(video.play_count || 0),
    likes: Number(video.digg_count || 0),
    comments: Number(video.comment_count || 0),
    shares: Number(video.share_count || 0),
    duration: Number(video.duration || 0),
    author: safeText(video.author?.nickname || username) || 'Unknown',
    username,
    region: safeText(video.region),
    thumbnail: safeText(video.origin_cover || video.cover || video.ai_dynamic_cover),
    videoUrl,
    shareUrl: username
      ? `https://www.tiktok.com/@${username}/video/${id}`
      : `https://www.tiktok.com/video/${id}`,
    source: 'tiktok-fallback',
    playback: 'proxy-video',
  };
}

async function fetchTikwmFallback(count) {
  const urls = [
    'https://www.tikwm.com/api/feed/list?region=US&count=30',
    'https://www.tikwm.com/api/feed/list?region=JP&count=30',
    'https://www.tikwm.com/api/feed/list?region=KR&count=30',
  ];
  const batches = await Promise.allSettled(urls.map((url) => fetchJson(url)));
  const seen = new Set();
  const items = [];
  for (const batch of batches) {
    if (batch.status !== 'fulfilled') continue;
    const data = batch.value.json?.data;
    const videos = Array.isArray(data) ? data : (Array.isArray(data?.videos) ? data.videos : []);
    for (const video of videos) {
      const id = String(video.video_id || video.aweme_id || '');
      if (!id || seen.has(id) || video.is_ad) continue;
      const mapped = mapTikwmVideo(video, items.length + 1);
      if (!mapped.thumbnail || !mapped.videoUrl || !mapped.duration) continue;
      seen.add(id);
      items.push(mapped);
    }
  }
  items.sort((a, b) => b.views - a.views);
  return items.slice(0, count).map((item, index) => ({ ...item, rank: index + 1 }));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!['GET', 'POST'].includes(req.method)) {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const requested = Number(req.method === 'GET' ? req.query?.count : req.body?.count);
  const count = Number.isFinite(requested) ? Math.max(1, Math.min(50, Math.floor(requested))) : 30;

  try {
    const trends = await fetchOfficialDouyin(count);
    if (trends.length) {
      res.status(200).json({ ok: true, source: 'official-douyin-hot', trends });
      return;
    }
    throw new Error('Douyin returned no playable trends');
  } catch (officialError) {
    console.warn('[douyin] official source failed:', officialError.message);
    try {
      const trends = await fetchTikwmFallback(count);
      if (!trends.length) throw new Error('Fallback returned no videos');
      res.status(200).json({
        ok: true,
        source: 'tiktok-fallback',
        warning: 'Official Douyin is temporarily unavailable; showing playable fallback videos.',
        trends,
      });
    } catch (fallbackError) {
      console.error('[douyin] all sources failed:', fallbackError.message);
      res.status(503).json({
        ok: false,
        error: 'No video source is currently available.',
        details: [officialError.message, fallbackError.message],
      });
    }
  }
};
