'use strict';

const ROUTE_ROOTS = ['watchlist', 'trends', 'potenzial', 'depot', 'aktie'];
const SIDE_TO_ROUTE = {watchlist: 'watchlist', trends: 'trends', potential: 'potenzial'};
const ROUTE_TO_SIDE = {watchlist: 'watchlist', trends: 'trends', potenzial: 'potential'};
const DEPOT_TO_ROUTE = {all: '', stocks: 'aktien', crypto: 'krypto'};
const ROUTE_TO_DEPOT = {'': 'all', aktien: 'stocks', krypto: 'crypto'};

const APP_BASE = (() => {
  const parts = location.pathname.split('/');
  const i = parts.findIndex(p => ROUTE_ROOTS.includes(p.toLowerCase()));
  if (i > 0) return parts.slice(0, i).join('/') + '/';
  return location.pathname.replace(/[^/]*$/, '');
})();

let routing = false;

function routePath(){
  if (state.view === 'depot') {
    const c = DEPOT_TO_ROUTE[state.depotClass];
    return 'depot' + (c ? '/' + c : '');
  }
  const side = SIDE_TO_ROUTE[state.sideTab] || 'watchlist';
  return state.selected ? `${side}/${encodeURIComponent(state.selected.toLowerCase())}` : side;
}

function updateTitle(){
  document.title = state.view === 'depot' ? 'Depot – QuantLite'
    : state.selected ? `${displayName(state.selected)} (${state.selected}) – QuantLite`
    : 'QuantLite – Market Intelligence';
}

function syncUrl(replace = false){
  if (routing) return;
  const url = APP_BASE + routePath();
  if (location.pathname !== url) history[replace ? 'replaceState' : 'pushState'](null, '', url);
  updateTitle();
}

function parseRoute(path){
  const rel = path.startsWith(APP_BASE) ? path.slice(APP_BASE.length) : path.replace(/^\/+/, '');
  const [root = '', arg = ''] = rel.replace(/\/+$/, '').split('/');
  let decoded = arg;
  try { decoded = decodeURIComponent(arg); } catch {}
  return {root: root.toLowerCase(), arg: decoded.trim()};
}

function knownSymbols(){
  return [...new Set([
    ...state.watchlist.map(w => w.symbol),
    ...state.depot.map(p => p.symbol),
    ...(state.trends?.groups || []).flatMap(g => g.items.map(i => i.symbol)),
    ...(state.potential?.items || []).map(i => i.symbol),
    ...Object.keys(state.names)
  ])];
}

function findKnownSymbol(arg){
  const up = arg.toUpperCase();
  const known = knownSymbols();
  if (known.includes(up)) return up;
  const lower = arg.toLowerCase();
  return known.find(s => displayName(s).toLowerCase().includes(lower)) || null;
}

function applyRouteState(path){
  const {root, arg} = parseRoute(path);
  if (root === 'depot') {
    state.view = 'depot';
    state.depotClass = ROUTE_TO_DEPOT[arg.toLowerCase()] || 'all';
    return null;
  }
  if (ROUTE_TO_SIDE[root]) state.sideTab = ROUTE_TO_SIDE[root];
  if (root) state.view = 'markets';
  if (!arg) return null;
  const sym = findKnownSymbol(arg);
  if (sym) { state.selected = sym; return null; }
  return arg;
}

async function resolvePendingRoute(arg){
  if (!arg) return;
  try {
    const {sym, name} = await resolveSymbol(arg);
    if (name) state.names[sym] ||= name;
    routing = true;
    select(sym);
  } catch {
    toast(`„${arg}“ wurde nicht gefunden.`, 'err');
  } finally {
    routing = false;
    syncUrl(true);
  }
}

function consumeRedirect(){
  let route = null;
  try { route = sessionStorage.getItem('ql_route'); sessionStorage.removeItem('ql_route'); } catch {}
  if (route) history.replaceState(null, '', APP_BASE + route);
  return location.pathname;
}

window.addEventListener('popstate', () => {
  const pending = applyRouteState(location.pathname);
  routing = true;
  try {
    renderAll();
    renderView();
  } finally {
    routing = false;
  }
  updateTitle();
  if (state.sideTab === 'trends') loadTrends();
  if (state.sideTab === 'potential') loadPotential();
  resolvePendingRoute(pending);
});
