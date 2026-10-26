// Sun-path strip: sky colour by solar altitude, phase bands, hour ticks.
// The strip runs right→left (RTL) from local midnight to the next midnight.
import { HOUR, sunAltitude } from '../core/astro.js';
import { loc } from '../core/state.js';
import { digits } from '../core/time.js';
import { $, esc } from './dom.js';

// sky colour stops: [altitude°, [r,g,b]]
const SKY = [
  [-90, [9, 12, 30]], [-18, [11, 16, 38]], [-12, [24, 32, 78]], [-6, [52, 58, 120]],
  [-2, [150, 92, 120]], [0, [226, 122, 86]], [3, [240, 168, 92]], [6, [244, 204, 120]],
  [12, [164, 208, 240]], [30, [102, 170, 230]], [90, [72, 146, 222]],
];

function skyRGB(a) {
  for (let i = 1; i < SKY.length; i++) {
    if (a <= SKY[i][0]) {
      const [a0, c0] = SKY[i - 1], [a1, c1] = SKY[i];
      const k = (a - a0) / (a1 - a0);
      return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
    }
  }
  return SKY[SKY.length - 1][1];
}

let span = null; // { start, end } epoch ms

export function setSpan(start, end) { span = { start, end }; }

const pos = ms => 100 * (ms - span.start) / (span.end - span.start);

export function drawSky() {
  const wrap = $('#skyWrap'), cv = $('#skyCanvas');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !span) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(w * dpr), H = Math.round(h * dpr);
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), total = span.end - span.start;
  const horizon = H * 0.58, pts = [];
  const step = Math.max(1, Math.round(dpr * 2));
  let maxAlt = 10;
  for (let x = 0; x < W; x += step) {
    const ms = span.start + (1 - (x + step / 2) / W) * total;
    const a = sunAltitude(ms, loc.lat, loc.lon);
    pts.push([x, a]);
    if (a > maxAlt) maxAlt = a;
  }
  for (const [x, a] of pts) {
    const c = skyRGB(a);
    ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    ctx.fillRect(x, 0, step + 1, H);
  }
  // horizon
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.lineWidth = dpr;
  ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(W, horizon); ctx.stroke(); ctx.setLineDash([]);
  // sun altitude curve
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.6 * dpr; ctx.beginPath();
  pts.forEach(([x, a], i) => {
    const y = a >= 0 ? horizon - (a / maxAlt) * (horizon - 6 * dpr) : horizon + Math.min(1, -a / 24) * (H - horizon - 4 * dpr);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}

/** Bands, ticks and prayer labels. `prev` (yesterday) supplies phases spilling past midnight. */
export function renderSkyOverlay(B, prev) {
  if (!span) return;
  const { start, end } = span;
  const phases = [];
  [prev, B].forEach(BB => {
    if (!BB || BB.polar) return;
    BB.prayers.forEach(p => {
      const ms = p.marks;
      for (let i = 0; i < ms.length - 1; i++) {
        const a = ms[i], b = ms[i + 1];
        if (a.seg && b.at > a.at) phases.push([a.at, b.at, a.seg]);
      }
    });
  });
  $('#skyBands').innerHTML = phases.filter(([f, t]) => t > start && f < end).map(([f, t, s]) => {
    const r = pos(Math.max(f, start)), w = pos(Math.min(t, end)) - r;
    return '<i class="t-' + s + '" style="right:' + r.toFixed(3) + '%;width:' + w.toFixed(3) + '%"></i>';
  }).join('');

  let ticks = '';
  for (let hh = 0; hh <= 24; hh += 3) {
    const ms = start + hh * HOUR;
    if (ms > end) break;
    ticks += '<span style="right:' + pos(ms).toFixed(2) + '%">' + digits(String(hh % 24).padStart(2, '0')) + '</span>';
  }
  $('#skyTicks').innerHTML = ticks;

  // prayer name labels, skipping any that would collide
  const wpx = $('#skyWrap').clientWidth;
  let last = -1e9, labels = '';
  if (!B.polar) B.prayers.forEach(p => {
    const s = p.marks.find(m => m.kind === 'start');
    const x = pos(s.at) / 100 * wpx;
    if (x - last < 54) return;
    last = x;
    labels += '<span style="right:' + pos(s.at).toFixed(2) + '%">' + esc(p.name) + '</span>';
  });
  $('#skyLabels').innerHTML = labels;

  updateSkyNow();
  const estimated = !B.polar && Object.keys(B.e.est).length;
  $('#skyNote').textContent = estimated
    ? 'بعض الأوقات تقديرية لارتفاع خط العرض'
    : 'من منتصف الليل إلى منتصف الليل بالتوقيت المحلي';
}

export function updateSkyNow() {
  if (!span) return;
  const now = Date.now(), el = $('#skyNow');
  if (now >= span.start && now < span.end) { el.hidden = false; el.style.right = pos(now).toFixed(3) + '%'; }
  else el.hidden = true;
}
