'use strict';

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

function parseCsv(text){
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';'
    : (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f.trim())) rows.push(row);
  return rows;
}

const norm = s => String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

function detectColumns(rows){
  const head = rows[0].map(norm);
  const looksLikeData = /^\d{4}-\d{2}-\d{2}/.test(rows[0][0] || '');
  if (looksLikeData) {
    return {hasHeader: false, type: [3, 4], asset: 5, name: 6, id: 7, qty: 8, price: 9, amount: 10, fee: 11, buy: -1};
  }
  const find = re => head.findIndex(h => re.test(h));
  const findAll = re => head.map((h, i) => re.test(h) ? i : -1).filter(i => i >= 0);
  return {
    hasHeader: true,
    type:   findAll(/^(type|typ|subtype|sub_type|category|kategorie|transaction_type|transaktionstyp|art|group|vorgang)$/),
    asset:  find(/^(asset_class|asset_type|anlageklasse|assetclass)$/),
    name:   find(/^(name|instrument|instrument_name|wertpapier|bezeichnung|asset_name|titel|security)$/),
    id:     [find(/^isin$/), find(/^(symbol|ticker|wkn|instrument_id|asset_id|kennung)$/)].find(i => i >= 0) ?? -1,
    qty:    find(/^(shares|quantity|qty|stück|stueck|stk|anzahl|units|menge|nominale)$/),
    price:  find(/^(price|kurs|preis|price_per_share|unit_price|ausführungskurs)$/),
    amount: find(/^(amount|betrag|total|net_amount|gesamtbetrag|wert)$/),
    fee:    find(/^(fee|fees|gebühr|gebühren|gebuehr|kosten|commission)$/),
    buy:    find(/(kaufkurs|einstand|buy_price|avg_price|average_price|durchschnitt|purchase_price|ø_kaufkurs)/)
  };
}

const cell = (row, i) => i >= 0 && i < row.length ? String(row[i]).trim() : '';
const num = s => { const v = parseNum(s); return isNaN(v) ? null : v; };

function classify(typeText, qty, amount){
  const t = typeText.toUpperCase();
  if (/SPLIT|DIVIDEND|INTEREST|ZINS|CARD|KARTE|DEPOSIT|EINZAHLUNG|WITHDRAW|AUSZAHLUNG|TAX|STEUER|PAYPAL|FEE$/.test(t)) return 'skip';
  if (/SELL|VERKAUF/.test(t)) return 'sell';
  if (/BUY|KAUF|SAVINGS|SPARPLAN|PURCHASE|ORDER|FREE_RECEIPT|SAVEBACK|ROUND_?UP|BONUS|EINBUCHUNG|TRANSFER_IN|DELIVERY_IN/.test(t)) return 'buy';
  if (qty == null || qty === 0) return 'skip';
  if (qty < 0 || (amount != null && amount > 0 && /DELIVERY|TRADE|HANDEL/.test(t))) return 'sell';
  return 'buy';
}

function buildPositions(rows){
  const col = detectColumns(rows);
  const data = col.hasHeader ? rows.slice(1) : rows;
  const map = new Map();
  const stats = {rows: data.length, used: 0, skipped: 0, sells: 0};
  const positionList = col.buy >= 0 && !col.type.length;

  for (const r of data) {
    const id = cell(r, col.id).toUpperCase();
    const qtyRaw = num(cell(r, col.qty));
    if (!id || qtyRaw == null || qtyRaw === 0) { stats.skipped++; continue; }
    const typeText = col.type.map(i => cell(r, i)).join(' ');
    const asset = cell(r, col.asset).toUpperCase();
    const price = num(cell(r, col.price));
    const amount = num(cell(r, col.amount));
    const fee = Math.abs(num(cell(r, col.fee)) || 0);
    const qty = Math.abs(qtyRaw);

    const p = map.get(id) || {id, isin: ISIN_RE.test(id) ? id : null, name: cell(r, col.name), shares: 0, cost: 0, crypto: asset === 'CRYPTO'};
    if (!p.name) p.name = cell(r, col.name);

    if (positionList) {
      const buy = num(cell(r, col.buy)) ?? price ?? 0;
      p.cost += qty * buy; p.shares += qty;
    } else {
      const kind = classify(typeText, qtyRaw, amount);
      if (kind === 'skip') { stats.skipped++; continue; }
      if (kind === 'sell') {
        const sold = Math.min(qty, p.shares);
        if (p.shares > 0) p.cost *= (p.shares - sold) / p.shares;
        p.shares -= sold;
        stats.sells++;
      } else {
        const value = amount != null && amount !== 0 ? Math.abs(amount) : (price != null ? qty * price : 0);
        p.cost += value + fee;
        p.shares += qty;
      }
    }
    stats.used++;
    map.set(id, p);
  }
  const positions = [...map.values()].filter(p => p.shares > 1e-9);
  return {positions, stats, hasHeader: col.hasHeader, idFound: col.id >= 0 || !col.hasHeader};
}

