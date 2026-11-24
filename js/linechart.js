'use strict';

const LC_SAMPLES = 240;
const LC_DURATION = 700;
const LC_PAD = {top: 30, bottom: 22, x: 6};
const LC_HOLD_MS = 160;
const LC_SLOP = 6;

const lcEase = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lcLerp = (a, b, t) => a + (b - a) * t;
const lcRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const lcCss = (rgb, a = 1) => `rgba(${rgb.map(Math.round).join(',')},${a})`;

function lcResample(vals, n){
  if (vals.length === 1) return Array(n).fill(vals[0]);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1) * (vals.length - 1);
    const i0 = Math.floor(p), i1 = Math.min(vals.length - 1, i0 + 1);
    out[i] = lcLerp(vals[i0], vals[i1], p - i0);
  }
  return out;
}

class AnimatedLineChart {
  constructor(host, opts = {}){
    this.host = host;
    this.opts = opts;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'lc-canvas';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.view = null;
    this.data = null;
    this.hover = null;
    this.animating = false;

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    const mouse = e => e.pointerType === 'mouse';
    this.canvas.addEventListener('pointermove', e => { if (mouse(e)) this.scrubAt(e.clientX); });
    this.canvas.addEventListener('pointerdown', e => { if (mouse(e)) this.scrubAt(e.clientX); });
    this.canvas.addEventListener('pointerleave', e => { if (mouse(e)) this.clearHover(); });
    this.canvas.addEventListener('touchstart', e => this.onTouchStart(e), {passive: true});
    this.canvas.addEventListener('touchmove', e => this.onTouchMove(e), {passive: false});
    this.canvas.addEventListener('touchend', () => this.endTouch());
    this.canvas.addEventListener('touchcancel', () => this.endTouch());
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.resize();
  }

