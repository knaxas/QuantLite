'use strict';

const TARGET_MONTHS = 6;
const MARKET_DRIFT = 0.07;
const TREND_WEIGHT = 0.5;
const MAX_DRIFT = 0.35;
const SENTIMENT_TILT = 0.10;

const fetchHistory = sym => fetchYahooChart(sym, '2y', '1d', 3600000);

function computePriceTarget(hist, currentPrice, score){
  const raw = hist.indicators?.adjclose?.[0]?.adjclose || hist.indicators?.quote?.[0]?.close || [];
  const closes = raw.filter(v => v != null && v > 0);
  if (closes.length < 60) throw new Error('Zu wenig Kurshistorie für ein Kursziel');

  const rets = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
  const muHist = mean * 252;
  const sigma = sd * Math.sqrt(252);

  const muTrend = clamp(TREND_WEIGHT * muHist + (1 - TREND_WEIGHT) * MARKET_DRIFT, -MAX_DRIFT, MAX_DRIFT);
  const muSent = (score / 100) * SENTIMENT_TILT;
  const mu = muTrend + muSent;

  const t = TARGET_MONTHS / 12;
  const price = currentPrice ?? hist.meta?.regularMarketPrice ?? closes[closes.length - 1];
  const target = price * Math.exp(mu * t);
  const low = price * Math.exp(mu * t - sigma * Math.sqrt(t));
  const high = price * Math.exp(mu * t + sigma * Math.sqrt(t));

  const date = new Date();
  date.setMonth(date.getMonth() + TARGET_MONTHS);

  return {
    price, target, low, high,
    upside: (target / price - 1) * 100,
    muHist, muTrend, muSent, sigma,
    currency: hist.meta?.currency || '',
    date
  };
}
