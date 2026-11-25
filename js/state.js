'use strict';

const DEFAULTS = [
  {symbol: 'NVDA', name: 'NVIDIA Corporation'},
  {symbol: 'AAPL', name: 'Apple Inc.'},
  {symbol: 'TSLA', name: 'Tesla, Inc.'},
];
const CHART_MODES = ['line', 'candle', 'tv'];
const RANGES = ['1d', '5d', '1mo', '6mo', '1y', '5y'];

const loadSetting = (key, def) => store.get('ql_' + key, store.get('nx_' + key, def));

const state = {
  watchlist: loadSetting('watchlist', null) || DEFAULTS.slice(),
  selected:  loadSetting('selected', null),
  chartMode: store.get('ql_chartmode', 'line'),
  range:     loadSetting('range', '6mo'),
  view:      store.get('ql_view', 'markets'),
  sideTab:   store.get('ql_side', 'watchlist'),
  period:    null,
  potential: null,
  potentialLoading: false,
  depot:     store.get('ql_depot', []),
  depotRange: store.get('ql_depot_range', '6mo'),
  depotEditing: false,
  depotClass: store.get('ql_depot_class', 'all'),
  depotForecast: store.get('ql_depot_fc', null),
  depotFcRun: null,
  depotPeriod: null,
  fx:        {},
  tab:       'insights',
  showDetail: true,
  trends:    null,
  trendsLoading: false,
  names:     {},
  newsFilter: 'all',
  editing:   false,
  quotes:    {},
  analyses:  {},
  scans:     {},
  running:   new Set()
};

if (!Array.isArray(state.watchlist)) state.watchlist = DEFAULTS.slice();
if (!CHART_MODES.includes(state.chartMode)) state.chartMode = 'line';
if (!RANGES.includes(state.range)) state.range = '6mo';
if (!['watchlist', 'trends', 'potential'].includes(state.sideTab)) state.sideTab = 'watchlist';
if (!['markets', 'depot'].includes(state.view)) state.view = 'markets';
if (!Array.isArray(state.depot)) state.depot = [];
if (!['all', 'stocks', 'crypto'].includes(state.depotClass)) state.depotClass = 'all';
state.depot = state.depot.filter(p => p && p.symbol && p.shares > 0);
if (!state.watchlist.some(w => w.symbol === state.selected)) state.selected = state.watchlist[0]?.symbol || null;

const syncPushSymbols = () => { if (typeof schedulePushSync === 'function') schedulePushSync(); };
const saveWatchlist = () => { store.set('ql_watchlist', state.watchlist); syncPushSymbols(); };
const saveDepot = () => { store.set('ql_depot', state.depot); syncPushSymbols(); };
const isCryptoSymbol = sym => /-(EUR|USD|USDT|BTC)$/.test(sym || '') || state.quotes[sym]?.type === 'CRYPTOCURRENCY';
const getPosition = sym => state.depot.find(p => p.symbol === sym);
const getItem = sym => state.watchlist.find(w => w.symbol === sym);
const displayName = sym => (sym?.startsWith('^') && state.names[sym]) || getItem(sym)?.name || getPosition(sym)?.name || state.quotes[sym]?.name || state.names[sym] || sym;
