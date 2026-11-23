'use strict';

const LEX = [
  ['rekordumsatz',3,'earn'],['rekordgewinn',3,'earn'],['rekordquartal',3,'earn'],['rekord*',2.2,'earn'],['record revenue',3,'earn'],['record profit',3,'earn'],['record',1.8,'earn'],
  ['übertrifft',2.5,'earn'],['übertroffen',2.5,'earn'],['übertreffen',2.2,'earn'],['schlägt erwartungen',2.8,'earn'],['erwartungen geschlagen',2.8,'earn'],
  ['beats',2.3,'earn'],['beat',2,'earn'],['beating',2,'earn'],['tops estimates',2.6,'earn'],['top estimates',2.4,'earn'],['exceeds',2,'earn'],['exceeded',2,'earn'],['better-than-expected',2.4,'earn'],['better than expected',2.4,'earn'],
  ['hebt prognose',2.8,'earn'],['prognose angehoben',2.8,'earn'],['prognoseerhöhung',2.8,'earn'],['raises guidance',2.8,'earn'],['raises outlook',2.8,'earn'],['raised guidance',2.6,'earn'],['raises forecast',2.6,'earn'],['boosts forecast',2.6,'earn'],
  ['gewinnsprung',2.6,'earn'],['umsatzsprung',2.4,'earn'],['umsatzplus',2,'earn'],['gewinnplus',2,'earn'],['profit jumps',2.4,'earn'],['revenue jumps',2.2,'earn'],
  ['gewinnwarnung',-3.5,'earn'],['profit warning',-3.5,'earn'],['senkt prognose',-2.8,'earn'],['prognose gesenkt',-2.8,'earn'],['kappt prognose',-3,'earn'],
  ['lowers guidance',-2.8,'earn'],['cuts guidance',-2.8,'earn'],['cuts outlook',-2.8,'earn'],['cuts forecast',-2.6,'earn'],['weak guidance',-2.5,'earn'],['lowered guidance',-2.6,'earn'],
  ['verfehlt',-2.3,'earn'],['verfehlen',-2,'earn'],['misses',-2.3,'earn'],['missed',-2,'earn'],['miss',-1.8,'earn'],['worse-than-expected',-2.4,'earn'],['worse than expected',-2.4,'earn'],
  ['enttäusch*',-2,'earn'],['disappoint*',-2,'earn'],['umsatzrückgang',-2,'earn'],['gewinnrückgang',-2,'earn'],['gewinneinbruch',-2.8,'earn'],['revenue decline',-2,'earn'],
  ['verlust*',-1.7,'earn'],['loss',-1.4,'earn'],['losses',-1.5,'earn'],['gewinn',0.9,'earn'],['profit',0.8,'earn'],['profitab*',1,'earn'],
  ['strong buy',3,'analyst'],['kaufempfehlung',2.5,'analyst'],['kaufen',1.2,'analyst'],['buy rating',2.2,'analyst'],['buy',1.2,'analyst'],
  ['upgrade*',2.5,'analyst'],['hochgestuft',2.5,'analyst'],['hochstufung',2.5,'analyst'],['stuft hoch',2.5,'analyst'],
  ['outperform',2,'analyst'],['overweight',1.8,'analyst'],['übergewichten',1.8,'analyst'],['übergewicht',1.5,'analyst'],
  ['kursziel erhöht',2.2,'analyst'],['hebt kursziel',2.2,'analyst'],['erhöht kursziel',2.2,'analyst'],['kursziel angehoben',2.2,'analyst'],
  ['raises price target',2.2,'analyst'],['price target raised',2.2,'analyst'],['boosts price target',2.2,'analyst'],['lifts price target',2.2,'analyst'],
  ['downgrade*',-2.5,'analyst'],['abgestuft',-2.5,'analyst'],['herabgestuft',-2.5,'analyst'],['abstufung',-2.5,'analyst'],['stuft ab',-2.5,'analyst'],
  ['underperform',-2,'analyst'],['underweight',-1.8,'analyst'],['untergewichten',-1.8,'analyst'],['verkaufsempfehlung',-2.5,'analyst'],
  ['sell rating',-2.2,'analyst'],['sell',-1.2,'analyst'],['verkaufen',-1.1,'analyst'],
  ['senkt kursziel',-2.2,'analyst'],['kursziel gesenkt',-2.2,'analyst'],['cuts price target',-2.2,'analyst'],['lowers price target',-2.2,'analyst'],['price target cut',-2.2,'analyst'],
  ['milliardenauftrag',2.8,'growth'],['großauftrag',2.6,'growth'],['rekordauftrag',3,'growth'],['auftrag',1.4,'growth'],['aufträge',1.4,'growth'],['contract win',2,'growth'],['wins contract',2,'growth'],['contract',0.9,'growth'],
  ['wachstum',1.4,'growth'],['wächst',1.4,'growth'],['wachsen',1.2,'growth'],['growth',1.2,'growth'],['grows',1.2,'growth'],['expand*',1,'growth'],['expansion',1.2,'growth'],
  ['partnerschaft',1.3,'growth'],['partnership',1.3,'growth'],['kooperation',1,'growth'],['collaboration',1,'growth'],['übernahme',0.6,'growth'],['acquisition',0.6,'growth'],['deal',0.8,'growth'],
  ['durchbruch',2,'growth'],['breakthrough',2,'growth'],['launch*',0.8,'growth'],['startet',0.6,'growth'],['nachfrage',0.6,'growth'],['demand',0.6,'growth'],['strong demand',2,'growth'],['starke nachfrage',2,'growth'],
  ['accelerat*',1.3,'growth'],['beschleunig*',1.2,'growth'],['innovation*',1,'growth'],
  ['verzöger*',-1.4,'growth'],['delay*',-1.4,'growth'],['rückruf*',-1.8,'growth'],['recall*',-1.8,'growth'],['nachfrageschwäche',-2.2,'growth'],['weak demand',-2.2,'growth'],['slowing demand',-2,'growth'],
  ['stellenabbau',-1.4,'growth'],['entlassung*',-1.4,'growth'],['layoff*',-1.4,'growth'],['job cuts',-1.4,'growth'],['outage',-1.5,'growth'],['panne',-1.4,'growth'],['produktionsstopp',-2,'growth'],
  ['ai boom',2.5,'ai'],['ki-boom',2.5,'ai'],['ki boom',2.5,'ai'],['ai demand',2.2,'ai'],['ki-nachfrage',2.2,'ai'],['ai rally',2.3,'ai'],['ai chips',1,'ai'],['ki-chips',1,'ai'],['ai-chips',1,'ai'],
  ['ai bubble',-2,'ai'],['ki-blase',-2,'ai'],['ai spending',0.8,'ai'],['data center',0.6,'ai'],['rechenzentr*',0.6,'ai'],
  ['zulassung',1.5,'legal'],['approval',1.5,'legal'],['approved',1.5,'legal'],['genehmigt',1.3,'legal'],['einigung',1,'legal'],['settlement',0.6,'legal'],
  ['klage*',-2,'legal'],['verklagt',-2,'legal'],['lawsuit*',-2,'legal'],['sued',-2,'legal'],['sues',-1.7,'legal'],['class action',-2.2,'legal'],['sammelklage',-2.2,'legal'],
  ['regulierung',-1.2,'legal'],['regulat*',-1,'legal'],['antitrust',-1.8,'legal'],['kartell*',-1.5,'legal'],['wettbewerbshüter',-1.5,'legal'],
  ['probe',-1.5,'legal'],['investigation',-1.6,'legal'],['ermittlung*',-1.8,'legal'],['untersuchung',-1.3,'legal'],['strafe',-1.8,'legal'],['geldstrafe',-2,'legal'],['penalty',-1.8,'legal'],['fined',-1.8,'legal'],
  ['fraud',-3,'legal'],['betrug',-3,'legal'],['skandal',-2.5,'legal'],['scandal',-2.5,'legal'],['subpoena',-2,'legal'],
  ['zölle',-1.3,'macro'],['zoll*',-1,'macro'],['tariff*',-1.3,'macro'],['sanktion*',-1.5,'macro'],['sanction*',-1.5,'macro'],['export ban',-2,'macro'],['exportverbot',-2,'macro'],['export restrictions',-1.8,'macro'],['exportbeschränkung*',-1.8,'macro'],
  ['rezession',-2,'macro'],['recession',-2,'macro'],['inflation',-0.6,'macro'],['zinssenkung',1.2,'macro'],['rate cut',1.2,'macro'],['zinserhöhung',-1,'macro'],['rate hike',-1,'macro'],['handelskrieg',-2,'macro'],['trade war',-2,'macro'],
  ['allzeithoch',2.5,'price'],['all-time high',2.5,'price'],['record high',2.5,'price'],['rekordhoch',2.5,'price'],['jahreshoch',1.8,'price'],
  ['kurssprung',2.5,'price'],['kursfeuerwerk',2.5,'price'],['rallye',2,'price'],['rally*',2,'price'],['haussier*',2,'price'],['surge*',2.2,'price'],['soar*',2.2,'price'],['skyrocket*',2.4,'price'],
  ['jump*',1.5,'price'],['springt',1.6,'price'],['klettert',1.3,'price'],['climb*',1.2,'price'],['steigt',1.2,'price'],['steigen',1.1,'price'],['zieht an',1.2,'price'],['legt zu',1.3,'price'],
  ['gains',1.2,'price'],['gain',0.9,'price'],['rises',1.1,'price'],['higher',0.7,'price'],['höher',0.7,'price'],['erholung',1.2,'price'],['erholt',1.2,'price'],['rebound*',1.3,'price'],['upside',1.4,'price'],['outperform*',1.5,'price'],
  ['bullish',2,'price'],['plus',0.6,'price'],['breakout',1.6,'price'],['ausbruch',1.2,'price'],
  ['crash*',-3,'price'],['absturz',-3,'price'],['stürzt',-2.6,'price'],['abgestürzt',-2.6,'price'],['einbruch',-2.5,'price'],['bricht ein',-2.5,'price'],['brechen ein',-2.5,'price'],['kurseinbruch',-2.8,'price'],
  ['plunge*',-2.8,'price'],['tumble*',-2.5,'price'],['slump*',-2.2,'price'],['sink*',-1.5,'price'],['sinkt',-1.4,'price'],['fällt',-1.4,'price'],['fallen',-1.2,'price'],['falls',-1.3,'price'],['fall',-1,'price'],
  ['drop*',-1.5,'price'],['slide*',-1.3,'price'],['decline*',-1.3,'price'],['rückgang',-1.4,'price'],['verliert',-1.5,'price'],['verluste',-1.5,'price'],['loses',-1.5,'price'],['tanks',-2.5,'price'],
  ['selloff',-2.2,'price'],['sell-off',-2.2,'price'],['ausverkauf',-2,'price'],['korrektur',-1.3,'price'],['correction',-1.2,'price'],['gewinnmitnahme*',-1,'price'],['profit-taking',-1,'price'],
  ['jahrestief',-2,'price'],['52-week low',-2,'price'],['tiefststand',-2,'price'],['lower',-0.7,'price'],['niedriger',-0.7,'price'],['bearish',-2,'price'],['minus',-0.8,'price'],
  ['aktienrückkauf',1.6,'capital'],['rückkauf*',1.5,'capital'],['buyback*',1.6,'capital'],['share repurchase',1.6,'capital'],['dividendenerhöhung',1.8,'capital'],['erhöht dividende',1.8,'capital'],['dividend hike',1.8,'capital'],['raises dividend',1.8,'capital'],['dividende',0.6,'capital'],['dividend',0.5,'capital'],['aktiensplit',1,'capital'],['stock split',1,'capital'],
  ['kapitalerhöhung',-1.6,'capital'],['verwässer*',-1.5,'capital'],['dilution',-1.5,'capital'],['insider selling',-1.2,'capital'],['insiderverk*',-1.2,'capital'],['dividendenkürzung',-2.2,'capital'],['cuts dividend',-2.2,'capital'],
  ['insolvenz',-3.5,'capital'],['bankrupt*',-3.5,'capital'],['default',-2,'capital'],
  ['optimis*',1.5,'mood'],['zuversicht*',1.5,'mood'],['confident',1.2,'mood'],['confidence',1,'mood'],['stark',0.9,'mood'],['starke',0.9,'mood'],['stärker',1,'mood'],['strong',1,'mood'],['stronger',1.1,'mood'],['robust',1.1,'mood'],['solide',0.9,'mood'],['boost*',1.2,'mood'],['momentum',0.8,'mood'],['chancen',0.8,'mood'],['potenzial',0.7,'mood'],['potential',0.5,'mood'],['top pick',2,'mood'],['favorit',1,'mood'],['favorite',1,'mood'],
  ['warnung',-2,'mood'],['warnt',-1.8,'mood'],['warns',-1.8,'mood'],['warning',-1.8,'mood'],['risiko',-0.8,'mood'],['risiken',-0.8,'mood'],['risk',-0.7,'mood'],['risks',-0.8,'mood'],
  ['sorge*',-1.3,'mood'],['concern*',-1.3,'mood'],['fears',-1.5,'mood'],['fear',-1.2,'mood'],['angst',-1.5,'mood'],['befürcht*',-1.4,'mood'],['unsicherheit',-1.2,'mood'],['uncertainty',-1.2,'mood'],
  ['schwach*',-1.3,'mood'],['weak',-1.4,'mood'],['weaker',-1.4,'mood'],['weakness',-1.4,'mood'],['bubble',-1.5,'mood'],['blase',-1.5,'mood'],['overvalued',-1.6,'mood'],['überbewertet',-1.6,'mood'],
  ['short seller',-2,'mood'],['leerverkäufer',-2,'mood'],['pessimis*',-1.5,'mood'],['turbulen*',-1.2,'mood'],['volatil*',-0.4,'mood'],['hack*',-1.5,'mood'],['cyberangriff',-1.8,'mood'],
  ['rücktritt',-1.2,'mood'],['resigns',-1.2,'mood'],['steps down',-1,'mood'],['abschwung',-1.6,'mood'],['downturn',-1.6,'mood'],['krise',-1.8,'mood'],['crisis',-1.8,'mood'],['headwind*',-1.3,'mood'],['gegenwind',-1.3,'mood'],['tailwind*',1.3,'mood'],['rückenwind',1.3,'mood']
];