  resize(){
    const r = this.host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  setData(points, {color = '#30D158', baseline = null} = {}){
    if (!points.length) return;
    const vals = points.map(p => p.v);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (baseline != null) { min = Math.min(min, baseline); max = Math.max(max, baseline); }
    const pad = (max - min) * 0.06 || Math.abs(max) * 0.01 || 1;
    min -= pad; max += pad;
    const norm = v => (v - min) / (max - min);

    const target = {
      norm: lcResample(vals, LC_SAMPLES).map(norm),
      color: lcRgb(color),
      baseN: baseline != null ? norm(baseline) : null
    };
    let iMax = 0, iMin = 0;
    vals.forEach((v, i) => { if (v > vals[iMax]) iMax = i; if (v < vals[iMin]) iMin = i; });
    this.data = {points, baseline, norm, iMax, iMin};
    this.hover = null;

    const from = this.view;
    cancelAnimationFrame(this.raf);
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / LC_DURATION), e = lcEase(t);
      this.animating = t < 1;
      this.view = from
        ? {norm: target.norm.map((n, i) => lcLerp(from.norm[i], n, e)),
           color: target.color.map((c, i) => lcLerp(from.color[i], c, e)),
           baseN: target.baseN, reveal: 1, fade: e}
        : {...target, reveal: e, fade: e};
      this.draw();
      if (this.animating) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  xAt(idx){
    const n = this.data.points.length;
    return LC_PAD.x + (n > 1 ? idx / (n - 1) : 0.5) * (this.w - 2 * LC_PAD.x);
  }
  yAt(normVal){ return LC_PAD.top + (1 - normVal) * (this.h - LC_PAD.top - LC_PAD.bottom); }

  onTouchStart(e){
    clearTimeout(this.holdTimer);
    if (e.touches.length !== 1) { this.endTouch(); return; }
    const t = e.touches[0];
    this.touch = {x: t.clientX, y: t.clientY, mode: null};
    this.holdTimer = setTimeout(() => {
      if (this.touch && !this.touch.mode) { this.touch.mode = 'scrub'; this.scrubAt(this.touch.x); }
    }, LC_HOLD_MS);
  }

  onTouchMove(e){
    const T = this.touch;
    if (!T) return;
    const t = e.touches[0];
    if (!T.mode) {
      const dx = Math.abs(t.clientX - T.x), dy = Math.abs(t.clientY - T.y);
      if (dx < LC_SLOP && dy < LC_SLOP) return;
      clearTimeout(this.holdTimer);
      T.mode = dx >= dy ? 'scrub' : 'scroll';
    }
    if (T.mode === 'scrub') {
      e.preventDefault();
      this.scrubAt(t.clientX);
    }
  }

  endTouch(){
    clearTimeout(this.holdTimer);
    this.touch = null;
    this.clearHover();
  }

  scrubAt(clientX){
    if (!this.data || this.animating) return;
    const r = this.canvas.getBoundingClientRect();
    const n = this.data.points.length;
    const rel = (clientX - r.left - LC_PAD.x) / (this.w - 2 * LC_PAD.x);
    const idx = Math.round(clamp(rel, 0, 1) * (n - 1));
    if (idx === this.hover) return;
    this.hover = idx;
    this.draw();
    this.opts.onHover?.(this.data.points[idx], this.data.points[0].v);
  }
  clearHover(){
    if (this.hover == null) return;
    this.hover = null;
    this.draw();
    this.opts.onLeave?.();
  }

  draw(){
    const {ctx, w, h, view: v} = this;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    if (!v) return;

    const S = LC_SAMPLES;
    const X = i => LC_PAD.x + i / (S - 1) * (w - 2 * LC_PAD.x);
    const line = new Path2D();
    v.norm.forEach((n, i) => i ? line.lineTo(X(i), this.yAt(n)) : line.moveTo(X(i), this.yAt(n)));
    const area = new Path2D(line);
    area.lineTo(X(S - 1), h - LC_PAD.bottom + 6);
    area.lineTo(X(0), h - LC_PAD.bottom + 6);
    area.closePath();

    const col = v.color;
    const grad = ctx.createLinearGradient(0, LC_PAD.top, 0, h - LC_PAD.bottom);
    grad.addColorStop(0, lcCss(col, 0.24));
    grad.addColorStop(1, lcCss(col, 0));

    const hx = this.hover != null ? this.xAt(this.hover) : null;

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, LC_PAD.x + v.reveal * (w - LC_PAD.x), h); ctx.clip();

    if (v.baseN != null) {
      ctx.save();
      ctx.globalAlpha = v.fade;
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(235,235,245,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, this.yAt(v.baseN)); ctx.lineTo(w, this.yAt(v.baseN)); ctx.stroke();
      ctx.restore();
    }

    ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (hx == null) {
      ctx.fillStyle = grad; ctx.fill(area);
      ctx.strokeStyle = lcCss(col); ctx.stroke(line);
    } else {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, hx, h); ctx.clip();
      ctx.fillStyle = grad; ctx.fill(area);
      ctx.strokeStyle = lcCss(col); ctx.stroke(line);
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(hx, 0, w - hx, h); ctx.clip();
      ctx.strokeStyle = lcCss(col, 0.28); ctx.stroke(line);
      ctx.restore();
    }
    ctx.restore();

    const font = getComputedStyle(document.body).fontFamily;
    const fmtV = this.opts.formatValue || (x => fmtPx(x));

    if (!this.animating && hx == null && this.data.points.length > 2) {
      ctx.font = `500 11px ${font}`;
      ctx.fillStyle = 'rgba(235,235,245,0.55)';
      for (const [idx, above] of [[this.data.iMax, true], [this.data.iMin, false]]) {
        const p = this.data.points[idx];
        const txt = fmtV(p.v);
        const tw = ctx.measureText(txt).width;
        const x = clamp(this.xAt(idx) - tw / 2, 2, w - tw - 2);
        const y = this.yAt(this.data.norm(p.v)) + (above ? -9 : 17);
        ctx.fillText(txt, x, y);
      }
    }

    if (hx != null) {
      const p = this.data.points[this.hover];
      const y = this.yAt(this.data.norm(p.v));
      ctx.strokeStyle = 'rgba(235,235,245,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, LC_PAD.top - 8); ctx.lineTo(hx, h - LC_PAD.bottom + 6); ctx.stroke();
      ctx.fillStyle = '#18181B';
      ctx.beginPath(); ctx.arc(hx, y, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lcCss(col);
      ctx.beginPath(); ctx.arc(hx, y, 4.5, 0, Math.PI * 2); ctx.fill();

      const label = this.opts.formatTime ? this.opts.formatTime(p.t) : '';
      if (label) {
        ctx.font = `500 11.5px ${font}`;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(235,235,245,0.7)';
        ctx.fillText(label, clamp(hx - tw / 2, 2, w - tw - 2), 13);
      }
    }
  }
}
