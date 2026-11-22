'use strict';

async function fetchYahooChart(sym, range, interval, ttl = 30000){
  const path = `/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}&includePrePost=false`;
  let lastErr;
  for (const host of ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']) {
    try {
      const txt = await proxyFetch(host + path, {validate: isJson, ttl});
      const j = JSON.parse(txt);
      const res = j?.chart?.result?.[0];
      if (!res || !res.meta) {
        const err = new Error(j?.chart?.error?.description || 'Keine Kursdaten');
        err.notFound = true; throw err;
      }
      return res;
    } catch (e) { lastErr = e; if (e.notFound) break; }
  }
  throw lastErr;
}

function parseQuote(res){
  const m = res.meta;
  const price = m.regularMarketPrice;
  const prev = m.previousClose ?? m.chartPreviousClose;
  return {
    price, prev,
    change: price - prev,
    pct: prev ? (price - prev) / prev * 100 : 0,
    currency: m.currency,
    name: m.longName || m.shortName,
    exchange: m.fullExchangeName || m.exchangeName,
    high: m.regularMarketDayHigh, low: m.regularMarketDayLow, vol: m.regularMarketVolume,
    h52: m.fiftyTwoWeekHigh, l52: m.fiftyTwoWeekLow,
    time: m.regularMarketTime, type: m.instrumentType
  };
}

async function fetchScreener(id, count = 6){
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${id}&count=${count}`;
  const txt = await proxyFetch(url, {validate: isJson, ttl: 120000});
  const quotes = JSON.parse(txt)?.finance?.result?.[0]?.quotes || [];
  return quotes.filter(q => q.symbol && q.regularMarketPrice != null).map(q => ({
    symbol: q.symbol,
    name: q.longName || q.shortName || q.symbol,
    price: q.regularMarketPrice,
    pct: q.regularMarketChangePercent,
    currency: q.currency
  }));
}

async function searchSymbol(q){
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&lang=de-DE&region=DE`;
  const txt = await proxyFetch(url, {validate: isJson, ttl: 600000});
  const j = JSON.parse(txt);
  return (j.quotes || []).filter(x => x.symbol && ['EQUITY', 'ETF', 'INDEX', 'CRYPTOCURRENCY', 'CURRENCY', 'MUTUALFUND', 'FUTURE'].includes(x.quoteType));
}
