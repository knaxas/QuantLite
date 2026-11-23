'use strict';

const POTENTIAL_UNIVERSE = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'AMD', 'NFLX',
  'JPM', 'V', 'MA', 'LLY', 'COST', 'ORCL', 'CRM', 'PLTR', 'UBER', 'SHOP', 'COIN', 'ADBE',
  'ASML', 'NVO', 'SAP.DE', 'SIE.DE', 'RHM.DE', 'ALV.DE', 'DTE.DE', 'MBG.DE', 'BMW.DE',
  'AIR.DE', 'IFX.DE', 'MUV2.DE', 'DBK.DE', 'ADS.DE'
];
const POTENTIAL_TTL = 6 * 60 * 60 * 1000;
const POTENTIAL_SHOW = 25;

function potentialSymbols(){
  return [...new Set([
    ...state.watchlist.map(w => w.symbol),
    ...state.depot.map(p => p.symbol),
    ...(state.trends?.groups || []).flatMap(g => g.items.map(i => i.symbol)),
    ...POTENTIAL_UNIVERSE
  ])];
}

async function loadPotential(force = false){
  if (state.potentialLoading) return;
  if (!force) {
    const cached = state.potential || store.get('ql_potential', null);
    if (cached && Date.now() - cached.at < POTENTIAL_TTL) {
      state.potential = cached;
      cached.items.forEach(it => { state.names[it.symbol] ||= it.name; });
      renderPotential();
      return;
    }
  }
  const syms = potentialSymbols();
  state.potentialLoading = true;
  const P = state.potential = {at: Date.now(), items: [], done: 0, total: syms.length};
  renderPotential();

  let pending = false;
  const throttledRender = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; renderPotential(); }, 300);
  };

  await Promise.all(syms.map(sym => limit(async () => {
    try {
      const hist = await fetchHistory(sym);
      const T = computePriceTarget(hist, null, state.analyses[sym]?.score || 0, state.analyses[sym]?.confidence || 0);
      const name = hist.meta?.longName || hist.meta?.shortName || displayName(sym);
      state.names[sym] ||= name;
      P.items.push({symbol: sym, name, upside: T.upside, target: T.target, price: T.price, currency: T.currency});
    } catch {}
    P.done++;
    throttledRender();
  })));

  P.items.sort((a, b) => b.upside - a.upside);
  state.potentialLoading = false;
  if (P.items.length) store.set('ql_potential', P);
  renderPotential();
}

function renderPotential(){
  const box = $('#potential'), P = state.potential;
  const note = $('#potentialTime');

  if (!P) { box.innerHTML = ''; note.textContent = ''; return; }

  if (state.potentialLoading) {
    note.textContent = `${P.done} / ${P.total}`;
  } else {
    note.textContent = 'Stand ' + new Date(P.at).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
  }

  const items = [...P.items].sort((a, b) => b.upside - a.upside).slice(0, POTENTIAL_SHOW);
  const progress = state.potentialLoading
    ? `<div class="progress pot-progress"><span style="width:${Math.max(4, P.done / P.total * 100)}%"></span></div>` : '';

  if (!items.length) {
    box.innerHTML = progress + (state.potentialLoading
      ? `<p class="wl-empty">Berechne Kursziele …</p>`
      : `<div class="wl-empty">Keine Daten verfügbar.<br><button class="text-btn" data-potential-retry>Erneut versuchen</button></div>`);
    return;
  }

  box.innerHTML = `${progress}
    <p class="pot-intro">Größtes erwartetes Kursplus in 6 Monaten laut Modell (Trend, Volatilität${Object.keys(state.analyses).length ? ', Sentiment' : ''}).</p>
    <ul class="watchlist">${items.map((it, i) => `
      <li class="wl-item${it.symbol === state.selected ? ' active' : ''}" data-sym="${esc(it.symbol)}" tabindex="0">
        <span class="pot-rank">${i + 1}</span>
        <div class="wl-info"><span class="wl-sym">${esc(it.symbol)}</span><span class="wl-name" title="${esc(it.name)}">${esc(it.name)}</span></div>
        <div class="wl-quote">
          <span class="wl-badge ${cls(it.upside)}">${fmtPct(it.upside)}</span>
          <span class="pot-target">Ziel ${fmtPx(it.target)}</span>
        </div>
      </li>`).join('')}
    </ul>
    <p class="pot-note">Modellrechnung, keine Anlageempfehlung. <button class="text-btn" data-potential-retry>Neu berechnen</button></p>`;
}
