'use strict';

const DEPOT_FC_REUSE = 60 * 60 * 1000;
const limitFc = limiter(2);

async function runDepotForecast(){
  if (state.depotFcRun || !state.depot.length) return;
  const positions = [...state.depot];
  const run = state.depotFcRun = {
    done: 0,
    items: positions.map(p => ({symbol: p.symbol, name: p.name, status: 'wait'}))
  };
  renderDepotForecast();

  await Promise.all(positions.map((p, i) => limitFc(async () => {
    const it = run.items[i];
    it.status = 'run';
    renderDepotForecast();
    try {
      const cached = state.analyses[p.symbol];
      const fresh = cached && !cached.error && cached.target && Date.now() - cached.ts < DEPOT_FC_REUSE;
      const A = fresh ? cached : await analyzeSymbol(p.symbol);
      it.status = 'ok';
      it.detail = `${A.score > 0 ? '+' : ''}${A.score}`;
    } catch (e) {
      it.status = 'err';
      it.detail = 'nicht verfügbar';
    }
    run.done++;
    renderDepotForecast();
  })));

  await ensureFx();
  const perPos = positions.map(p => {
    const A = state.analyses[p.symbol];
    if (!A || A.error) return {symbol: p.symbol, ok: false};
    const T = A.target;
    const topBull = A.themes.filter(t => t.pos > 0.6).sort((a, b) => b.pos - a.pos)[0];
    const topBear = A.themes.filter(t => t.neg > 0.6).sort((a, b) => b.neg - a.neg)[0];
    return {
      symbol: p.symbol, ok: true,
      score: A.score, label: A.label, articles: A.articles.length,
      upside: T ? T.upside : null,
      lowPct: T ? (T.low / T.price - 1) * 100 : null,
      highPct: T ? (T.high / T.price - 1) * 100 : null,
      bull: topBull ? THEMES[topBull.key].name : null,
      bear: topBear ? THEMES[topBear.key].name : null
    };
  });

  state.depotForecast = {at: Date.now(), perPos};
  store.set('ql_depot_fc', state.depotForecast);
  state.depotFcRun = null;
  renderDepotForecast();
  toast('Depot-Prognose erstellt', 'ok');
}

const sentimentLabel = s => s >= 40 ? 'Stark Bullish' : s >= 12 ? 'Leicht Bullish' : s > -12 ? 'Neutral' : s > -40 ? 'Leicht Bearish' : 'Stark Bearish';

function positionSignal(r){
  if (r.weight > 0.3) return {label: 'Klumpenrisiko', cls: 'warn', reason: `Macht ${nf(0).format(r.weight * 100)} % des Depots aus – Teilverkauf zur Streuung prüfen.`};
  if (r.fc.score <= -12 && (r.fc.upside ?? 0) < 0) return {label: 'Reduzieren prüfen', cls: 'bear', reason: `Negative Nachrichtenlage${r.fc.bear ? ` (${r.fc.bear})` : ''} und schwaches Modell-Ziel.`};
  if ((r.gainPct ?? 0) >= 50 && r.fc.score < 12) return {label: 'Gewinne sichern prüfen', cls: 'warn', reason: `Bereits ${fmtPct(r.gainPct)} im Plus, Nachrichtenlage ohne Rückenwind.`};
  if (r.fc.score >= 12 && (r.fc.upside ?? 0) >= 5) return {label: 'Aufstocken prüfen', cls: 'bull', reason: `Positive Nachrichten${r.fc.bull ? ` (${r.fc.bull})` : ''} und ${fmtPct(r.fc.upside)} Modell-Potenzial.`};
  if (r.fc.score <= -12) return {label: 'Beobachten', cls: 'neu', reason: `Nachrichtenlage eingetrübt${r.fc.bear ? ` (${r.fc.bear})` : ''}.`};
  return {label: 'Halten', cls: 'neu', reason: 'Keine auffälligen Signale.'};
}

