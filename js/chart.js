'use strict';

const RANGE_INT = {'1d': '5m', '5d': '15m', '1mo': '60m', '6mo': '1d', '1y': '1d', '5y': '1wk'};
const TV_INT    = {'1d': '5',  '5d': '15',  '1mo': '60',  '6mo': 'D',  '1y': 'D',  '5y': 'W'};
const RANGE_LABEL = {'1d': 'Heute', '5d': '1 Woche', '1mo': '1 Monat', '6mo': '6 Monate', '1y': '1 Jahr', '5y': '5 Jahre'};
const INTRADAY = ['1d', '5d', '1mo'];

const COLORS = {
  green: '#30D158', red: '#FF453A', blue: '#0A84FF',
  text: 'rgba(235,235,245,0.45)', grid: 'rgba(255,255,255,0.05)', surface: '#18181B'
};

let lineChart = null, lwChart = null, chartToken = 0, tvKey = null;

function fmtChartTime(t, intraday){
  const d = new Date(t * 1000);
  return intraday
    ? d.toLocaleString('de-DE', {weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})
    : d.toLocaleDateString('de-DE', {day: '2-digit', month: 'short', year: 'numeric'});
}

function chartOverlay(html){
  const o = $('#chartOverlay');
  o.hidden = !html;
  o.innerHTML = html || '';
}

function renderChart(){
  setSeg($('#modeSeg'),  b => b.dataset.mode === state.chartMode);
  setSeg($('#rangeSeg'), b => b.dataset.r === state.range);
  const sym = state.selected, mode = state.chartMode;
  $('#lcHost').hidden = mode !== 'line';
  $('#lwHost').hidden = mode !== 'candle';
  $('#tvHost').hidden = mode !== 'tv';
  if (!sym) { chartOverlay('<p>Keine Aktie ausgewählt</p>'); return; }
  chartOverlay('');
  if (mode === 'tv') { state.period = null; renderQuoteHead(); renderTv(sym); }
  else renderSeries(sym, mode);
}

async function loadSeries(sym, range){
  const res = await fetchYahooChart(sym, range, RANGE_INT[range] || '1d', 60000);
  const ts = res.timestamp || [], q = res.indicators?.quote?.[0] || {};
  const off = INTRADAY.includes(range) ? (res.meta.gmtoffset || 0) : 0;
  const candles = [], seen = new Set();
  ts.forEach((t, i) => {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if ([o, h, l, c].some(v => v == null)) return;
    if (seen.has(t)) return; seen.add(t);
    candles.push({t, time: t + off, open: o, high: h, low: l, close: c, volume: q.volume?.[i] || 0});
  });
  if (!candles.length) throw new Error('Keine Kursdaten für diesen Zeitraum');
  const base = range === '1d'
    ? (res.meta.previousClose ?? res.meta.chartPreviousClose ?? candles[0].open)
    : candles[0].close;
  return {candles, base, meta: res.meta};
}

async function renderSeries(sym, mode){
  const token = ++chartToken;
  const range = state.range;
  const host = mode === 'line' ? $('#lcHost') : $('#lwHost');
  host.classList.add('loading');
  const slow = setTimeout(() => { if (token === chartToken && !(mode === 'line' ? lineChart?.view : lwChart)) chartOverlay('<span class="spinner"></span>'); }, 250);
  try {
    const {candles, base} = await loadSeries(sym, range);
    if (token !== chartToken) return;
    const last = candles[candles.length - 1].close;
    const q = state.quotes[sym];
    const ref = q?.ok ? q.price : last;
    state.period = {sym, range, base, change: ref - base, pct: base ? (ref - base) / base * 100 : 0};
    renderQuoteHead();

    if (mode === 'line') drawLine(candles, base, range);
    else drawCandles(candles, range);
    chartOverlay('');
  } catch (e) {
    if (token !== chartToken) return;
    chartOverlay(`<div><p>Kursverlauf nicht verfügbar</p><small>${esc(e.message)}</small><button class="text-btn" data-retry-chart>Erneut versuchen</button></div>`);
  } finally {
    clearTimeout(slow);
    if (token === chartToken) host.classList.remove('loading');
  }
}

function drawLine(candles, base, range){
  if (!lineChart) {
    lineChart = new AnimatedLineChart($('#lcHost'), {
      formatTime: t => fmtChartTime(t, INTRADAY.includes(state.range)),
      onHover: (p) => showHoverQuote(p.v, state.period?.base ?? p.v, p.t),
      onLeave: () => renderQuoteHead()
    });
  }
  const last = candles[candles.length - 1].close;
  lineChart.setData(candles.map(c => ({t: c.t, v: c.close})), {
    color: last >= base ? COLORS.green : COLORS.red,
    baseline: range === '1d' ? base : null
  });
}