const THEMES = {
  earn:    {name: 'Zahlen & Guidance',   bull: 'Starke Quartalszahlen bzw. eine angehobene Prognose könnten weitere Aufwärtsrevisionen der Gewinnschätzungen auslösen.', bear: 'Verfehlte Erwartungen oder eine gesenkte Guidance könnten Abwärtsrevisionen und eine niedrigere Bewertung nach sich ziehen.'},
  analyst: {name: 'Analysten-Ratings',   bull: 'Hochstufungen und steigende Kursziele können zusätzliches institutionelles Kaufinteresse anziehen.', bear: 'Herabstufungen bzw. gesenkte Kursziele könnten Verkaufsdruck durch Fonds auslösen.'},
  growth:  {name: 'Wachstum & Geschäft', bull: 'Neue Aufträge, Partnerschaften und solides Nachfragewachstum stützen die Wachstumsstory.', bear: 'Nachlassende Nachfrage, Verzögerungen oder Stellenabbau könnten die Wachstumsstory in Frage stellen.'},
  ai:      {name: 'KI & Technologie',    bull: 'Anhaltender KI-/Technologie-Rückenwind könnte die Bewertung und Umsatzdynamik weiter stützen.', bear: 'Zweifel an der Nachhaltigkeit des KI-Booms (Blasen-Debatte) könnten Gewinnmitnahmen begünstigen.'},
  legal:   {name: 'Recht & Regulierung', bull: 'Zulassungen oder beigelegte Verfahren könnten Unsicherheit abbauen.', bear: 'Klagen, Ermittlungen oder neue Regulierung bleiben ein Überhang-Risiko für die Aktie.'},
  macro:   {name: 'Makro & Politik',     bull: 'Ein entspannteres Makroumfeld (Zinsen, Handelspolitik) könnte Rückenwind liefern.', bear: 'Zölle, Sanktionen, Exportbeschränkungen oder Rezessionssorgen könnten Markt und Aktie belasten.'},
  price:   {name: 'Kursbewegung',        bull: 'Positives Kursmomentum (Rallye, neue Hochs) kann Trendfolger und Momentum-Fonds anziehen.', bear: 'Deutliche Kursverluste könnten technische Verkaufssignale und Stop-Loss-Kaskaden auslösen.'},
  capital: {name: 'Kapitalmaßnahmen',    bull: 'Aktienrückkäufe oder Dividendenerhöhungen signalisieren Vertrauen des Managements.', bear: 'Kapitalerhöhungen, Dividendenkürzungen oder Insider-Verkäufe könnten belasten.'},
  mood:    {name: 'Marktstimmung',       bull: 'Eine optimistische Grundstimmung und Rückenwind-Narrative stützen die Aktie.', bear: 'Sorgen, Unsicherheit und Bewertungsdebatten könnten die Volatilität erhöhen.'}
};

