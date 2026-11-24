'use strict';

function renderQuoteHead(){
  const sym = state.selected, box = $('#quoteHead');
  if (!sym) {
    box.innerHTML = `<div class="qh-empty">Wähle links eine Aktie aus oder füge eine neue hinzu.</div>`;
    renderKeyStats();
    return;
  }
  const name = displayName(sym);
  const q = state.quotes[sym];
  const running = state.running.has(sym);

  const per = state.period?.sym === sym && state.period.range === state.range && state.range !== '1d' ? state.period : null;
  const chg = per ? per.change : q?.change;
  const pct = per ? per.pct : q?.pct;
  const label = per ? RANGE_LABEL[state.range] : 'Heute';

  let price;
  if (!q) {
    price = `<div class="qh-price"><span class="sk" style="width:180px;height:42px"></span></div>
             <div class="qh-change"><span class="sk" style="width:140px;height:16px"></span></div>`;
  } else if (!q.ok) {
    price = `<div class="qh-price flat">—</div><div class="qh-change flat">Kurs derzeit nicht verfügbar</div>`;
  } else {
    price = `<div class="qh-price" id="qhPrice">${fmtPx(q.price)}<span class="qh-cur">${esc(q.currency || '')}</span></div>
             <div class="qh-change ${cls(pct)}" id="qhChange">${fmtSigned(chg)} (${fmtPct(pct)})<span class="qh-when">${label}</span></div>`;
  }

  const links = [
    getItem(sym) ? '' : `<button class="text-btn qh-add" data-add-wl="${esc(sym)}">+ Watchlist</button>`,
    `<button class="text-btn qh-add" data-add-depot="${esc(sym)}">+ Depot</button>`,
    `<button class="text-btn qh-add" data-add-alert="${esc(sym)}">+ Alarm</button>`
  ].filter(Boolean).join(' · ');

  box.innerHTML = `
    <div class="qh-main">
      <div class="qh-title">
        <h1>${esc(name)}</h1>
        <span class="qh-meta">${esc(sym)}${q?.exchange ? ' · ' + esc(q.exchange) : ''} · ${links}</span>
      </div>
      ${price}
    </div>
    <button class="btn-primary" data-fc="${esc(sym)}" ${running ? 'disabled' : ''}>
      ${running ? '<span class="spinner"></span>Analysiere …' : 'Prognose erstellen'}
    </button>`;
  renderKeyStats();
}

function showHoverQuote(value, base, t){
  const p = $('#qhPrice'), c = $('#qhChange');
  if (!p || !c) return;
  const cur = state.quotes[state.selected]?.currency || '';
  const chg = value - base, pct = base ? chg / base * 100 : 0;
  p.innerHTML = `${fmtPx(value)}<span class="qh-cur">${esc(cur)}</span>`;
  c.className = 'qh-change ' + cls(pct);
  c.innerHTML = `${fmtSigned(chg)} (${fmtPct(pct)})<span class="qh-when">${fmtChartTime(t, INTRADAY.includes(state.range))}</span>`;
}

function renderKeyStats(){
  const q = state.quotes[state.selected];
  if (!q?.ok) { $('#keyStats').innerHTML = ''; return; }
  const stand = q.time ? new Date(q.time * 1000).toLocaleString('de-DE', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) : '—';
  const stats = [
    ['Vortag', fmtPx(q.prev)],
    ['Tageshoch', fmtPx(q.high)],
    ['Tagestief', fmtPx(q.low)],
    ['52W-Spanne', `${fmtPx(q.l52)} – ${fmtPx(q.h52)}`],
    ['Volumen', fmtBig(q.vol)],
    ['Stand', stand]
  ];
  $('#keyStats').innerHTML = stats.map(([l, v]) =>
    `<div class="stat"><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div>`).join('');
}