function drawCandles(candles, range){
  if (!window.LightweightCharts) { chartOverlay('<p>Chart-Bibliothek konnte nicht geladen werden.</p>'); return; }
  if (lwChart) { lwChart.remove(); lwChart = null; }
  const host = $('#lwHost'); host.innerHTML = '';
  lwChart = LightweightCharts.createChart(host, {
    autoSize: true,
    layout: {background: {type: 'solid', color: COLORS.surface}, textColor: COLORS.text, fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 11},
    grid: {vertLines: {visible: false}, horzLines: {color: COLORS.grid}},
    rightPriceScale: {borderVisible: false},
    timeScale: {borderVisible: false, timeVisible: INTRADAY.includes(range), secondsVisible: false},
    crosshair: {
      mode: 1,
      vertLine: {color: 'rgba(255,255,255,0.2)', labelBackgroundColor: '#3A3A3E'},
      horzLine: {color: 'rgba(255,255,255,0.2)', labelBackgroundColor: '#3A3A3E'}
    },
    localization: {locale: 'de-DE', priceFormatter: p => fmtPx(p)}
  });
  const cs = lwChart.addCandlestickSeries({upColor: COLORS.green, downColor: COLORS.red, borderVisible: false, wickUpColor: COLORS.green, wickDownColor: COLORS.red});
  cs.setData(candles.map(c => ({time: c.time, open: c.open, high: c.high, low: c.low, close: c.close})));
  const vs = lwChart.addHistogramSeries({priceFormat: {type: 'volume'}, priceScaleId: ''});
  vs.priceScale().applyOptions({scaleMargins: {top: 0.85, bottom: 0}});
  vs.setData(candles.map(c => ({time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(48,209,88,.25)' : 'rgba(255,69,58,.25)'})));
  lwChart.timeScale().fitContent();
}

const TV_EXCH = {DE: 'XETR', F: 'FWB', L: 'LSE', PA: 'EURONEXT', AS: 'EURONEXT', BR: 'EURONEXT', LS: 'EURONEXT', MI: 'MIL', MC: 'BME', SW: 'SIX',
  VI: 'VIE', ST: 'OMXSTO', CO: 'OMXCOP', HE: 'OMXHEX', OL: 'OSL', TO: 'TSX', V: 'TSXV', HK: 'HKEX', T: 'TSE', AX: 'ASX', KS: 'KRX', NS: 'NSE', BO: 'BSE'};
const TV_SPECIAL = {'^GSPC': 'SP:SPX', '^IXIC': 'NASDAQ:IXIC', '^DJI': 'DJ:DJI', '^GDAXI': 'XETR:DAX', '^NDX': 'NASDAQ:NDX', 'GC=F': 'COMEX:GC1!', 'CL=F': 'NYMEX:CL1!'};

function tvSymbol(sym){
  if (TV_SPECIAL[sym]) return TV_SPECIAL[sym];
  if (sym.endsWith('=X')) return 'FX:' + sym.replace('=X', '');
  if (/-USD$|-EUR$/.test(sym)) return 'COINBASE:' + sym.replace('-', '');
  const m = sym.match(/^(.+)\.([A-Z]{1,2})$/);
  if (m && TV_EXCH[m[2]]) {
    let base = m[1].replace(/-/g, '.');
    if (m[2] === 'HK') base = base.replace(/^0+/, '');
    return TV_EXCH[m[2]] + ':' + base;
  }
  return sym.replace(/-/g, '.');
}

let tvLoading = null;
function loadTvScript(){
  if (window.TradingView) return Promise.resolve();
  if (tvLoading) return tvLoading;
  tvLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/tv.js';
    s.onload = res;
    s.onerror = () => { tvLoading = null; rej(new Error('TradingView-Script blockiert')); };
    document.head.appendChild(s);
  });
  return tvLoading;
}

async function renderTv(sym){
  const key = sym + '|' + state.range;
  if (tvKey === key && $('#tvHost').childElementCount) return;
  tvKey = key;
  const host = $('#tvHost');
  host.innerHTML = '';
  chartOverlay('<span class="spinner"></span>');
  try {
    await loadTvScript();
    if (tvKey !== key) return;
    const id = 'tv_' + Date.now();
    host.innerHTML = `<div id="${id}" style="height:100%"></div>`;
    new TradingView.widget({
      autosize: true, symbol: tvSymbol(sym), interval: TV_INT[state.range] || 'D', timezone: 'Europe/Berlin',
      theme: 'dark', style: '3', locale: 'de_DE', backgroundColor: COLORS.surface, gridColor: 'rgba(255,255,255,0.04)',
      enable_publishing: false, allow_symbol_change: false, hide_side_toolbar: true, hide_top_toolbar: false,
      withdateranges: false, container_id: id
    });
    chartOverlay('');
  } catch (e) {
    chartOverlay('');
    toast('TradingView nicht erreichbar – zeige Linien-Chart.', 'err');
    state.chartMode = 'line';
    renderChart();
  }
}
