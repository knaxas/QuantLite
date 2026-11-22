const ALLOWED_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com', 'news.google.com', 'www.bing.com'];

const ALLOWED_ORIGINS = [];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowOrigin = ALLOWED_ORIGINS.length ? (ALLOWED_ORIGINS.includes(origin) ? origin : 'null') : '*';
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') return new Response(null, {headers: cors});
    if (request.method !== 'GET') return new Response('Nur GET erlaubt', {status: 405, headers: cors});

    let target;
    try { target = new URL(new URL(request.url).searchParams.get('url')); }
    catch { return new Response('Parameter ?url= fehlt oder ist ungültig', {status: 400, headers: cors}); }
    if (target.protocol !== 'https:' || !ALLOWED_HOSTS.includes(target.hostname)) {
      return new Response('Host nicht erlaubt', {status: 403, headers: cors});
    }

    const maxAge = target.hostname.includes('finance.yahoo.com') ? 30 : 300;
    const cacheKey = new Request(target.toString());
    const edge = caches.default;
    let res = await edge.match(cacheKey);

    if (!res) {
      const upstream = await fetch(target.toString(), {headers: {'User-Agent': UA, 'Accept': '*/*'}});
      res = new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') || 'text/plain',
          'Cache-Control': `public, max-age=${maxAge}`
        }
      });
      if (upstream.ok) ctx.waitUntil(edge.put(cacheKey, res.clone()));
    }

    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  }
};
