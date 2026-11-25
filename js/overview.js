'use strict';

const MARKET_TILES = [['^GDAXI', 'DAX'], ['^GSPC', 'S&P 500'], ['^IXIC', 'Nasdaq'], ['BTC-EUR', 'Bitcoin']];
const SIDE_LABEL = {watchlist: 'Watchlist', trends: 'Trends', potential: 'Potenzial'};

MARKET_TILES.forEach(([sym, name]) => { state.names[sym] ||= name; });

const isMobile = () => matchMedia('(max-width: 900px)').matches;
const tileSymbols = () => MARKET_TILES.map(([sym]) => sym);

function renderMarketTiles(){
  $('#marketTiles').innerHTML = MARKET_TILES.map(([sym, name]) => {
    const q = state.quotes[sym];
    const value = q?.ok
      ? `<span class="tile-price">${fmtPx(q.price)}</span><span class="tile-chg ${cls(q.pct)}">${fmtPct(q.pct)}</span>`
      : `<span class="sk" style="width:70px;height:15px"></span><span class="sk" style="width:50px;height:12px"></span>`;
    const active = sym === state.selected && (!isMobile() || state.showDetail);
    return `<button class="tile${active ? ' active' : ''}" data-tile="${esc(sym)}"><span class="tile-name">${name}</span>${value}</button>`;
  }).join('');
}

function renderScreen(){
  const mobile = isMobile();
  document.body.classList.toggle('m-detail', mobile && state.showDetail);
  document.body.classList.toggle('m-list', mobile && !state.showDetail);
  $('#detailBackLabel').textContent = SIDE_LABEL[state.sideTab] || 'Übersicht';
}

function openDetail(sym){
  const fromList = isMobile() && !state.showDetail;
  state.showDetail = true;
  if (sym !== state.selected) select(sym);
  else { renderScreen(); renderMarketTiles(); syncUrl(); }
  if (fromList) {
    history.replaceState({fromList: true}, '', location.pathname);
    window.scrollTo({top: 0});
  }
}

function closeDetail(){
  if (history.state?.fromList) { history.back(); return; }
  state.showDetail = false;
  renderScreen();
  renderMarketTiles();
  syncUrl();
  window.scrollTo({top: 0});
}

async function shareStock(sym){
  const url = location.origin + APP_BASE + 'aktie/' + encodeURIComponent(sym.toLowerCase());
  const name = displayName(sym);
  const q = state.quotes[sym];
  const text = q?.ok ? `${name} (${sym}): ${fmtPx(q.price)} ${q.currency || ''} (${fmtPct(q.pct)} heute)` : `${name} (${sym})`;
  if (navigator.share) {
    try {
      await navigator.share({title: `${name} – QuantLite`, text, url});
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link kopiert', 'ok');
  } catch {
    window.prompt('Link zum Teilen:', url);
  }
}

matchMedia('(max-width: 900px)').addEventListener('change', () => { renderScreen(); renderMarketTiles(); });
