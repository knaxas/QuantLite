# QuantLite – Market Intelligence

Watchlist, Charts und eine nachrichtenbasierte Sentiment-Prognose für Aktien.
Kostenlos, ohne API-Keys (Yahoo Finance + Google News RSS über CORS-Proxys).

## Warum ein Proxy?

Browser dürfen Yahoo Finance und Google News nicht direkt abfragen (CORS).
Die Anfragen laufen deshalb über einen Proxy. Die öffentlichen Gratis-Proxys
sind meist überlastet oder gesperrt – zuverlässig ist nur ein **eigener**.

## Hosting auf GitHub Pages (kein Python nötig)

**1. Eigenen Proxy anlegen (Cloudflare Worker, kostenlos)**

1. Auf https://dash.cloudflare.com ein kostenloses Konto anlegen.
2. *Workers & Pages* → *Create* → *Create Worker* → Name z. B. `quantlite-proxy` → *Deploy*.
3. *Edit code* → den Inhalt komplett durch [`proxy/cloudflare-worker.js`](proxy/cloudflare-worker.js) ersetzen → *Deploy*.
4. Testen: `https://quantlite-proxy.<dein-name>.workers.dev/?url=https%3A%2F%2Fquery1.finance.yahoo.com%2Fv8%2Ffinance%2Fchart%2FAAPL`
   sollte JSON anzeigen.
5. Die Worker-URL in [`js/config.js`](js/config.js) bei `proxyUrl` eintragen.

**2. Seite veröffentlichen**

1. Projekt in ein GitHub-Repository pushen.
2. Repository → *Settings* → *Pages* → *Source: Deploy from a branch* → Branch `main`, Ordner `/ (root)` → *Save*.
3. Nach ~1 Minute läuft die App unter `https://<dein-name>.github.io/<repo>/`.

Optional: In `proxy/cloudflare-worker.js` bei `ALLOWED_ORIGINS` deine
GitHub-Pages-Adresse eintragen, damit nur deine Seite den Worker nutzen kann.

## Lokal entwickeln

- **Mit eigenem Worker** (in `js/config.js` eingetragen): einfach `index.html`
  oder VS Code Live Server öffnen.
- **Ohne Worker:** `python start.py` → öffnet http://localhost:8787 mit einem
  lokalen Proxy. Python wird nur dafür gebraucht, nicht für GitHub Pages.

## Als App auf dem Handy

QuantLite bringt ein Web-App-Manifest mit und läuft vom Homescreen aus im
Vollbild – ohne Browser-Leiste, mit eigenem Icon:

- **iPhone (Safari):** Teilen-Symbol → *Zum Home-Bildschirm*.
- **Android (Chrome):** Menü ⋮ → *App installieren* bzw. *Zum Startbildschirm hinzufügen*.

Voraussetzung: Die Seite läuft über **https** (z. B. GitHub Pages).

## Direkte Links

Jede Ansicht hat eine eigene Adresse, die man teilen oder als Lesezeichen speichern kann:

| Adresse | Zeigt |
|---|---|
| `…/watchlist/nvda` | NVIDIA, Seitenleiste „Watchlist“ |
| `…/trends/aapl` | Apple, Seitenleiste „Trends“ |
| `…/potenzial/amd` | AMD, Seitenleiste „Potenzial“ |
| `…/aktie/rheinmetall` | Sucht nach Name oder Ticker |
| `…/depot`, `…/depot/aktien`, `…/depot/krypto` | Depot (gesamt / gefiltert) |

Statt des Tickers funktioniert auch der Name (`/watchlist/nvidia`). GitHub Pages kennt keine
Unterseiten – `404.html` leitet solche Adressen deshalb an die App weiter (`js/router.js`).

## So entsteht die Prognose

- **Sentiment:** Bing-News (DE + EN) werden mit einem Finanz-Lexikon bewertet. Artikel, die das
  Unternehmen nicht erwähnen, zählen nur zu 30 %; bei wenigen Artikeln wird der Score zur Mitte gedämpft.
- **Kursziel (6 Monate):** Marktdurchschnitt 7 % p. a. + eigener Trend (statistisch stark gedämpft)
  + 12-Monats-Momentum + Nachrichtenlage (gewichtet nach Konfidenz). Spanne aus aktueller und
  langfristiger Volatilität.
- **Backtest** (24 Aktien, 8 Jahre, 1.888 Prognosen): Richtung in 64 % der Fälle richtig, Kurs in
  69 % der Fälle innerhalb der Spanne. Das alte Modell lag bei 60 % – schlechter als einfach den
  Marktdurchschnitt anzunehmen. Kursprognosen bleiben grundsätzlich unsicher.