async function resolveImportSymbol(p){
  if (p.crypto) {
    const sym = `${p.id}-EUR`;
    const q = parseQuote(await fetchYahooChart(sym, '1d', '15m'));
    return {sym, name: p.name || q.name || sym};
  }
  if (p.isin) {
    const hits = await searchSymbol(p.isin);
    if (!hits.length) throw new Error('ISIN nicht gefunden');
    return {sym: hits[0].symbol.toUpperCase(), name: p.name || hits[0].longname || hits[0].shortname};
  }
  const r = await resolveSymbol(p.id);
  return {sym: r.sym, name: p.name || r.name};
}

let importState = null;

async function handleImportFile(file){
  if (!file) return;
  const dlg = $('#importDialog');
  const body = $('#importBody');
  body.innerHTML = `<div class="import-loading"><span class="spinner"></span> Lese ${esc(file.name)} …</div>`;
  $('#importConfirm').disabled = true;
  dlg.showModal();

  try {
    const rows = parseCsv(await file.text());
    if (rows.length < 1) throw new Error('Die Datei ist leer.');
    const {positions, stats, idFound} = buildPositions(rows);
    if (!idFound) throw new Error('Keine Spalte mit ISIN, Symbol oder Ticker gefunden.');
    if (!positions.length) throw new Error(`Keine offenen Positionen erkannt (${stats.rows} Zeilen gelesen). Enthält die Datei Käufe?`);

    importState = {
      positions: positions.map(p => ({...p, status: 'pending', include: true})), stats,
      mode: state.depot.length ? 'merge' : 'replace'
    };
    renderImportPreview();

    await Promise.all(importState.positions.map(p => limit(async () => {
      try {
        const r = await resolveImportSymbol(p);
        p.sym = r.sym; p.name = r.name; p.status = 'ok';
        state.names[r.sym] ||= r.name;
      } catch (e) {
        p.status = 'err'; p.include = false; p.error = e.message;
      }
      renderImportPreview();
    })));
  } catch (e) {
    body.innerHTML = `<p class="import-error">${esc(e.message)}</p>
      <p class="method">Erwartet wird der Trade-Republic-Transaktionsexport (CSV) oder eine Liste mit den Spalten <code>ISIN</code>, <code>Stück</code>, <code>Kaufkurs</code>.</p>`;
  }
}

function renderImportPreview(){
  const S = importState;
  if (!S) return;
  const done = S.positions.every(p => p.status !== 'pending');
  const ok = S.positions.filter(p => p.status === 'ok' && p.include);
  $('#importConfirm').disabled = !done || !ok.length;
  $('#importConfirm').textContent = ok.length ? `${ok.length} Position${ok.length > 1 ? 'en' : ''} übernehmen` : 'Übernehmen';

  $('#importBody').innerHTML = `
    <p class="method">${S.stats.used} Transaktionen verrechnet${S.stats.sells ? ` (davon ${S.stats.sells} Verkäufe)` : ''}, ${S.stats.skipped} übersprungen (Dividenden, Zahlungen, Gebühren …). Ø-Kaufkurse inkl. Gebühren.</p>
    <ul class="import-list">
      ${S.positions.map((p, i) => `
        <li class="import-row ${p.status}">
          <input type="checkbox" data-import-toggle="${i}" ${p.include ? 'checked' : ''} ${p.status !== 'ok' ? 'disabled' : ''} aria-label="${esc(p.name || p.id)} übernehmen">
          <div class="import-info">
            <span class="dp-name">${esc(p.name || p.id)}</span>
            <span class="dp-sub">${esc(p.id)}${p.sym && p.sym !== p.id ? ` → ${esc(p.sym)}` : ''}${p.status === 'pending' ? ' · suche …' : ''}${p.status === 'err' ? ` · <span class="down">${esc(p.error)}</span>` : ''}</span>
          </div>
          <div class="dp-val">
            <span class="dp-value">${nf(p.shares % 1 ? 4 : 0).format(p.shares)} Stk.</span>
            <span class="dp-sub">Ø ${fmtEur(p.cost / p.shares)}</span>
          </div>
        </li>`).join('')}
    </ul>
    <div class="import-mode">
      <label><input type="radio" name="importMode" value="replace" ${S.mode === 'replace' ? 'checked' : ''}> Depot ersetzen</label>
      <label><input type="radio" name="importMode" value="merge" ${S.mode === 'merge' ? 'checked' : ''}> Zum bestehenden Depot hinzufügen</label>
    </div>`;
  $$('input[name="importMode"]').forEach(r => r.onchange = () => { S.mode = r.value; });
}

function confirmImport(){
  const S = importState;
  if (!S) return;
  const mode = S.mode;
  const chosen = S.positions.filter(p => p.status === 'ok' && p.include);
  if (mode === 'replace') state.depot = [];
  for (const p of chosen) {
    const buy = p.cost / p.shares;
    const existing = getPosition(p.sym);
    if (existing) {
      existing.buy = (existing.shares * existing.buy + p.shares * buy) / (existing.shares + p.shares);
      existing.shares += p.shares;
    } else {
      state.depot.push({symbol: p.sym, name: p.name, shares: p.shares, buy});
    }
  }
  saveDepot();
  importState = null;
  $('#importDialog').close();
  toast(`${chosen.length} Positionen importiert`, 'ok');
  if (state.view !== 'depot') setView('depot'); else loadDepot();
}