const OUTLOOK = {
  'Stark Bullish':  'Die Nachrichtenlage spricht für anhaltendes Kaufinteresse – bei sehr einseitiger Stimmung steigt jedoch das Risiko von „Sell the News“-Reaktionen.',
  'Leicht Bullish': 'Ein leicht positives Szenario überwiegt. Neue Katalysatoren wie Zahlen oder Analystenkommentare dürften über die Richtung entscheiden.',
  'Neutral':        'Kein klares Richtungssignal – die Aktie dürfte eher dem Gesamtmarkt und technischen Marken folgen.',
  'Leicht Bearish': 'Leicht negative Risiken überwiegen. Eine Stabilisierung setzt voraussichtlich positive Gegen-Nachrichten voraus.',
  'Stark Bearish':  'Die negative Nachrichtenlage belastet. Bei stark überverkaufter Stimmung sind jedoch auch technische Gegenbewegungen möglich.'
};

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LEXC = LEX.map(([t, w, th]) => {
  const prefix = t.endsWith('*');
  const core = reEsc(prefix ? t.slice(0, -1) : t).replace(/\s+/g, '\\s+');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${core}${prefix ? '[\\p{L}\\p{N}-]*' : '(?![\\p{L}\\p{N}])'}`, 'giu');
  return {t: t.replace('*', ''), w, th, re, len: core.length};
}).sort((a, b) => b.len - a.len);

const NEG_RE = /(?:^|\s)(?:not|no|never|without|nicht|kein|keine|keinen|keiner|ohne|kaum|fails? to|didn't|doesn't|won't)\s+(?:\S+\s+)?$/i;

function scoreText(text){
  let s = ' ' + (text || '').toLowerCase() + ' ';
  let total = 0; const hits = [];
  for (const c of LEXC) {
    c.re.lastIndex = 0;
    s = s.replace(c.re, (m, off, str) => {
      const neg = NEG_RE.test(str.slice(Math.max(0, off - 28), off));
      const w = neg ? -c.w * 0.6 : c.w;
      total += w; hits.push({term: c.t, w, th: c.th});
      return ' '.repeat(m.length);
    });
  }
  return {total, hits};
}

const GENERIC_WORDS = new Set(['deutsche', 'international', 'interactive', 'technologies', 'technology', 'systems', 'holding', 'holdings',
  'global', 'american', 'energy', 'financial', 'services', 'motors', 'industries', 'software', 'entertainment', 'communications',
  'company', 'bank', 'world', 'core', 'group', 'aktie', 'stock', 'class', 'the', 'and', 'und', 'msci', 'index', 'crypto', 'coin']);
const IRRELEVANT_WEIGHT = 0.3;
const SCORE_SHRINK = 6;

function relevanceKeys(name, sym){
  const keys = new Set();
  const base = sym.split(/[.\-=]/)[0].replace(/^\^/, '').toLowerCase();
  if (base.length >= 2 && !/^\d+$/.test(base)) keys.add(base);
  const source = isCryptoSymbol(sym) ? (name || '').replace(/\b(EUR|USD|USDT)\b/gi, '')
    : isFund(name, sym) ? fundTopic(name) : cleanCompanyName(name, sym);
  const clean = source.toLowerCase().replace(/\s+/g, ' ').trim();
  if (clean.length >= 3) keys.add(clean);
  for (const word of clean.split(/[\s\-&]+/)) {
    if (word.length >= 4 && !GENERIC_WORDS.has(word)) keys.add(word);
  }
  return [...keys];
}

function mentions(text, keys){
  const t = ' ' + text.toLowerCase() + ' ';
  return keys.some(k => new RegExp(`(?<![\\p{L}\\p{N}])${reEsc(k)}(?![\\p{L}\\p{N}])`, 'u').test(t));
}

function analyze(articles, sym, name, quote){
  const now = Date.now();
  const themeAgg = {}; const kw = {};
  const keys = relevanceKeys(name, sym);
  let bullW = 0, bearW = 0, neuW = 0, recentSum = 0, recentW = 0, olderSum = 0, olderW = 0, effective = 0;

  for (const a of articles) {
    const t = scoreText(a.title), d = scoreText(a.desc);
    const raw = t.total + 0.5 * d.total;
    a.raw = raw;
    a.norm = Math.tanh(raw / 2.5);
    a.label = a.norm > 0.18 ? 'bull' : a.norm < -0.18 ? 'bear' : 'neu';
    a.hits = [...t.hits, ...d.hits];
    a.relevant = !keys.length || mentions(a.title + ' ' + a.desc, keys);
    const rel = a.relevant ? 1 : IRRELEVANT_WEIGHT;
    effective += rel;
    const ageH = isNaN(a.date) ? 240 : Math.max(0, (now - a.date.getTime()) / 3.6e6);
    a.ageH = ageH;
    const w = (Math.exp(-ageH / 96) + 0.12) * rel;
    if (a.label === 'bull') bullW += w * a.norm;
    else if (a.label === 'bear') bearW += w * -a.norm;
    else neuW += w;
    if (ageH <= 48) { recentSum += a.norm; recentW++; } else { olderSum += a.norm; olderW++; }
    for (const h of a.hits) {
      const ta = themeAgg[h.th] ||= {pos: 0, neg: 0, n: 0};
      if (h.w > 0) ta.pos += h.w * w; else ta.neg += -h.w * w;
      ta.n++;
      const k = kw[h.term] ||= {term: h.term, n: 0, w: 0};
      k.n++; k.w += h.w;
    }
  }

  const denom = bullW + bearW + 0.35 * neuW;
  const rawScore = denom ? clamp(100 * (bullW - bearW) / denom, -100, 100) : 0;
  const score = Math.round(rawScore * effective / (effective + SCORE_SHRINK));
  const label = score >= 40 ? 'Stark Bullish' : score >= 12 ? 'Leicht Bullish' : score > -12 ? 'Neutral' : score > -40 ? 'Leicht Bearish' : 'Stark Bearish';
  const counts = {
    bull: articles.filter(a => a.label === 'bull').length,
    bear: articles.filter(a => a.label === 'bear').length,
    neu:  articles.filter(a => a.label === 'neu').length
  };
  const agreement = (bullW + bearW) ? Math.abs(bullW - bearW) / (bullW + bearW) : 0;
  const confidence = Math.round(100 * Math.min(1, effective / 25) * (0.45 + 0.55 * agreement));
  const relevantCount = articles.filter(a => a.relevant).length;
  const recentAvg = recentW ? recentSum / recentW : null, olderAvg = olderW ? olderSum / olderW : null;
  const themes = Object.entries(themeAgg).map(([k, v]) => ({key: k, ...v, net: v.pos - v.neg, tot: v.pos + v.neg}))
    .sort((a, b) => b.tot - a.tot);
  const keywords = Object.values(kw).sort((a, b) => b.n - a.n || Math.abs(b.w) - Math.abs(a.w)).slice(0, 18);
  const sources = new Set(articles.map(a => a.source).filter(Boolean));
  const dates = articles.map(a => a.date).filter(d => !isNaN(d)).sort((a, b) => a - b);

  return {sym, name, score, label, counts, confidence, relevantCount, recentAvg, olderAvg, themes, keywords, sources: sources.size,
    oldest: dates[0], newest: dates[dates.length - 1], last48: recentW, articles, quote, ts: new Date()};
}

const TONE = {
  'Stark Bullish': 'deutlich positiv', 'Leicht Bullish': 'leicht positiv', 'Neutral': 'ausgeglichen',
  'Leicht Bearish': 'leicht negativ', 'Stark Bearish': 'deutlich negativ'
};

function quickTake(A){
  const name = cleanCompanyName(A.name, A.sym);
  const topBull = A.themes.filter(t => t.pos > 0.6).sort((a, b) => b.pos - a.pos)[0];
  const topBear = A.themes.filter(t => t.neg > 0.6).sort((a, b) => b.neg - a.neg)[0];
  const driver = A.score >= 12 ? topBull : A.score <= -12 ? topBear : null;

  const parts = [A.articles.length
    ? `Die Nachrichtenlage zu ${name} ist ${TONE[A.label]}${driver ? `, getrieben vor allem von „${THEMES[driver.key].name}“` : ''}.`
    : `Zu ${name} wurden keine aktuellen Nachrichten gefunden – der Ausblick stützt sich nur auf Trend und Volatilität.`];

  const T = A.target;
  if (T) {
    const dir = T.upside >= 1 ? 'ein Plus' : T.upside <= -1 ? 'ein Minus' : 'eine Seitwärtsbewegung';
    parts.push(`Das Modell erwartet in 6 Monaten ${dir} auf rund ${fmtPx(T.target)} ${T.currency} (${fmtPct(T.upside)}).`);
  }

  if (A.score >= 0 && topBear) parts.push(`Größtes Risiko: ${THEMES[topBear.key].name}.`);
  else if (A.score < 0 && topBull) parts.push(`Möglicher Lichtblick: ${THEMES[topBull.key].name}.`);

  return parts.join(' ');
}

function summarize(A){
  const n = A.articles.length, q = A.quote;

  let news = n
    ? `${n} Artikel aus ${A.sources} Quellen ausgewertet, davon ${A.relevantCount} direkt zum Unternehmen – ${A.counts.bull} positiv, ${A.counts.bear} negativ, ${A.counts.neu} neutral.`
    : 'Keine aktuellen Nachrichten gefunden. Das Sentiment ist daher neutral gewertet.';
  if (A.recentAvg != null && A.olderAvg != null) {
    const d = A.recentAvg - A.olderAvg;
    news += d > 0.08 ? ' Die Stimmung hat sich in den letzten 48 Stunden aufgehellt.'
          : d < -0.08 ? ' Die Stimmung hat sich in den letzten 48 Stunden eingetrübt.'
          : ' Die Stimmung ist zuletzt stabil.';
  }

  const topBull = A.themes.filter(t => t.pos > 0.6).sort((a, b) => b.pos - a.pos)[0];
  const topBear = A.themes.filter(t => t.neg > 0.6).sort((a, b) => b.neg - a.neg)[0];
  const bull = topBull ? THEMES[topBull.key].bull
    : 'Kaum positive Katalysatoren – ein Bull-Case müsste sich auf Fundamentaldaten oder eine technische Erholung stützen.';
  const bear = topBear ? THEMES[topBear.key].bear
    : 'Kaum negative Katalysatoren – Hauptrisiken wären marktweite Korrekturen oder bereits hoch eingepreiste Erwartungen.';

  let outlook = OUTLOOK[A.label];
  if (q?.ok) {
    if (A.score >= 12 && q.pct < -1) outlook += ' Auffällig: Der Kurs fällt trotz positiver Nachrichten.';
    else if (A.score <= -12 && q.pct > 1) outlook += ' Auffällig: Der Kurs steigt trotz negativer Nachrichten.';
  }

  return [
    {kind: 'news',    title: 'Nachrichtenlage',        text: news},
    {kind: 'bull',    title: 'Bull-Case',              text: bull},
    {kind: 'bear',    title: 'Bear-Case',              text: bear},
    {kind: 'outlook', title: 'Ausblick · 1–2 Wochen',  text: outlook}
  ];
}
