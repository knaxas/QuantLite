const ALLOWED_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com', 'news.google.com', 'www.bing.com'];

const ALLOWED_ORIGINS = [];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const VAPID_SUBJECT = 'https://knaxas.github.io/QuantLite/';
const MOVE_THRESHOLD = 5;
const MAX_PENDING = 20;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowOrigin = ALLOWED_ORIGINS.length ? (ALLOWED_ORIGINS.includes(origin) ? origin : 'null') : '*';
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') return new Response(null, {headers: cors});

    const path = new URL(request.url).pathname;
    if (path.startsWith('/push/')) return handlePush(path, request, env, cors);

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
  },

  async scheduled(event, env, ctx) {
    if (env.QL_KV) ctx.waitUntil(checkAlerts(env));
  }
};

const json = (data, cors, status = 200) =>
  new Response(JSON.stringify(data), {status, headers: {...cors, 'Content-Type': 'application/json'}});

async function handlePush(path, request, env, cors) {
  if (!env.QL_KV) return json({error: 'KV-Speicher QL_KV ist nicht verbunden'}, cors, 501);
  try {
    if (path === '/push/key') return json({publicKey: (await vapidKeys(env)).pub}, cors);
    if (request.method !== 'POST') return json({error: 'Nur POST erlaubt'}, cors, 405);
    const body = await request.json();
    const endpoint = body.subscription?.endpoint || body.endpoint;
    if (!endpoint || !/^https:\/\//.test(endpoint)) return json({error: 'endpoint fehlt'}, cors, 400);
    const key = 'sub:' + await sha256(endpoint);

    if (path === '/push/save') {
      const old = await env.QL_KV.get(key, 'json') || {};
      const record = {
        subscription: body.subscription,
        alerts: sanitizeAlerts(body.alerts),
        general: !!body.general,
        symbols: (body.symbols || []).filter(s => typeof s === 'string').slice(0, 60),
        pending: old.pending || [],
        moves: old.moves || {}
      };
      await env.QL_KV.put(key, JSON.stringify(record));
      return json({ok: true}, cors);
    }
    if (path === '/push/state') {
      const rec = await env.QL_KV.get(key, 'json');
      return json(rec ? {alerts: rec.alerts, general: rec.general, known: true} : {known: false}, cors);
    }
    if (path === '/push/pending') {
      const rec = await env.QL_KV.get(key, 'json');
      if (!rec) return json({messages: []}, cors);
      const messages = rec.pending || [];
      if (messages.length) { rec.pending = []; await env.QL_KV.put(key, JSON.stringify(rec)); }
      return json({messages}, cors);
    }
    if (path === '/push/test') {
      const rec = await env.QL_KV.get(key, 'json');
      if (!rec) return json({error: 'Nicht angemeldet'}, cors, 404);
      rec.pending = [...(rec.pending || []), {title: 'QuantLite', body: 'Benachrichtigungen funktionieren.', url: ''}].slice(-MAX_PENDING);
      await env.QL_KV.put(key, JSON.stringify(rec));
      const status = await sendPush(env, rec.subscription);
      return json({ok: status < 300, status}, cors);
    }
    if (path === '/push/remove') {
      await env.QL_KV.delete(key);
      return json({ok: true}, cors);
    }
    return json({error: 'Unbekannt'}, cors, 404);
  } catch (e) {
    return json({error: e.message}, cors, 500);
  }
}

function sanitizeAlerts(list) {
  return (Array.isArray(list) ? list : []).slice(0, 50).filter(a =>
    a && typeof a.symbol === 'string' && ['above', 'below'].includes(a.op) && Number.isFinite(+a.price) && +a.price > 0
  ).map(a => ({id: String(a.id || crypto.randomUUID()), symbol: a.symbol, name: String(a.name || a.symbol).slice(0, 80), op: a.op, price: +a.price}));
}

async function checkAlerts(env) {
  const keys = [];
  let cursor;
  do {
    const page = await env.QL_KV.list({prefix: 'sub:', cursor});
    keys.push(...page.keys.map(k => k.name));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  if (!keys.length) return;

  const records = (await Promise.all(keys.map(async k => [k, await env.QL_KV.get(k, 'json')]))).filter(([, r]) => r);
  const symbols = new Set();
  for (const [, r] of records) {
    r.alerts.forEach(a => symbols.add(a.symbol));
    if (r.general) r.symbols.forEach(s => symbols.add(s));
  }
  if (!symbols.size) return;

  const quotes = {};
  await Promise.all([...symbols].map(async s => { quotes[s] = await yahooQuote(s); }));
  const fx = {};
  for (const q of Object.values(quotes)) if (q && !(q.currency in fx)) fx[q.currency] = await toEur(q.currency);

  const today = new Date().toISOString().slice(0, 10);
  const eur = v => new Intl.NumberFormat('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(v) + ' €';

  for (const [key, rec] of records) {
    const messages = [];
    const remaining = [];
    for (const a of rec.alerts) {
      const q = quotes[a.symbol];
      const rate = q ? fx[q.currency] : null;
      if (!q || !rate) { remaining.push(a); continue; }
      const priceEur = q.price * rate;
      const hit = a.op === 'above' ? priceEur >= a.price : priceEur <= a.price;
      if (!hit) { remaining.push(a); continue; }
      messages.push({
        title: `${a.name} ${a.op === 'above' ? 'über' : 'unter'} ${eur(a.price)}`,
        body: `Aktueller Kurs: ${eur(priceEur)}${q.currency !== 'EUR' ? ` (${q.price.toFixed(2)} ${q.currency})` : ''}`,
        url: 'watchlist/' + encodeURIComponent(a.symbol.toLowerCase())
      });
    }
    if (rec.general) {
      rec.moves = Object.fromEntries(Object.entries(rec.moves || {}).filter(([, d]) => d === today));
      for (const s of rec.symbols) {
        const q = quotes[s];
        if (!q || !q.prev || rec.moves[s] === today) continue;
        const pct = (q.price - q.prev) / q.prev * 100;
        if (Math.abs(pct) < MOVE_THRESHOLD) continue;
        rec.moves[s] = today;
        messages.push({
          title: `${q.name || s} ${pct > 0 ? 'steigt' : 'fällt'} um ${Math.abs(pct).toFixed(1).replace('.', ',')} %`,
          body: `Kurs heute: ${q.price.toFixed(2)} ${q.currency}`,
          url: 'watchlist/' + encodeURIComponent(s.toLowerCase())
        });
      }
    }
    if (!messages.length) continue;
    rec.alerts = remaining;
    rec.pending = [...(rec.pending || []), ...messages].slice(-MAX_PENDING);
    const status = await sendPush(env, rec.subscription);
    if (status === 404 || status === 410) await env.QL_KV.delete(key);
    else await env.QL_KV.put(key, JSON.stringify(rec));
  }
}

async function yahooQuote(symbol) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=15m`, {headers: {'User-Agent': UA}});
    const m = (await r.json())?.chart?.result?.[0]?.meta;
    if (!m?.regularMarketPrice) return null;
    return {price: m.regularMarketPrice, prev: m.previousClose ?? m.chartPreviousClose, currency: m.currency || 'EUR', name: m.shortName || m.longName};
  } catch {
    return null;
  }
}

async function toEur(currency) {
  if (!currency || currency === 'EUR') return 1;
  if (currency === 'GBp' || currency === 'GBX') return (await toEur('GBP')) / 100;
  const q = await yahooQuote(`EUR${currency}=X`);
  return q?.price ? 1 / q.price : null;
}

async function vapidKeys(env) {
  let keys = await env.QL_KV.get('vapid', 'json');
  if (!keys) {
    const pair = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
    keys = {
      priv: await crypto.subtle.exportKey('jwk', pair.privateKey),
      pub: b64url(await crypto.subtle.exportKey('raw', pair.publicKey))
    };
    await env.QL_KV.put('vapid', JSON.stringify(keys));
  }
  return keys;
}

async function sendPush(env, subscription) {
  const keys = await vapidKeys(env);
  const enc = s => b64url(new TextEncoder().encode(JSON.stringify(s)));
  const unsigned = enc({typ: 'JWT', alg: 'ES256'}) + '.' + enc({
    aud: new URL(subscription.endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: VAPID_SUBJECT
  });
  const key = await crypto.subtle.importKey('jwk', keys.priv, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  const sig = await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, key, new TextEncoder().encode(unsigned));
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {TTL: '86400', Urgency: 'high', 'Content-Length': '0', Authorization: `vapid t=${unsigned}.${b64url(sig)}, k=${keys.pub}`},
    body: ''
  });
  return res.status;
}

function b64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}