function depotHints(rows, V){
  const hints = [];
  const byWeight = [...rows].sort((a, b) => b.weight - a.weight);
  const top = byWeight[0];
  if (top && top.weight > 0.25 && rows.length > 1) {
    hints.push({kind: 'warn', title: 'Klumpenrisiko', text: `${top.name} macht ${nf(0).format(top.weight * 100)} % deines Depots aus. Fällt diese Position, trifft es das ganze Depot – eine breitere Streuung senkt das Risiko.`});
  }
  const stocks = rows.filter(r => !isCryptoSymbol(r.symbol));
  if (state.depotClass !== 'crypto' && stocks.length > 0 && stocks.length < 5) {
    hints.push({kind: 'outlook', title: 'Wenig Streuung', text: `Nur ${stocks.length} Einzelaktie${stocks.length > 1 ? 'n' : ''}. Ein breiter ETF (z. B. auf den MSCI World) als Basis würde das Einzelrisiko deutlich senken.`});
  }
  if (state.depotClass === 'all') {
    const crypto = rows.filter(r => isCryptoSymbol(r.symbol)).reduce((a, r) => a + r.weight, 0);
    if (crypto > 0.2) hints.push({kind: 'warn', title: 'Hoher Krypto-Anteil', text: `${nf(0).format(crypto * 100)} % deines Depots sind Krypto – das macht den Depotwert deutlich schwankungsanfälliger.`});
  }
  const usd = rows.filter(r => state.quotes[r.symbol]?.currency === 'USD').reduce((a, r) => a + r.weight, 0);
  if (usd > 0.6) hints.push({kind: 'outlook', title: 'Währungsrisiko', text: `${nf(0).format(usd * 100)} % liegen in US-Dollar. Ein schwächerer Dollar senkt deinen Depotwert in Euro – auch wenn die Kurse stabil bleiben.`});
  const neg = rows.filter(r => r.fc.score <= -12).sort((a, b) => a.fc.score - b.fc.score).slice(0, 3);
  if (neg.length) hints.push({kind: 'bear', title: 'Negative Nachrichtenlage', text: `${neg.map(r => r.name).join(', ')} – hier lohnt sich ein genauerer Blick auf die aktuellen Meldungen.`});
  const best = rows.filter(r => (r.fc.upside ?? 0) >= 8 && r.fc.score >= 0).sort((a, b) => b.fc.upside - a.fc.upside).slice(0, 3);
  if (best.length) hints.push({kind: 'bull', title: 'Größtes Potenzial', text: best.map(r => `${r.name} (${fmtPct(r.fc.upside)})`).join(', ') + ' laut Modell in 6 Monaten.'});
  if (!hints.length) hints.push({kind: 'news', title: 'Ausgewogen', text: 'Keine auffälligen Risiken erkannt – Streuung und Nachrichtenlage wirken unauffällig.'});
  return hints.slice(0, 5);
}

