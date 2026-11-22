'use strict';

const TREND_GROUPS = [
  ['most_actives', 'Meistgehandelt'],
  ['day_gainers',  'Top-Gewinner'],
  ['day_losers',   'Top-Verlierer']
];
const TRENDS_TTL = 5 * 60 * 1000;

async function loadTrends(force = false){
  if (state.trendsLoading) return;
  if (!force && state.trends && Date.now() - state.trends.at < TRENDS_TTL) return;
  state.trendsLoading = true;
  renderTrends();

  const results = await Promise.allSettled(TREND_GROUPS.map(([id]) => limit(() => fetchScreener(id, 6))));
  const groups = TREND_GROUPS.map(([id, title], i) => ({
    id, title,
    items: results[i].status === 'fulfilled' ? results[i].value : [],
    failed: results[i].status === 'rejected'
  }));
  groups.forEach(g => g.items.forEach(it => { state.names[it.symbol] ||= it.name; }));

  if (groups.some(g => g.items.length) || !state.trends) state.trends = {at: Date.now(), groups};
  state.trendsLoading = false;
  renderTrends();
}

function renderTrends(){
  const box = $('#trends');
  const T = state.trends;

  if (!T) {
    box.innerHTML = state.trendsLoading
      ? TREND_GROUPS.map(([, title]) => `<section class="trend-group"><h3 class="trend-title">${title}</h3>
          <ul class="watchlist">${Array.from({length: 4}, () => rowHTML('', '', undefined, false).replace('data-sym=""', '')).join('')}</ul></section>`).join('')
      : '';
    $('#trendsTime').textContent = '';
    return;
  }

  if (!T.groups.some(g => g.items.length)) {
    box.innerHTML = `<div class="wl-empty">Trends konnten nicht geladen werden.<br><button class="text-btn" data-trends-retry>Erneut versuchen</button></div>`;
    $('#trendsTime').textContent = '';
    return;
  }

  box.innerHTML = T.groups.filter(g => g.items.length).map(g => `
    <section class="trend-group">
      <h3 class="trend-title">${g.title}</h3>
      <ul class="watchlist">${g.items.map(it => rowHTML(it.symbol, it.name, {ok: true, price: it.price, pct: it.pct}, false)).join('')}</ul>
    </section>`).join('');
  $('#trendsTime').textContent = state.trendsLoading ? 'aktualisiere …'
    : 'US · ' + new Date(T.at).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
}

const SIDE_PANELS = {watchlist: '#sideWatchlist', trends: '#sideTrends', potential: '#sidePotential'};

function renderSidebar(){
  setSeg($('#sideSeg'), b => b.dataset.side === state.sideTab);
  for (const [tab, sel] of Object.entries(SIDE_PANELS)) $(sel).hidden = state.sideTab !== tab;
}

function setSideTab(tab){
  if (tab === state.sideTab || !SIDE_PANELS[tab]) return;
  state.sideTab = tab;
  store.set('ql_side', tab);
  if (state.editing) state.editing = false;
  renderSidebar();
  const panel = $(SIDE_PANELS[tab]);
  panel.classList.remove('fade-in'); void panel.offsetWidth; panel.classList.add('fade-in');
  if (tab === 'trends') loadTrends();
  else if (tab === 'potential') loadPotential();
  else renderWatchlist();
}
