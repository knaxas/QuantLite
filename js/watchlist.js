'use strict';

function renderWatchlist(){
  const box = $('#watchlist');
  box.classList.toggle('editing', state.editing);
  $('#editToggle').textContent = state.editing ? 'Fertig' : 'Bearbeiten';
  $('#editToggle').hidden = !state.watchlist.length;

  if (!state.watchlist.length) {
    box.innerHTML = `<li class="wl-empty">Deine Watchlist ist leer.<br>Suche oben nach einer Aktie.</li>`;
    return;
  }

  box.innerHTML = state.watchlist.map(w => rowHTML(w.symbol, w.name, state.quotes[w.symbol], true)).join('');
}

function rowHTML(symbol, name, q, removable){
  const sym = esc(symbol);
  let quote;
  if (!q) {
    quote = `<span class="sk" style="width:60px;height:15px"></span><span class="sk" style="width:74px;height:21px"></span>`;
  } else if (!q.ok) {
    quote = `<span class="wl-price flat">—</span><span class="wl-badge flat" title="${esc(q.err)}">n/a</span>`;
  } else {
    quote = `<span class="wl-price">${fmtPx(q.price)}</span><span class="wl-badge ${cls(q.pct)}">${fmtPct(q.pct)}</span>`;
  }
  return `<li class="wl-item${symbol === state.selected ? ' active' : ''}" data-sym="${sym}" tabindex="0">
    ${removable ? `<button class="wl-remove" data-del="${sym}" aria-label="${sym} entfernen" tabindex="${state.editing ? 0 : -1}"></button>` : ''}
    <div class="wl-info"><span class="wl-sym">${sym}</span><span class="wl-name" title="${esc(name)}">${esc(name || '')}</span></div>
    <div class="wl-quote">${quote}</div>
  </li>`;
}

function addToWatchlist(sym){
  if (!sym || getItem(sym)) return;
  state.watchlist.push({symbol: sym, name: displayName(sym)});
  saveWatchlist();
  toast(`${sym} zur Watchlist hinzugefügt`, 'ok');
  renderWatchlist();
  renderQuoteHead();
}

async function loadQuote(sym){
  try {
    const res = await limit(() => fetchYahooChart(sym, '1d', '5m'));
    const q = parseQuote(res);
    state.quotes[sym] = {...q, ok: true};
    const it = getItem(sym);
    if (it && q.name && (!it.name || it.name === it.symbol)) { it.name = q.name; saveWatchlist(); }
  } catch (e) {
    if (!state.quotes[sym]?.ok) state.quotes[sym] = {ok: false, err: e.message};
  }
  renderWatchlist();
  if (sym === state.selected) renderQuoteHead();
  if (state.view === 'depot' && getPosition(sym)) scheduleDepotRender();
}
const loadAllQuotes = () => Promise.all([...new Set([
  ...state.watchlist.map(w => w.symbol),
  ...state.depot.map(p => p.symbol),
  ...(state.selected ? [state.selected] : [])
])].map(loadQuote));

async function resolveSymbol(input){
  if (/^[\^A-Za-z0-9.\-=]{1,15}$/.test(input)) {
    const cand = input.toUpperCase();
    try {
      const quote = parseQuote(await fetchYahooChart(cand, '1d', '5m'));
      state.quotes[cand] = {...quote, ok: true};
      return {sym: cand, name: quote.name || cand, quote};
    } catch (e) { if (!e.notFound) console.warn(e); }
  }
  const hits = await searchSymbol(input);
  if (!hits.length) throw new Error(`Kein Wertpapier für „${input}“ gefunden.`);
  const sym = hits[0].symbol.toUpperCase();
  return {sym, name: hits[0].longname || hits[0].shortname || sym, quote: null};
}

async function addSymbol(raw){
  const input = raw.trim();
  if (!input) return;
  const field = $('#addInput'), spin = $('#addSpinner');
  field.disabled = true; spin.hidden = false;
  try {
    const cand = input.toUpperCase();
    if (getItem(cand)) { toast(`${cand} ist bereits in der Watchlist.`); select(cand); return; }
    const {sym, name, quote} = await resolveSymbol(input);
    if (getItem(sym)) { toast(`${sym} ist bereits in der Watchlist.`); select(sym); return; }

    state.watchlist.push({symbol: sym, name: name || sym});
    saveWatchlist();
    if (quote) state.quotes[sym] = {...quote, ok: true};
    field.value = '';
    toast(`${name || sym} hinzugefügt`, 'ok');
    select(sym);
    if (!quote) loadQuote(sym);
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    field.disabled = false; spin.hidden = true;
  }
}

function removeSymbol(sym){
  state.watchlist = state.watchlist.filter(w => w.symbol !== sym);
  delete state.quotes[sym];
  saveWatchlist();
  if (!state.watchlist.length) state.editing = false;
  toast(`${sym} entfernt`);
  if (state.selected === sym) select(state.watchlist[0]?.symbol || null);
  else renderWatchlist();
}

function toggleEditing(){
  state.editing = !state.editing;
  renderWatchlist();
}