function renderDepotForecast(){
  const box = $('#depotForecast');
  if (!box) return;
  const run = state.depotFcRun;

  if (run) {
    const pct = Math.round(run.done / run.items.length * 100);
    box.innerHTML = `<div class="card scan">
      <div class="scan-head"><h3>Analysiere dein Depot …</h3><span>${run.done} / ${run.items.length}</span></div>
      <div class="progress"><span style="width:${Math.max(4, pct)}%"></span></div>
      <ul class="steps">${run.items.map(it => {
        const ic = it.status === 'ok' ? ICONS.check : it.status === 'err' ? ICONS.cross : it.status === 'run' ? '<span class="spinner"></span>' : '<span class="ring"></span>';
        return `<li class="step ${it.status}"><span class="step-ic">${ic}</span>${esc(it.name || it.symbol)}${it.detail ? `<span class="step-detail">${esc(it.detail)}</span>` : ''}</li>`;
      }).join('')}</ul>
    </div>`;
    return;
  }

  const F = state.depotForecast;
  if (!F) {
    box.innerHTML = `<div class="card empty">
      <div class="empty-icon">${ICONS.spark}</div>
      <h3>Depot-Prognose</h3>
      <p>QuantLite analysiert jede Position – Nachrichten, Sentiment und Kursziel – und fasst daraus Ausblick, Risiken und Empfehlungen für dein Depot zusammen.</p>
      <div class="empty-actions"><button class="btn-primary" data-depot-fc>Depot analysieren</button></div>
    </div>`;
    return;
  }

  const V = valuation();
  const fcMap = new Map(F.perPos.map(x => [x.symbol, x]));
  const rows = V.rows.filter(r => r.ok && r.value > 0).map(r => ({...r, weight: r.value / V.total, fc: fcMap.get(r.symbol)}));
  const analysed = rows.filter(r => r.fc?.ok);
  const missing = rows.filter(r => !r.fc?.ok);

  if (!analysed.length) {
    box.innerHTML = `<div class="card empty"><h3>Depot-Prognose</h3><p>Für diese Positionen liegt noch keine Analyse vor.</p>
      <div class="empty-actions"><button class="btn-primary" data-depot-fc>Depot analysieren</button></div></div>`;
    return;
  }

  const wSum = analysed.reduce((a, r) => a + r.weight, 0);
  const score = Math.round(analysed.reduce((a, r) => a + r.weight * r.fc.score, 0) / wSum);
  const label = sentimentLabel(score);
  const proj = key => rows.reduce((a, r) => a + r.value * (1 + ((r.fc?.ok ? r.fc[key] : 0) ?? 0) / 100), 0);
  const expected = proj('upside'), low = proj('lowPct'), high = proj('highPct');
  const date = new Date(); date.setMonth(date.getMonth() + 6);
  const T = {price: V.total, target: expected, low, high, upside: (expected / V.total - 1) * 100, currency: '€', date};

  rows.forEach(r => { if (r.fc?.ok) r.signal = positionSignal(r); });
  const hints = depotHints(analysed, V);
  const counts = {
    bull: analysed.filter(r => r.fc.score >= 12).length,
    bear: analysed.filter(r => r.fc.score <= -12).length
  };
  counts.neu = analysed.length - counts.bull - counts.bear;

  const firstWarn = hints.find(h => h.kind === 'warn' || h.kind === 'bear');
  const scope = state.depotClass === 'all' ? 'deinem Depot' : state.depotClass === 'crypto' ? 'deinen Krypto-Werten' : 'deinen Aktien & ETFs';
  const tldr = `Die Nachrichtenlage zu ${scope} ist ${TONE[label]}. Das Modell erwartet in 6 Monaten rund ${fmtEur(expected)} (${fmtPct(T.upside)}).` +
    (firstWarn ? ` Wichtigster Hinweis: ${firstWarn.title}.` : '');

  const col = score >= 12 ? 'var(--green)' : score <= -12 ? 'var(--red)' : 'var(--text)';
  const fillCol = score >= 12 ? 'var(--green)' : score <= -12 ? 'var(--red)' : 'rgba(235,235,245,.5)';
  const pos = (score + 100) / 2;
  const verdictCls = score >= 12 ? 'bull' : score <= -12 ? 'bear' : 'neu';
  const icon = k => k === 'warn' ? ICONS.warn : ICONS[k];

  box.innerHTML = `<div class="fade-in dp-fc">
    <div class="dp-fc-head">
      <h2>Depot-Prognose</h2>
      <span class="fc-meta">Stand ${new Date(F.at).toLocaleString('de-DE', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})} · <button class="text-btn" data-depot-fc>Aktualisieren</button></span>
    </div>

    <div class="card tldr">
      <div class="tldr-head"><span class="eyebrow">Auf einen Blick</span><span class="article-tag ${verdictCls}">${label}</span></div>
      <p class="tldr-text">${esc(tldr)}</p>
    </div>

    <div class="result-grid">
      <div class="card sentiment-card">
        <div class="sent-top">
          <div>
            <div class="eyebrow">Sentiment (nach Gewicht)</div>
            <div class="sent-score" style="color:${col}">${score > 0 ? '+' : ''}${score}</div>
            <div class="sent-label">${label}</div>
          </div>
          <div class="sent-side">
            <div class="eyebrow">Positionen</div>
            <div class="sent-conf">${analysed.length} analysiert</div>
            <div class="sent-counts"><span class="up">${counts.bull} positiv</span> · <span class="down">${counts.bear} negativ</span> · ${counts.neu} neutral</div>
          </div>
        </div>
        <div class="meter">
          <div class="meter-fill" style="left:${Math.min(50, pos)}%;width:${Math.abs(pos - 50)}%;background:${fillCol};transform-origin:${score >= 0 ? 'left' : 'right'}"></div>
          <div class="meter-mid"></div>
          <div class="meter-knob" style="left:${pos}%"></div>
        </div>
        <div class="meter-legend"><span>Bearish</span><span>Neutral</span><span>Bullish</span></div>
      </div>
      ${targetHTML({target: T}, 'Depotwert in 6 Monaten')}
    </div>

    <div class="card">
      <div class="dp-card-head card-pad"><h2>Empfehlungen</h2></div>
      <ul class="points points-flush">
        ${hints.map(h => `<li class="point"><span class="point-ic ${h.kind}">${icon(h.kind)}</span><div><h4>${esc(h.title)}</h4><p>${esc(h.text)}</p></div></li>`).join('')}
      </ul>
    </div>

    <div class="card dp-card">
      <div class="dp-card-head"><h2>Positionen im Check</h2></div>
      <ul class="dp-list">
        ${[...rows].sort((a, b) => b.weight - a.weight).map(r => `
          <li class="dp-row fc-row" data-pos="${esc(r.symbol)}" tabindex="0">
            <span class="dp-avatar" style="background:${r.color}">${esc(initials(r.name, r.symbol))}</span>
            <div class="dp-info">
              <span class="dp-name">${esc(r.name || r.symbol)}</span>
              <span class="dp-sub">${r.fc?.ok
                ? `Anteil ${nf(1).format(r.weight * 100)} % · Sentiment ${r.fc.score > 0 ? '+' : ''}${r.fc.score} · Ziel ${r.fc.upside != null ? fmtPct(r.fc.upside) : '—'}`
                : `Anteil ${nf(1).format(r.weight * 100)} % · noch nicht analysiert`}</span>
              ${r.signal ? `<span class="fc-reason">${esc(r.signal.reason)}</span>` : ''}
            </div>
            ${r.signal ? `<span class="article-tag ${r.signal.cls}">${r.signal.label}</span>` : ''}
          </li>`).join('')}
      </ul>
      ${missing.length ? `<p class="method card-pad">${missing.length} Position${missing.length > 1 ? 'en wurden' : ' wurde'} nach der letzten Analyse hinzugefügt – „Aktualisieren“ bezieht sie ein.</p>` : ''}
    </div>

    ${DISCLAIMER_HTML}
    <p class="method">Signale sind regelbasiert aus Nachrichten-Sentiment, Modell-Kursziel, Gewichtung und Buchgewinn abgeleitet. Die Spanne addiert die Einzelspannen (Positionen bewegen sich in der Realität nicht alle gleichzeitig ins Extrem).</p>
  </div>`;
}
