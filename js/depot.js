'use strict';

const DEPOT_RANGES = {'5d': '60m', '1mo': '1d', '6mo': '1d', '1y': '1d', '5y': '1wk'};
const DEPOT_RANGE_LABEL = {'5d': '1 Woche', '1mo': '1 Monat', '6mo': '6 Monate', '1y': '1 Jahr', '5y': '5 Jahre'};
const ALLOC_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];
const ALLOC_OTHER = '#636366';

const fmtEur = v => v == null || isNaN(v) ? '—' : nf(2).format(v) + ' €';
const fmtEurSigned = v => v == null || isNaN(v) ? '—' : (v > 0 ? '+' : '') + fmtEur(v);
const parseNum = s => parseFloat(String(s).trim().replace(/\./g, (m, i, str) => /,/.test(str) ? '' : m).replace(',', '.'));

let depotChart = null, depotToken = 0, depotRenderTimer = null, depotBase = null;

async function fxToEur(cur){
  if (!cur || cur === 'EUR') return 1;
  if (cur === 'GBp' || cur === 'GBX') return (await fxToEur('GBP')) / 100;
  const c = state.fx[cur];
  if (c && Date.now() - c.at < 600000) return c.rate;
  const res = await fetchYahooChart(`EUR${cur}=X`, '1d', '15m', 600000);
  const eurIn = res.meta?.regularMarketPrice;
  if (!eurIn) throw new Error('Kein Wechselkurs für ' + cur);
  const rate = 1 / eurIn;
  state.fx[cur] = {rate, at: Date.now()};
  return rate;
}
function fxSync(cur){
  if (!cur || cur === 'EUR') return 1;
  if (cur === 'GBp' || cur === 'GBX') return (state.fx.GBP?.rate ?? NaN) / 100;
  return state.fx[cur]?.rate ?? NaN;
}
async function ensureFx(currencies){
  const curs = currencies || state.depot.map(p => state.quotes[p.symbol]?.currency);
  await Promise.allSettled([...new Set(curs.filter(Boolean))].map(fxToEur));
}

function depotColor(i){ return i < ALLOC_COLORS.length ? ALLOC_COLORS[i] : ALLOC_OTHER; }

const DEPOT_CLASS_LABEL = {all: 'Gesamt', stocks: 'Aktien & ETFs', crypto: 'Krypto'};
const inClass = (p, c = state.depotClass) => c === 'all' || (c === 'crypto') === isCryptoSymbol(p.symbol);
const depotPositions = (c = state.depotClass) => state.depot.filter(p => inClass(p, c));

function valuation(c = state.depotClass){
  const rows = state.depot.map((p, i) => ({p, i})).filter(({p}) => inClass(p, c)).map(({p, i}) => {
    const q = state.quotes[p.symbol];
    const fx = q?.ok ? fxSync(q.currency) : NaN;
    const ok = !!q?.ok && !isNaN(fx);
    const cost = p.shares * p.buy;
    const value = ok ? p.shares * q.price * fx : null;
    return {
      ...p, idx: i, color: depotColor(i), ok, cost, value,
      priceEur: ok ? q.price * fx : null,
      gain: ok ? value - cost : null,
      gainPct: ok && cost ? (value - cost) / cost * 100 : null,
      day: ok ? p.shares * q.change * fx : null
    };
  });
  const ok = rows.filter(r => r.ok);
  const total = ok.reduce((a, r) => a + r.value, 0);
  const costOk = ok.reduce((a, r) => a + r.cost, 0);
  const day = ok.reduce((a, r) => a + r.day, 0);
  return {
    rows, total,
    invested: rows.reduce((a, r) => a + r.cost, 0),
    gain: total - costOk,
    gainPct: costOk ? (total - costOk) / costOk * 100 : 0,
    day, dayPct: total - day ? day / (total - day) * 100 : 0,
    complete: ok.length === rows.length
  };
}

function scheduleDepotRender(){
  clearTimeout(depotRenderTimer);
  depotRenderTimer = setTimeout(renderDepot, 120);
}

function renderDepot(){
  const empty = !state.depot.length;
  $('#depotEmpty').hidden = !empty;
  $('#depotContent').hidden = empty;
  if (empty) return;
  const hasCrypto = state.depot.some(p => isCryptoSymbol(p.symbol));
  const hasStocks = state.depot.some(p => !isCryptoSymbol(p.symbol));
  $('#depotClassSeg').hidden = !(hasCrypto && hasStocks) && state.depotClass === 'all';
  setSeg($('#depotClassSeg'), b => b.dataset.c === state.depotClass);
  $('#dpTitle').textContent = state.depotClass === 'all' ? 'Depot' : DEPOT_CLASS_LABEL[state.depotClass];
  const V = valuation();
  renderDepotSummary(V);
  renderDepotStats(V);
  renderPositions(V);
  renderAllocation(V);
  renderDepotForecast();
}

