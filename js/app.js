'use strict';

function select(sym){
  state.selected = sym;
  state.newsFilter = 'all';
  state.period = null;
  store.set('ql_selected', sym);
  if (state.view !== 'markets') setView('markets');
  renderAll();
  syncUrl();
  if (sym && !state.quotes[sym]?.ok) loadQuote(sym);
}

function renderAll(){
  renderScreen();
  renderMarketTiles();
  renderSidebar();
  renderWatchlist();
  renderTrends();
  renderPotential();
  renderQuoteHead();
  renderChart();
  renderInsights();
}

function marketOpen(tz, oh, om, ch, cm){
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false})
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  if (['Sat', 'Sun'].includes(p.weekday)) return false;
  const m = (+p.hour % 24) * 60 + +p.minute;
  return m >= oh * 60 + om && m < ch * 60 + cm;
}
function renderMarketStatus(){
  const markets = [
    ['NYSE',  marketOpen('America/New_York', 9, 30, 16, 0)],
    ['XETRA', marketOpen('Europe/Berlin', 9, 0, 17, 30)]
  ];
  $('#marketStatus').innerHTML = markets.map(([n, open]) =>
    `<span class="market"><span class="dot ${open ? 'ok' : ''}"></span>${n} ${open ? 'geöffnet' : 'geschlossen'}</span>`).join('');
}

document.addEventListener('click', e => {
  const t = e.target;
  const fc = t.closest('[data-fc]');
  if (fc) { e.preventDefault(); e.stopPropagation(); runForecast(fc.dataset.fc); return; }

  const del = t.closest('[data-del]');
  if (del) { e.stopPropagation(); removeSymbol(del.dataset.del); return; }

  const add = t.closest('[data-add-wl]');
  if (add) { addToWatchlist(add.dataset.addWl); return; }

  const addDepot = t.closest('[data-add-depot]');
  if (addDepot) { openPositionDialog(addDepot.dataset.addDepot, 'add'); return; }

  if (t.closest('[data-pos-add]')) { openPositionDialog('', 'add'); return; }
  if (t.closest('[data-depot-fc]')) { runDepotForecast(); return; }
  if (t.closest('[data-pos-cancel]')) { $('#posDialog').close(); return; }
  if (t.closest('[data-import]')) { $('#importFile').value = ''; $('#importFile').click(); return; }
  if (t.closest('[data-import-cancel]')) { importState = null; $('#importDialog').close(); return; }
  const tog = t.closest('[data-import-toggle]');
  if (tog && importState) { importState.positions[+tog.dataset.importToggle].include = tog.checked; renderImportPreview(); return; }

  const posDel = t.closest('[data-pos-del]');
  if (posDel) { e.stopPropagation(); removePosition(posDel.dataset.posDel); return; }

  const pos = t.closest('.dp-row');
  if (pos) {
    if (state.depotEditing) openPositionDialog(pos.dataset.pos, 'edit');
    else openDetail(pos.dataset.pos);
    return;
  }

  if (t.closest('[data-retry-chart]')) { renderChart(); return; }
  if (t.closest('[data-trends-retry]')) { loadTrends(true); return; }
  if (t.closest('[data-potential-retry]')) { loadPotential(true); return; }

  const row = t.closest('.wl-item');
  if (row?.dataset.sym) { openDetail(row.dataset.sym); return; }

  const tile = t.closest('[data-tile]');
  if (tile) { openDetail(tile.dataset.tile); return; }

  if (t.closest('[data-detail-back]')) { closeDetail(); return; }

  const share = t.closest('[data-share]');
  if (share) { shareStock(share.dataset.share); return; }
});

$('.sidebar').addEventListener('keydown', e => {
  const row = e.target.closest('.wl-item');
  if (!row?.dataset.sym) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(row.dataset.sym); }
  if (e.key === 'Delete' && getItem(row.dataset.sym)) removeSymbol(row.dataset.sym);
});
$('#dpPositions').addEventListener('keydown', e => {
  const row = e.target.closest('.dp-row');
  if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); }
});
document.addEventListener('keydown', e => {
  if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && state.view === 'markets') {
    e.preventDefault(); $('#addInput').focus();
  }
  if (e.key === 'Escape' && state.editing) toggleEditing();
});

const onSeg = (sel, fn) => $(sel).addEventListener('click', e => { const b = e.target.closest('button'); if (b) fn(b); });

onSeg('#viewSeg',  b => setView(b.dataset.view));
onSeg('#sideSeg',  b => setSideTab(b.dataset.side));
onSeg('#tabSeg',   b => switchTab(b.dataset.tab));
onSeg('#rangeSeg', b => { state.range = b.dataset.r; store.set('ql_range', state.range); tvKey = null; renderChart(); });
onSeg('#modeSeg',  b => { state.chartMode = b.dataset.mode; store.set('ql_chartmode', state.chartMode); renderChart(); });
onSeg('#newsFilter', b => { state.newsFilter = b.dataset.f; renderArticles(); });
onSeg('#depotClassSeg', b => setDepotClass(b.dataset.c));
onSeg('#depotRangeSeg', b => { state.depotRange = b.dataset.r; store.set('ql_depot_range', state.depotRange); renderDepotChart(); });

$('#addForm').addEventListener('submit', e => { e.preventDefault(); addSymbol($('#addInput').value); });
$('#editToggle').addEventListener('click', toggleEditing);
$('#dpEditToggle').addEventListener('click', () => { state.depotEditing = !state.depotEditing; renderDepot(); });
$('#posForm').addEventListener('submit', e => { e.preventDefault(); submitPosition(); });
$('#posSymbol').addEventListener('change', () => { posDialog.resolved = null; lookupPositionSymbol(); });
$('#posDialog').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$('#settingsDialog').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$('#importFile').addEventListener('change', e => handleImportFile(e.target.files[0]));
$('#importConfirm').addEventListener('click', confirmImport);

$('#refreshAll').addEventListener('click', e => {
  const btn = e.currentTarget;
  btn.classList.remove('spinning'); void btn.offsetWidth; btn.classList.add('spinning');
  cache.clear();
  loadAllQuotes();
  if (state.view === 'depot') loadDepot();
  else {
    renderChart();
    if (state.sideTab === 'trends') loadTrends(true);
  }
  toast('Kurse werden aktualisiert …');
});

window.addEventListener('resize', () => $$('.seg').forEach(updateSeg));
document.fonts?.ready.then(() => $$('.seg').forEach(updateSeg));

function init(){
  saveWatchlist();
  const pending = applyRouteState(consumeRedirect());
  renderMarketStatus();
  setInterval(renderMarketStatus, 30000);
  renderAll();
  renderView();
  syncUrl(true);
  resolvePendingRoute(pending);
  initNotifications();
  loadAllQuotes();
  if (state.sideTab === 'trends') loadTrends();
  if (state.sideTab === 'potential') loadPotential();
  setInterval(() => { if (!document.hidden) loadAllQuotes(); }, 60000);
  setInterval(() => { if (!document.hidden && state.sideTab === 'trends') loadTrends(); }, TRENDS_TTL);
}
init();
