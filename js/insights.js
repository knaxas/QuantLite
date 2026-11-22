'use strict';

const SCAN_STEPS = [
  ['quote',  'Kursdaten laden'],
  ['hist',   'Kurshistorie (2 Jahre) laden'],
  ['de',     'Deutsche Nachrichten durchsuchen'],
  ['en',     'Englische Nachrichten durchsuchen'],
  ['clean',  'Duplikate & veraltete Artikel entfernen'],
  ['score',  'Sentiment analysieren'],
  ['target', 'Kursziel für 6 Monate berechnen']
];

const DISCLAIMER_HTML = `<div class="disclaimer">
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.8 15 14H1L8 1.8Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.5v3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.8" r=".9" fill="currentColor"/></svg>
  <div><strong>Wichtiger Hinweis:</strong> Alle angezeigten Daten, Sentiment-Analysen und Prognosen dienen ausschließlich Informations- und Demonstrationszwecken. Dies stellt keine Anlageberatung, Finanzberatung oder Empfehlung zum Kauf oder Verkauf von Wertpapieren dar.</div>
</div>`;

const ICONS = {
  spark:   '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2.5l1.8 4.7 4.7 1.8-4.7 1.8L10 15.5l-1.8-4.7L3.5 9l4.7-1.8L10 2.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  news:    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="2.5" width="12" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 6h6M5 9h6M5 12h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  bull:    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 11.5 6 7.5l3 3 5-5.5M10 5h4v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bear:    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4.5 6 8.5l3-3 5 5.5M10 11h4V7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  outlook: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.8V8l2.2 1.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  warn:    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1.8 15 14H1L8 1.8Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.5v3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.8" r=".9" fill="currentColor"/></svg>',
  check:   '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="m3.5 8.5 3 3 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cross:   '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  chevron: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

function setStep(sym, id, status, detail = ''){
  (state.scans[sym] ||= {})[id] = {status, detail};
  if (sym === state.selected && state.tab === 'insights') renderForecastPanel();
}

async function analyzeSymbol(sym, step = () => {}){
  step('quote', 'run');
  if (!state.quotes[sym]?.ok) await loadQuote(sym);
  const q = state.quotes[sym];
  step('quote', q?.ok ? 'ok' : 'err', q?.ok ? `${fmtPx(q.price)} ${q.currency || ''}` : 'nicht verfügbar');

  step('hist', 'run');
  const histP = fetchHistory(sym);
  histP.then(() => step('hist', 'ok'), () => step('hist', 'err', 'nicht verfügbar'));

  const name = displayName(sym);
  const queries = newsQueries(name, sym);
  step('de', 'run'); step('en', 'run');
  const [rDe, rEn] = await Promise.allSettled([fetchNews(queries.de, 'de'), fetchNews(queries.en, 'en')]);
  for (const [id, r] of [['de', rDe], ['en', rEn]]) {
    step(id, r.status === 'fulfilled' ? 'ok' : 'err', r.status === 'fulfilled' ? `${r.value.length} Artikel` : 'fehlgeschlagen');
  }
  const all = [...(rDe.value || []), ...(rEn.value || [])];
  if (rDe.status === 'rejected' && rEn.status === 'rejected') throw new Error('Nachrichten nicht erreichbar – bitte später erneut versuchen.');

  step('clean', 'run');
  const {articles} = dedupeArticles(all);
  step('clean', 'ok', `${articles.length} eindeutig`);

  step('score', 'run');
  await sleep(150);
  const A = analyze(articles, sym, name, state.quotes[sym]);
  step('score', 'ok', `${A.score > 0 ? '+' : ''}${A.score}`);

  step('target', 'run');
  try {
    const qNow = state.quotes[sym];
    A.target = computePriceTarget(await histP, qNow?.ok ? qNow.price : null, A.score);
    step('target', 'ok', `${fmtPx(A.target.target)} ${A.target.currency}`);
  } catch (e) {
    A.targetError = e.message;
    step('target', 'err', 'nicht verfügbar');
  }
  state.analyses[sym] = A;
  return A;
}

async function runForecast(sym){
  if (!sym || state.running.has(sym)) return;
  if (state.selected !== sym) select(sym);
  state.running.add(sym);
  state.scans[sym] = {};
  state.tab = 'insights';
  renderQuoteHead();
  renderInsights();

  try {
    const A = await analyzeSymbol(sym, (id, status, detail) => setStep(sym, id, status, detail));
    toast(`Prognose für ${sym}: ${A.label} (${A.score > 0 ? '+' : ''}${A.score})`, 'ok');
  } catch (e) {
    for (const s of Object.values(state.scans[sym] || {})) if (s.status === 'run') s.status = 'err';
    state.analyses[sym] = {error: e.message, ts: new Date()};
    toast('Prognose fehlgeschlagen: ' + e.message, 'err');
  } finally {
    state.running.delete(sym);
    if (sym === state.selected) { renderQuoteHead(); renderInsights(); }
  }
}

function currentAnalysis(){
  const A = state.selected ? state.analyses[state.selected] : null;
  return A && !A.error ? A : null;
}

function renderInsights(){
  const A = currentAnalysis();
  $('#articleCount').textContent = A ? A.articles.length : 0;
  setSeg($('#tabSeg'), b => b.dataset.tab === state.tab);
  const showForecast = state.tab === 'insights';
  $('#tabInsights').hidden = !showForecast;
  $('#tabArticles').hidden = showForecast;
  if (showForecast) renderForecastPanel(); else renderArticles();
}

function switchTab(tab){
  if (tab === state.tab) return;
  state.tab = tab;
  renderInsights();
  const panel = tab === 'insights' ? $('#tabInsights') : $('#tabArticles');
  panel.classList.remove('fade-in'); void panel.offsetWidth; panel.classList.add('fade-in');
}

function renderForecastPanel(){
  const box = $('#tabInsights'), sym = state.selected;
  if (!sym) { box.innerHTML = ''; return; }

  if (state.running.has(sym)) { renderScan(box, sym); return; }

  const A = state.analyses[sym];
  if (!A) {
    box.innerHTML = `<div class="card empty fade-in">
      <div class="empty-icon">${ICONS.spark}</div>
      <h3>Noch keine Prognose</h3>
      <p>Tippe oben auf <strong>„Prognose erstellen“</strong>. QuantLite liest dann alle aktuellen Nachrichten zu ${esc(sym)} und fasst Stimmung, Chancen und Risiken kompakt zusammen.</p>
    </div>`;
    return;
  }
  if (A.error) {
    box.innerHTML = `<div class="card empty fade-in">
      <h3>Prognose fehlgeschlagen</h3>
      <p>${esc(A.error)}</p>
      <button class="text-btn" data-fc="${esc(sym)}">Erneut versuchen</button>
    </div>`;
    return;
  }
  box.innerHTML = resultHTML(A);
}

function renderScan(box, sym){
  const scan = state.scans[sym] || {};
  const done = Object.values(scan).filter(s => s.status === 'ok' || s.status === 'err').length;
  const pct = Math.round(done / SCAN_STEPS.length * 100);
  const steps = SCAN_STEPS.map(([id, label]) => {
    const s = scan[id] || {status: 'wait'};
    const ic = s.status === 'ok' ? ICONS.check : s.status === 'err' ? ICONS.cross : s.status === 'run' ? '<span class="spinner"></span>' : '<span class="ring"></span>';
    return `<li class="step ${s.status}"><span class="step-ic">${ic}</span>${label}${s.detail ? `<span class="step-detail">${esc(s.detail)}</span>` : ''}</li>`;
  }).join('');

  let el = box.querySelector(`.scan[data-sym="${CSS.escape(sym)}"]`);
  if (!el) {
    box.innerHTML = `<div class="card scan fade-in" data-sym="${esc(sym)}">
      <div class="scan-head"><h3>Analysiere ${esc(sym)} …</h3><span class="scan-pct"></span></div>
      <div class="progress"><span></span></div>
      <ul class="steps"></ul>
    </div>`;
    el = box.querySelector('.scan');
  }
  el.querySelector('.steps').innerHTML = steps;
  el.querySelector('.scan-pct').textContent = pct + ' %';
  requestAnimationFrame(() => { el.querySelector('.progress span').style.width = Math.max(4, pct) + '%'; });
}

function resultHTML(A){
  const col = A.score >= 12 ? 'var(--green)' : A.score <= -12 ? 'var(--red)' : 'var(--text)';
  const fillCol = A.score >= 12 ? 'var(--green)' : A.score <= -12 ? 'var(--red)' : 'rgba(235,235,245,.5)';
  const pos = (A.score + 100) / 2;
  const confL = A.confidence >= 65 ? 'hoch' : A.confidence >= 35 ? 'mittel' : 'niedrig';
  const points = summarize(A);

  const mx = Math.max(...A.themes.map(x => x.tot)) || 1;
  const themeRows = A.themes.filter(t => t.tot > 0.3).slice(0, 6).map(t => `
    <div class="theme-row"><span>${THEMES[t.key].name}</span>
      <div class="theme-bar"><span style="width:${t.pos / mx * 100}%;background:var(--green)"></span><span style="width:${t.neg / mx * 100}%;background:var(--red)"></span></div>
      <span class="n">${t.n}×</span></div>`).join('') || '<span class="method">Keine eindeutigen Themen erkannt.</span>';
  const chips = A.keywords.map(k => `<span class="chip ${k.w > 0 ? 'pos' : k.w < 0 ? 'neg' : ''}">${esc(k.term)} ×${k.n}</span>`).join('') || '<span class="method">—</span>';

  const verdictCls = A.score >= 12 ? 'bull' : A.score <= -12 ? 'bear' : 'neu';
  const T = A.target;
  const targetMethod = T
    ? `<p class="method"><strong>Kursziel:</strong> Trend der letzten 2 Jahre ${fmtPct(T.muHist * 100)} p. a., gedämpft auf ${fmtPct(T.muTrend * 100)} p. a. (50 % Trend, 50 % Marktdurchschnitt von 7 %), Sentiment-Neigung ${fmtPct(T.muSent * 100)} p. a., Volatilität ${nf(1).format(T.sigma * 100)} % p. a. Die Spanne entspricht ±1 Standardabweichung (in etwa 2 von 3 Fällen liegt der Kurs historisch darin).</p>`
    : '';

  return `<div class="fade-in" style="display:flex;flex-direction:column;gap:16px">
    <div class="card tldr">
      <div class="tldr-head"><span class="eyebrow">Auf einen Blick</span><span class="article-tag ${verdictCls}">${A.label}</span></div>
      <p class="tldr-text">${esc(quickTake(A))}</p>
    </div>

    <div class="result-grid">
    <div class="card sentiment-card">
      <div class="sent-top">
        <div>
          <div class="eyebrow">Sentiment-Score</div>
          <div class="sent-score" style="color:${col}">${A.score > 0 ? '+' : ''}${A.score}</div>
          <div class="sent-label">${A.label}</div>
        </div>
        <div class="sent-side">
          <div class="eyebrow">Konfidenz</div>
          <div class="sent-conf">${confL} · ${A.confidence} %</div>
          <div class="sent-counts"><span class="up">${A.counts.bull} positiv</span> · <span class="down">${A.counts.bear} negativ</span> · ${A.counts.neu} neutral</div>
        </div>
      </div>
      <div class="meter" role="img" aria-label="Sentiment ${A.score} von -100 bis +100">
        <div class="meter-fill" style="left:${Math.min(50, pos)}%;width:${Math.abs(pos - 50)}%;background:${fillCol};transform-origin:${A.score >= 0 ? 'left' : 'right'}"></div>
        <div class="meter-mid"></div>
        <div class="meter-knob" style="left:${pos}%"></div>
      </div>
      <div class="meter-legend"><span>Bearish</span><span>Neutral</span><span>Bullish</span></div>
    </div>
    ${targetHTML(A)}
    </div>

    <ul class="card points">
      ${points.map(p => `<li class="point">
        <span class="point-ic ${p.kind}">${ICONS[p.kind]}</span>
        <div><h4>${p.title}</h4><p>${esc(p.text)}</p></div>
      </li>`).join('')}
    </ul>

    <details class="card disclosure">
      <summary>Themen, Trigger &amp; Methodik ${ICONS.chevron}</summary>
      <div class="disclosure-body">
        <div><h5>Themen-Radar</h5><div class="themes">${themeRows}</div></div>
        <div><h5>Erkannte Trigger-Begriffe</h5><div class="chips">${chips}</div></div>
        ${targetMethod}
        <p class="method"><strong>Sentiment:</strong> Lexikon-basierte Analyse (${LEX.length} gewichtete DE/EN-Finanzbegriffe inkl. Negationserkennung) über Titel und Beschreibungen, zeitlich gewichtet (Halbwertszeit ≈ 3 Tage). Der Score ist eine Ableitung aus der Nachrichtenlage und keine statistische Wahrscheinlichkeit.</p>
      </div>
    </details>

    ${DISCLAIMER_HTML}
    <div class="fc-meta">Erstellt ${A.ts.toLocaleString('de-DE', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})} ·
      <button class="text-btn" data-fc="${esc(A.sym)}">Aktualisieren</button></div>
  </div>`;
}

function targetHTML(A, title = 'Kursziel in 6 Monaten'){
  const T = A.target;
  if (!T) {
    return `<div class="card target-card">
      <div class="eyebrow">${title}</div>
      <p class="target-na">Nicht verfügbar${A.targetError ? ` – ${esc(A.targetError)}` : ''}.</p>
    </div>`;
  }
  const lo = Math.min(T.low, T.price) * 0.97, hi = Math.max(T.high, T.price) * 1.03;
  const x = v => ((v - lo) / (hi - lo) * 100).toFixed(2);
  const col = T.upside >= 1 ? 'var(--green)' : T.upside <= -1 ? 'var(--red)' : 'var(--text-2)';
  const until = T.date.toLocaleDateString('de-DE', {month: 'long', year: 'numeric'});

  return `<div class="card target-card">
    <div class="eyebrow">${title}</div>
    <div class="target-value">${fmtPx(T.target)}<span class="qh-cur">${esc(T.currency)}</span></div>
    <div class="target-chg" style="color:${col}">${fmtPct(T.upside)} ggü. heute</div>
    <div class="range" role="img" aria-label="Spanne ${fmtPx(T.low)} bis ${fmtPx(T.high)}">
      <div class="range-track">
        <div class="range-band" style="left:${x(T.low)}%;width:${x(T.high) - x(T.low)}%"></div>
        <div class="range-mark now" style="left:${x(T.price)}%" title="Heute ${fmtPx(T.price)}"></div>
        <div class="range-mark goal" style="left:${x(T.target)}%;background:${col}" title="Ziel ${fmtPx(T.target)}"></div>
      </div>
      <div class="range-labels">
        <span>${fmtPx(T.low)}</span>
        <span class="range-legend"><i class="now"></i>Heute <i class="goal" style="background:${col}"></i>Ziel</span>
        <span>${fmtPx(T.high)}</span>
      </div>
    </div>
    <div class="target-foot">Erwartete Spanne bis ${until} · modellbasiert</div>
  </div>`;
}

const LABEL_TXT = {bull: 'Positiv', bear: 'Negativ', neu: 'Neutral'};

function renderArticles(){
  const sym = state.selected, list = $('#articleList'), toolbar = $('#articlesToolbar');

  if (sym && state.running.has(sym)) {
    toolbar.hidden = true;
    list.innerHTML = Array.from({length: 6}, () => `<li><div class="article">
      <span class="article-dot"></span>
      <div class="article-body"><span class="sk" style="width:85%;height:14px"></span><br><span class="sk" style="width:35%;height:11px;margin-top:8px"></span></div>
    </div></li>`).join('');
    return;
  }

  const A = currentAnalysis();
  if (!A) {
    toolbar.hidden = true;
    list.innerHTML = `<li class="empty"><h3>Noch keine Artikel</h3><p>Erstelle zuerst eine Prognose – danach findest du hier alle gescannten Nachrichten.</p></li>`;
    return;
  }

  toolbar.hidden = false;
  setSeg($('#newsFilter'), b => b.dataset.f === state.newsFilter);
  const items = A.articles.filter(a => state.newsFilter === 'all' || a.label === state.newsFilter);
  $('#articlesSummary').textContent = `${items.length} von ${A.articles.length} Artikeln`;

  if (!items.length) {
    list.innerHTML = `<li class="empty"><p>Keine Artikel für diesen Filter.</p></li>`;
    return;
  }
  list.innerHTML = items.map(a => `<li>
    <a class="article" href="${esc(safeUrl(a.link))}" target="_blank" rel="noopener noreferrer">
      <span class="article-dot ${a.label}"></span>
      <div class="article-body">
        <div class="article-title">${esc(a.title)}</div>
        <div class="article-meta">${esc(a.source || 'Unbekannte Quelle')} · <span title="${isNaN(a.date) ? '' : esc(a.date.toLocaleString('de-DE'))}">${relTime(a.date)}</span> · ${a.lang.toUpperCase()}</div>
      </div>
      <span class="article-tag ${a.label}">${LABEL_TXT[a.label]}</span>
    </a>
  </li>`).join('');
}