function setDepotClass(c){
  if (c === state.depotClass) return;
  state.depotClass = c;
  store.set('ql_depot_class', c);
  renderDepot();
  renderDepotChart();
}

function renderDepotSummary(V = valuation()){
  const per = state.depotPeriod?.range === state.depotRange && state.depotPeriod.cls === state.depotClass ? state.depotPeriod : null;
  const chg = per ? V.total - per.base : V.day;
  const pct = per ? (per.base ? chg / per.base * 100 : 0) : V.dayPct;
  $('#dpValue').textContent = fmtEur(V.total);
  const c = $('#dpChange');
  c.className = 'qh-change ' + cls(chg);
  c.innerHTML = `${fmtEurSigned(chg)} (${fmtPct(pct)})<span class="qh-when">${per ? DEPOT_RANGE_LABEL[state.depotRange] : 'Heute'}</span>`;
}

function showDepotHover(value, base, t){
  $('#dpValue').textContent = fmtEur(value);
  const chg = value - base, pct = base ? chg / base * 100 : 0;
  const c = $('#dpChange');
  c.className = 'qh-change ' + cls(chg);
  c.innerHTML = `${fmtEurSigned(chg)} (${fmtPct(pct)})<span class="qh-when">${fmtChartTime(t, state.depotRange === '5d')}</span>`;
}

function renderDepotStats(V){
  const stats = [
    ['Investiert', fmtEur(V.invested), ''],
    ['Gewinn/Verlust', `${fmtEurSigned(V.gain)} (${fmtPct(V.gainPct)})`, cls(V.gain)],
    ['Heute', `${fmtEurSigned(V.day)} (${fmtPct(V.dayPct)})`, cls(V.day)],
    ['Positionen', String(V.rows.length), '']
  ];
  $('#dpStats').innerHTML = stats.map(([l, v, c]) =>
    `<div class="stat"><div class="stat-label">${l}</div><div class="stat-value ${c}">${v}</div></div>`).join('');
}

function initials(name, sym){
  const words = cleanCompanyName(name || sym, sym).split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || sym).slice(0, 2)).toUpperCase();
}

function renderPositions(V){
  const list = $('#dpPositions');
  list.classList.toggle('editing', state.depotEditing);
  $('#dpEditToggle').textContent = state.depotEditing ? 'Fertig' : 'Bearbeiten';
  const rows = [...V.rows].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  if (!rows.length) {
    list.innerHTML = `<li class="wl-empty">Keine ${state.depotClass === 'crypto' ? 'Krypto-Positionen' : 'Aktien oder ETFs'} im Depot.</li>`;
    return;
  }
  const groups = state.depotClass === 'all'
    ? [['Aktien & ETFs', rows.filter(r => !isCryptoSymbol(r.symbol))], ['Krypto', rows.filter(r => isCryptoSymbol(r.symbol))]].filter(([, g]) => g.length)
    : [[null, rows]];
  const showHeads = groups.length > 1;
  list.innerHTML = groups.map(([title, g]) =>
    (showHeads ? `<li class="dp-group"><span>${title}</span><span>${fmtEur(g.reduce((a, r) => a + (r.value || 0), 0))}</span></li>` : '') +
    g.map(positionRowHTML).join('')).join('');
}

function positionRowHTML(r){
  return `
    <li class="dp-row" data-pos="${esc(r.symbol)}" tabindex="0">
      <button class="wl-remove" data-pos-del="${esc(r.symbol)}" aria-label="${esc(r.symbol)} entfernen" tabindex="${state.depotEditing ? 0 : -1}"></button>
      <span class="dp-avatar" style="background:${r.color}">${esc(initials(r.name, r.symbol))}</span>
      <div class="dp-info">
        <span class="dp-name">${esc(r.name || r.symbol)}</span>
        <span class="dp-sub">${nf(r.shares % 1 ? 3 : 0).format(r.shares)} Stk. · Ø ${fmtEur(r.buy)}</span>
      </div>
      <div class="dp-val">
        ${r.ok
          ? `<span class="dp-value">${fmtEur(r.value)}</span><span class="dp-gain ${cls(r.gain)}">${fmtEurSigned(r.gain)} · ${fmtPct(r.gainPct)}</span>`
          : `<span class="sk" style="width:80px;height:15px"></span><span class="sk" style="width:110px;height:12px;margin-top:6px"></span>`}
      </div>
    </li>`;
}

