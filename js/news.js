'use strict';

const MAX_ARTICLE_AGE_DAYS = 180;

function cleanCompanyName(name, sym){
  const base = sym.split('.')[0].replace(/^\^/, '');
  const n = (name || '').replace(/\(.*?\)/g, ' ')
    .replace(/\b(incorporated|inc|corporation|corp|company|co|ltd|limited|plc|ag|se|kgaa|gmbh|n\.?v|s\.?a|s\.?p\.?a|holdings?|group|class [a-z]|the|& co)\b\.?/gi, ' ')
    .replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
  return n.length >= 2 ? n : base;
}

const FUND_RE = /\b(ETF|ETC|UCITS|MSCI|S&P|FTSE|STOXX|NASDAQ[- ]100|Index|Acc|Dist)\b/i;

function isFund(name, sym){
  return state.quotes[sym]?.type === 'ETF' || FUND_RE.test(name || '');
}

function fundTopic(name){
  const t = (name || '').replace(/\(.*?\)/g, ' ')
    .replace(/\b(iShares|Xtrackers|Vanguard|Amundi|SPDR|Lyxor|Invesco|WisdomTree|VanEck|HSBC|UBS|Core|Prime|UCITS|ETF|ETC|USD|EUR|Acc|Dist|Inc|Fund|Trust|Shares|plc)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return t.length >= 3 ? t : name;
}

function newsQueries(name, sym){
  if (isCryptoSymbol(sym)) {
    const coin = (name || sym).replace(/\b(EUR|USD|USDT)\b/gi, '').trim() || sym.split('-')[0];
    return {de: [`"${coin}" Kurs Krypto`, `${coin} Kurs`], en: [`"${coin}" crypto price`, `${coin} crypto`]};
  }
  if (isFund(name, sym)) {
    const topic = fundTopic(name);
    return {de: [`"${topic}" ETF`, `${topic} ETF`, topic], en: [`"${topic}" ETF`, `${topic} ETF`]};
  }
  const clean = cleanCompanyName(name, sym);
  return {
    de: [`"${clean}" Aktie`, `${clean.replace(/\s+/g, ' ')}-Aktie`, `${clean} Börse`],
    en: [`"${clean}" stock`, `${clean} stock`, `${clean} shares`]
  };
}

async function fetchNews(queries, lang){
  const list = Array.isArray(queries) ? queries : [queries];
  let best = [];
  for (const q of list) {
    try {
      const items = await fetchBingNews(q, lang);
      if (items.length > best.length) best = items;
      if (best.length >= 5) return best;
    } catch {}
  }
  if (best.length || QL_CONFIG.proxyUrl) return best;
  return fetchGoogleNews(list[0], lang);
}

function realBingLink(link){
  try { return new URL(link).searchParams.get('url') || link; } catch { return link; }
}

async function fetchBingNews(query, lang){
  const cfg = lang === 'de' ? 'setlang=de-DE&cc=DE' : 'setlang=en-US&cc=US';
  const url = `https://www.bing.com/news/search?format=rss&${cfg}&q=${encodeURIComponent(query)}`;
  const xml = await proxyFetch(url, {timeout: 13000, ttl: 300000, validate: t => /<rss|<channel/i.test(t)});
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('RSS-Parse-Fehler');

  return [...doc.getElementsByTagName('item')].map(it => {
    const text = tag => it.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
    const title = text('title');
    let desc = text('description').replace(/\s+/g, ' ');
    if (desc.toLowerCase().includes(title.toLowerCase().slice(0, 40))) desc = '';
    return {
      title,
      source: text('News:Source') || (it.getElementsByTagNameNS('*', 'Source')[0]?.textContent?.trim() || ''),
      desc,
      link: realBingLink(text('link')),
      date: new Date(text('pubDate')),
      lang
    };
  }).filter(a => a.title);
}

async function fetchGoogleNews(query, lang){
  const cfg = lang === 'de' ? 'hl=de&gl=DE&ceid=DE:de' : 'hl=en-US&gl=US&ceid=US:en';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${cfg}`;
  const xml = await proxyFetch(url, {timeout: 13000, ttl: 300000, validate: t => /<rss|<channel/i.test(t)});
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('RSS-Parse-Fehler');

  return [...doc.querySelectorAll('item')].map(it => {
    const source = it.querySelector('source')?.textContent?.trim() || '';
    let title = it.querySelector('title')?.textContent?.trim() || '';
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
    const descHtml = it.querySelector('description')?.textContent || '';
    let desc = new DOMParser().parseFromString(descHtml, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
    if (!desc || desc.toLowerCase().includes(title.toLowerCase().slice(0, 40))) desc = '';
    const pub = new Date(it.querySelector('pubDate')?.textContent || '');
    return {title, source, desc, link: it.querySelector('link')?.textContent?.trim() || '', date: pub, lang};
  }).filter(a => a.title);
}

function dedupeArticles(all){
  const maxAge = Date.now() - MAX_ARTICLE_AGE_DAYS * 86400000;
  const seen = new Set(), articles = [];
  for (const a of all) {
    if (!isNaN(a.date) && a.date.getTime() < maxAge) continue;
    const key = a.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 70);
    if (seen.has(key)) continue;
    seen.add(key); articles.push(a);
  }
  articles.sort((a, b) => (b.date || 0) - (a.date || 0));
  return {articles, removed: all.length - articles.length};
}