## Projektstruktur

```
QuantLite/
├── index.html            Seitengerüst (nur HTML, kein Inline-CSS/JS)
├── 404.html              Leitet direkte Links (z. B. /watchlist/nvda) an die App weiter
├── manifest.json         Web-App-Manifest (Name, Farben, Icons)
├── icons/                App-Icons (SVG + PNG für Android/iOS)
├── start.py              Optional: lokaler Server + Proxy (nur für Entwicklung)
├── proxy/
│   └── cloudflare-worker.js   Eigener kostenloser Proxy für GitHub Pages
│
├── css/
│   ├── base.css          Design-Tokens (Farben, Schrift, Radien), Reset
│   ├── layout.css        Header, Sidebar, Hauptbereich, Footer, Responsive
│   ├── components.css    Buttons, Suchfeld, Segmented Control, Karten, Toasts
│   ├── watchlist.css     Seitenleiste mit Aktienliste
│   ├── detail.css        Kurs-Header, Chart-Karte, Kennzahlen
│   ├── insights.css      Tabs „KI-Prognose“ und „Alle Artikel“
│   ├── depot.css         Depot-Ansicht und Eingabe-Dialog
│   └── mobile.css        Anpassungen für Handys (wird zuletzt geladen)
│
└── js/                   (Ladereihenfolge wie in index.html)
    ├── config.js         ← Einstellungen: proxyUrl = URL deines Cloudflare Workers
    ├── utils.js          Hilfsfunktionen: DOM, Formatierung, Speicher, Toasts
    ├── proxy.js          Proxy-Kette: eigener Worker → start.py → Gratis-Proxys
    ├── yahoo.js          Kursdaten und Symbolsuche (Yahoo Finance)
    ├── news.js           Google-News-RSS laden und bereinigen
    ├── sentiment.js      Lexikon, Sentiment-Analyse, Kurzfazit, Kernaussagen
    ├── target.js         Kursziel in 6 Monaten (Trend + Volatilität + Sentiment)
    ├── state.js          App-Zustand, Watchlist & Depot (LocalStorage)
    ├── linechart.js      Animierter Linien-Chart (Morphing + Scrubbing)
    ├── watchlist.js      Seitenleiste: anzeigen, hinzufügen, entfernen
    ├── trends.js         Sidebar-Tab „Trends“ + Umschalten der Sidebar-Tabs
    ├── potential.js      Sidebar-Tab „Potenzial“ (größtes Kursplus in 6 Monaten)
    ├── quote.js          Kurs-Header und Kennzahlen
    ├── chart.js          Linie / Kerzen / TradingView
    ├── insights.js       Prognose-Ablauf und die beiden Tabs
    ├── depot.js          Virtuelles Depot (Bewertung in €, Aktien/Krypto, Verlauf)
    ├── depot-forecast.js Depot-Prognose: Ausblick, Signale, Empfehlungen
    ├── import.js         CSV-Import (Trade-Republic-Transaktionsexport)
    ├── router.js         Adressen wie /watchlist/nvda ↔ App-Zustand
    └── app.js            Events, Börsenstatus, Start
```

## Wo ändere ich was?

| Ich möchte …                          | Datei                |
|---------------------------------------|----------------------|
| Farben / Schrift / Abstände anpassen  | `css/base.css`       |
| Standard-Aktien der Watchlist ändern  | `js/state.js`        |
| Sentiment-Begriffe ergänzen           | `js/sentiment.js`    |
| Texte der Prognose ändern             | `js/sentiment.js` (`THEMES`, `OUTLOOK`) |
| Einen weiteren CORS-Proxy hinzufügen  | `js/proxy.js`        |
| Kursziel-Modell anpassen              | `js/target.js` (Konstanten oben) |
| Gewichtung irrelevanter Artikel       | `js/sentiment.js` (`IRRELEVANT_WEIGHT`, `SCORE_SHRINK`) |
| Andere Trend-Listen anzeigen          | `js/trends.js` (`TREND_GROUPS`)  |
| Aktien im Potenzial-Ranking ändern    | `js/potential.js` (`POTENTIAL_UNIVERSE`) |
| Chart-Animation (Dauer) anpassen      | `js/linechart.js` (`LC_DURATION`) |
| Regeln für Depot-Empfehlungen ändern  | `js/depot-forecast.js` (`positionSignal`, `depotHints`) |
| App-Name / Farben auf dem Handy       | `manifest.json`      |

> **Hinweis:** Alle Daten, Sentiment-Analysen und Prognosen dienen ausschließlich
> Informations- und Demonstrationszwecken und stellen keine Anlageberatung dar.