function renderAllocation(V){
  const ok = V.rows.filter(r => r.ok && r.value > 0);
  if (!ok.length || !V.total) { $('#dpAlloc').innerHTML = '<p class="method">Wird berechnet …</p>'; return; }
  const groups = ok.filter(r => r.idx < ALLOC_COLORS.length).map(r => ({name: r.name || r.symbol, value: r.value, color: r.color}));
  const rest = ok.filter(r => r.idx >= ALLOC_COLORS.length);
  if (rest.length) groups.push({name: `Andere (${rest.length})`, value: rest.reduce((a, r) => a + r.value, 0), color: ALLOC_OTHER});
  groups.sort((a, b) => b.value - a.value);

  let classSplit = '';
  if (state.depotClass === 'all') {
    const crypto = ok.filter(r => isCryptoSymbol(r.symbol)).reduce((a, r) => a + r.value, 0);
    if (crypto > 0 && crypto < V.total) {
      const pc = crypto / V.total * 100;
      classSplit = `<div class="class-split"><span>Aktien & ETFs <b>${nf(1).format(100 - pc)} %</b></span><span>Krypto <b>${nf(1).format(pc)} %</b></span></div>`;
    }
  }

  $('#dpAlloc').innerHTML = classSplit + `
    <div class="alloc-bar" role="img" aria-label="Aufteilung des Depots">
      ${groups.map(g => `<span style="flex:${g.value};background:${g.color}" title="${esc(g.name)}: ${nf(1).format(g.value / V.total * 100)} %"></span>`).join('')}
    </div>
    <ul class="alloc-legend">
      ${groups.map(g => `<li><i style="background:${g.color}"></i><span class="alloc-name">${esc(g.name)}</span><span class="alloc-pct">${nf(1).format(g.value / V.total * 100)} %</span><span class="alloc-val">${fmtEur(g.value)}</span></li>`).join('')}
    </ul>`;
}

function bucketKey(t, off, interval){
  if (interval === '60m') return String(Math.floor(t / 3600));
  return new Date((t + off) * 1000).toISOString().slice(0, 10);
}

async function renderDepotChart(){
  const token = ++depotToken;
  setSeg($('#depotRangeSeg'), b => b.dataset.r === state.depotRange);
  const positions = depotPositions();
  if (!positions.length) {
    const o = $('#dpChartOverlay');
    o.hidden = !state.depot.length;
    o.innerHTML = '<p>Keine Positionen in dieser Kategorie</p>';
    return;
  }
  const range = state.depotRange, interval = DEPOT_RANGES[range], cls = state.depotClass;
  const host = $('#dpChartHost');
  host.classList.add('loading');
  try {
    const results = await Promise.allSettled(positions.map(p => limit(() => fetchYahooChart(p.symbol, range, interval, 300000))));
    await ensureFx(results.filter(r => r.status === 'fulfilled').map(r => r.value.meta?.currency));
    if (token !== depotToken) return;

    const keyTime = new Map();
    const perPos = [];
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const res = r.value, p = positions[i];
      const fx = fxSync(res.meta?.currency);
      if (isNaN(fx)) return;
      const ts = res.timestamp || [], cl = res.indicators?.quote?.[0]?.close || [];
      const off = res.meta?.gmtoffset || 0;
      const m = new Map();
      ts.forEach((t, j) => {
        if (cl[j] == null) return;
        const k = bucketKey(t, off, interval);
        m.set(k, p.shares * cl[j] * fx);
        if (!keyTime.has(k) || keyTime.get(k) > t) keyTime.set(k, t);
      });
      if (m.size) perPos.push(m);
    });
    if (!perPos.length) throw new Error('Keine Kursdaten');

    const keys = [...keyTime.keys()].sort((a, b) => keyTime.get(a) - keyTime.get(b));
    const last = perPos.map(m => m.values().next().value);
    const points = keys.map(k => {
      let sum = 0;
      perPos.forEach((m, i) => { if (m.has(k)) last[i] = m.get(k); sum += last[i]; });
      return {t: keyTime.get(k), v: sum};
    });

    depotBase = points[0].v;
    state.depotPeriod = {range, cls, base: depotBase};
    if (!depotChart) {
      depotChart = new AnimatedLineChart(host, {
        formatValue: v => fmtEur(v),
        formatTime: t => fmtChartTime(t, state.depotRange === '5d'),
        onHover: p => showDepotHover(p.v, depotBase, p.t),
        onLeave: () => renderDepotSummary()
      });
    }
    const end = points[points.length - 1].v;
    depotChart.setData(points, {color: end >= depotBase ? COLORS.green : COLORS.red});
    renderDepotSummary();
    $('#dpChartOverlay').hidden = true;
  } catch (e) {
    if (token !== depotToken) return;
    const o = $('#dpChartOverlay');
    o.hidden = false;
    o.innerHTML = `<div><p>Wertverlauf nicht verfügbar</p><small>${esc(e.message)}</small></div>`;
  } finally {
    if (token === depotToken) host.classList.remove('loading');
  }
}

