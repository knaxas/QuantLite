'use strict';

const textParse = async r => { if (!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status); return r.text(); };
const enc = encodeURIComponent;

const OWN_PROXY = QL_CONFIG.proxyUrl
  ? {name: 'eigener Worker', build: u => `${QL_CONFIG.proxyUrl.replace(/\/+$/, '')}/?url=${enc(u)}`, parse: textParse}
  : null;

const LOCAL_PROXY = {name: 'lokal (start.py)', build: u => `/proxy?url=${enc(u)}`, parse: textParse};
const IS_LOCALHOST = /^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const localProxyReady = IS_LOCALHOST
  ? fetch('/proxy?url=', {cache: 'no-store'}).then(r => r.status === 403).catch(() => false)
  : Promise.resolve(false);

const PUBLIC_PROXIES = [
  { name: 'allorigins', build: u => `https://api.allorigins.win/get?url=${enc(u)}`,
    parse: async r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      let c = j.contents;
      if (!c) throw new Error('leer (HTTP ' + (j.status?.http_code ?? '?') + ')');
      if (c.startsWith('data:')) {
        const b = atob(c.split(',')[1] || '');
        c = new TextDecoder().decode(Uint8Array.from(b, ch => ch.charCodeAt(0)));
      }
      return c;
    } },
  { name: 'codetabs',       build: u => `https://api.codetabs.com/v1/proxy/?quest=${enc(u)}`, parse: textParse },
  { name: 'allorigins-raw', build: u => `https://api.allorigins.win/raw?url=${enc(u)}`, parse: textParse },
  { name: 'cors.lol',       build: u => `https://api.cors.lol/?url=${enc(u)}`, parse: textParse },
];

let preferredPublic = store.get('ql_proxy_name', null);
const cache = new Map();
const inflight = new Map();
const proxyDownUntil = {};

async function proxyChain(){
  const now = Date.now();
  const pub = [...PUBLIC_PROXIES].sort((a, b) =>
    ((proxyDownUntil[a.name] > now) - (proxyDownUntil[b.name] > now)) ||
    ((b.name === preferredPublic) - (a.name === preferredPublic)));
  return [
    ...(OWN_PROXY ? [OWN_PROXY] : []),
    ...(await localProxyReady ? [LOCAL_PROXY] : []),
    ...pub
  ];
}

function setProxyStatus(name, status){
  $('#proxyName').textContent = name;
  $('#proxyDot').className = 'dot ' + status;
}

async function proxyFetch(url, {timeout = 9000, validate = () => true, ttl = 0} = {}){
  if (ttl) {
    const c = cache.get(url);
    if (c && Date.now() - c.t < ttl) return c.txt;
  }
  if (inflight.has(url)) return inflight.get(url);

  const p = (async () => {
    let lastErr;
    for (const px of await proxyChain()) {
      const isPublic = PUBLIC_PROXIES.includes(px);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), isPublic ? timeout : timeout + 6000);
      try {
        const r = await fetch(px.build(url), {signal: ctrl.signal, cache: 'no-store'});
        const txt = await px.parse(r);
        if (!txt || !txt.trim()) throw new Error('leere Antwort');
        if (!validate(txt)) throw new Error('ungültige Antwort');
        if (isPublic && preferredPublic !== px.name) { preferredPublic = px.name; store.set('ql_proxy_name', px.name); }
        delete proxyDownUntil[px.name];
        setProxyStatus(px.name, 'ok');
        if (ttl) cache.set(url, {t: Date.now(), txt});
        return txt;
      } catch (e) {
        lastErr = e.name === 'AbortError' ? new Error(`${px.name}: Timeout`) : new Error(`${px.name}: ${e.message}`);
        if (isPublic) proxyDownUntil[px.name] = Date.now() + 120000;
        setProxyStatus(px.name, 'warn');
      } finally { clearTimeout(timer); }
    }
    setProxyStatus(OWN_PROXY ? 'nicht erreichbar' : 'kein eigener Proxy konfiguriert', 'off');
    throw new Error('Kein Proxy erreichbar (' + (lastErr?.message || '?') + ')');
  })();

  inflight.set(url, p);
  try { return await p; } finally { inflight.delete(url); }
}
