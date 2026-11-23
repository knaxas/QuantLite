'use strict';

const TARGET_MONTHS = 6;
const MARKET_DRIFT = 0.07;
const TREND_PRIOR_SD = 0.05;
const MOMENTUM_PREMIUM = 0.03;
const SENTIMENT_TILT = 0.04;
const MAX_DRIFT = 0.40;
const EWMA_LAMBDA = 0.97;

const MODEL_STATS = {cases: 1888, direction: 64, inRange: 69};

const fetchHistory = sym => fetchYahooChart(sym, '2y', '1d', 3600000);

function computePriceTarget(hist, currentPrice, score = 0, confidence = 50){
  const raw = hist.indicators?.adjclose?.[0]?.adjclose || hist.indicators?.quote?.[0]?.close || [];
  const closes = raw.filter(v => v != null && v > 0);
  if (closes.length < 60) throw new Error('Zu wenig Kurshistorie für ein Kursziel');

  const rets = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
  const muHist = mean * 252;
  const sigmaLong = sd * Math.sqrt(252);

  let variance = rets[0] ** 2;
  for (const r of rets.slice(1)) variance = EWMA_LAMBDA * variance + (1 - EWMA_LAMBDA) * r * r;
  const sigmaRecent = Math.sqrt(variance * 252);
  const sigma = 0.5 * sigmaLong + 0.5 * sigmaRecent;

  const years = rets.length / 252;
  const standardError = sigmaLong / Math.sqrt(years);
  const trendWeight = TREND_PRIOR_SD ** 2 / (TREND_PRIOR_SD ** 2 + standardError ** 2);
  const trend = trendWeight * (muHist - MARKET_DRIFT);

  let momentum = 0, momentumReturn = null;
  if (closes.length >= 253) {
    momentumReturn = Math.log(closes[closes.length - 22] / closes[closes.length - 253]);
    momentum = MOMENTUM_PREMIUM * clamp(momentumReturn / Math.max(sigmaLong, 0.05), -2, 2);
  }

  const sentiment = (score / 100) * SENTIMENT_TILT * clamp(confidence / 100, 0, 1);
  const mu = clamp(MARKET_DRIFT + trend + momentum + sentiment, -MAX_DRIFT, MAX_DRIFT);

  const t = TARGET_MONTHS / 12;
  const price = currentPrice ?? hist.meta?.regularMarketPrice ?? closes[closes.length - 1];
  const target = price * Math.exp(mu * t);
  const low = price * Math.exp(mu * t - sigma * Math.sqrt(t));
  const high = price * Math.exp(mu * t + sigma * Math.sqrt(t));

  const date = new Date();
  date.setMonth(date.getMonth() + TARGET_MONTHS);

  const toPct = x => (Math.exp(x * t) - 1) * 100;
  return {
    price, target, low, high,
    upside: (target / price - 1) * 100,
    muHist, sigma, trendWeight, momentumReturn,
    drivers: [
      {key: 'market', label: 'Marktdurchschnitt', pct: toPct(MARKET_DRIFT)},
      {key: 'trend', label: 'Eigener Trend (gedämpft)', pct: toPct(trend)},
      {key: 'momentum', label: '12-Monats-Momentum', pct: toPct(momentum)},
      {key: 'sentiment', label: 'Nachrichtenlage', pct: toPct(sentiment)}
    ],
    currency: hist.meta?.currency || '',
    date
  };
}