async function loadDepot(){
  renderDepot();
  renderDepotChart();
  await Promise.all(state.depot.map(p => loadQuote(p.symbol)));
  await ensureFx();
  renderDepot();
}

function renderView(){
  setSeg($('#viewSeg'), b => b.dataset.view === state.view);
  const depot = state.view === 'depot';
  $('#marketsView').hidden = depot;
  $('#depotView').hidden = !depot;
  if (depot) loadDepot();
  else { $$('.seg').forEach(updateSeg); renderChart(); }
}

function setView(view){
  if (view === state.view) return;
  state.view = view;
  store.set('ql_view', view);
  renderView();
  const el = view === 'depot' ? $('#depotView') : $('#marketsView');
  el.classList.remove('fade-in'); void el.offsetWidth; el.classList.add('fade-in');
  window.scrollTo({top: 0});
}

let posDialog = {mode: 'add', resolved: null};

function openPositionDialog(sym = '', mode = 'add'){
  const pos = getPosition(sym);
  posDialog = {mode, resolved: null};
  $('#posTitle').textContent = mode === 'edit' ? 'Position bearbeiten' : 'Position hinzufügen';
  $('#posSubmit').textContent = mode === 'edit' ? 'Speichern' : 'Hinzufügen';
  $('#posSymbol').value = sym;
  $('#posSymbol').readOnly = mode === 'edit';
  $('#posShares').value = mode === 'edit' ? String(pos.shares).replace('.', ',') : '';
  $('#posBuy').value = mode === 'edit' ? nf(2).format(pos.buy).replace(/\./g, '') : '';
  $('#posHint').textContent = mode === 'add' && pos ? `Du besitzt bereits ${pos.shares} Stk. – der Ø-Kaufkurs wird neu berechnet.` : '';
  $('#posDialog').showModal();
  if (sym) lookupPositionSymbol(); else $('#posSymbol').focus();
}

async function lookupPositionSymbol(){
  const input = $('#posSymbol').value.trim();
  if (!input) return;
  const hint = $('#posHint');
  const existingHint = hint.textContent.startsWith('Du besitzt') ? hint.textContent : '';
  hint.textContent = 'Suche …';
  try {
    const r = await resolveSymbol(input);
    if ($('#posSymbol').value.trim() !== input) return;
    if (!state.quotes[r.sym]?.ok) await loadQuote(r.sym);
    const q = state.quotes[r.sym];
    const fx = q?.ok ? await fxToEur(q.currency) : NaN;
    posDialog.resolved = {...r, priceEur: q?.ok ? q.price * fx : null};
    const px = posDialog.resolved.priceEur;
    hint.textContent = `${r.name} (${r.sym})${px ? ` · aktuell ${fmtEur(px)}` : ''}` + (existingHint ? ' · ' + existingHint : '');
    if (px && !$('#posBuy').value && posDialog.mode === 'add') $('#posBuy').value = nf(2).format(px).replace(/\./g, '');
  } catch (e) {
    posDialog.resolved = null;
    hint.textContent = e.message;
  }
}

async function submitPosition(){
  const shares = parseNum($('#posShares').value);
  const buy = parseNum($('#posBuy').value);
  if (!(shares > 0)) { toast('Bitte eine gültige Stückzahl eingeben.', 'err'); return; }
  if (!(buy > 0)) { toast('Bitte einen gültigen Kaufkurs eingeben.', 'err'); return; }

  if (posDialog.mode === 'edit') {
    const pos = getPosition($('#posSymbol').value.trim());
    if (pos) { pos.shares = shares; pos.buy = buy; }
  } else {
    if (!posDialog.resolved) await lookupPositionSymbol();
    const r = posDialog.resolved;
    if (!r) { toast('Wertpapier nicht gefunden.', 'err'); return; }
    const pos = getPosition(r.sym);
    if (pos) {
      pos.buy = (pos.shares * pos.buy + shares * buy) / (pos.shares + shares);
      pos.shares += shares;
    } else {
      state.depot.push({symbol: r.sym, name: r.name, shares, buy});
    }
    toast(`${r.name} im Depot gespeichert`, 'ok');
  }
  saveDepot();
  $('#posDialog').close();
  if (state.view !== 'depot') setView('depot'); else loadDepot();
}

function removePosition(sym){
  state.depot = state.depot.filter(p => p.symbol !== sym);
  saveDepot();
  if (!state.depot.length) state.depotEditing = false;
  toast(`${sym} aus dem Depot entfernt`);
  loadDepot();
}
