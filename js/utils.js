'use strict';

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '#';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const nf = (d = 2) => new Intl.NumberFormat('de-DE', {minimumFractionDigits: d, maximumFractionDigits: d});
const fmtPx = v => v == null || isNaN(v) ? '—' : nf(Math.abs(v) < 1 && v !== 0 ? 4 : 2).format(v);
const fmtPct = v => v == null || isNaN(v) ? '—' : (v > 0 ? '+' : '') + nf(2).format(v) + ' %';
const fmtSigned = v => v == null || isNaN(v) ? '—' : (v > 0 ? '+' : '') + fmtPx(v);
const fmtBig = v => {
  if (v == null || isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return nf(2).format(v / 1e9) + ' Mrd.';
  if (a >= 1e6) return nf(2).format(v / 1e6) + ' Mio.';
  if (a >= 1e3) return nf(1).format(v / 1e3) + ' Tsd.';
  return nf(0).format(v);
};
const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
const isJson = t => { try { JSON.parse(t); return true; } catch { return false; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function relTime(date){
  const s = (Date.now() - date.getTime()) / 1000;
  if (isNaN(s)) return '—';
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  if (s < 86400 * 7) return `vor ${Math.floor(s / 86400)} T.`;
  return date.toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'});
}

const store = {
  get(k, def){ try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

function toast(msg, type = ''){
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3800);
}

function updateSeg(el){
  const thumb = el?.querySelector('.seg-thumb');
  if (!thumb) return;
  const on = el.querySelector('button.on');
  if (!on || !on.offsetWidth) { thumb.style.opacity = '0'; return; }
  thumb.style.opacity = '1';
  thumb.style.width = on.offsetWidth + 'px';
  thumb.style.transform = `translateX(${on.offsetLeft}px)`;
}
function setSeg(el, isOn){
  el.querySelectorAll('button').forEach(b => b.classList.toggle('on', isOn(b)));
  updateSeg(el);
}

function limiter(n){
  let active = 0; const q = [];
  const next = () => {
    if (active >= n || !q.length) return;
    active++;
    const {fn, res, rej} = q.shift();
    fn().then(res, rej).finally(() => { active--; next(); });
  };
  return fn => new Promise((res, rej) => { q.push({fn, res, rej}); next(); });
}
const limit = limiter(3);
