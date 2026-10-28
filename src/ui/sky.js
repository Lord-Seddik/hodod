// Sun-path strip: sky colour by solar altitude, ruling rows, labels and ticks.
// It runs right→left (RTL) over a span: a whole day, or one prayer's window.
import { MIN, HOUR, sunAltitude } from '../core/astro.js';
import { loc } from '../core/state.js';
import { digits, fmtTime } from '../core/time.js';
import { SEGMENTS } from '../data/rulings.js';
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

let span = null; // { start, end, day } epoch ms; day = whole-day view (hour ticks)

export function setSpan(start, end, day = true) { span = { start, end, day }; }

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
  let maxAlt = 10, minAlt = -10;
  for (let x = 0; x < W; x += step) {
    const ms = span.start + (1 - (x + step / 2) / W) * total;
    const a = sunAltitude(ms, loc.lat, loc.lon);
    pts.push([x, a]);
    if (a > maxAlt) maxAlt = a;
    if (a < minAlt) minAlt = a;
  }
  for (const [x, a] of pts) {
    const c = skyRGB(a);
    ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    ctx.fillRect(x, 0, step + 1, H);
  }
  // horizon
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.lineWidth = dpr;
  ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(W, horizon); ctx.stroke(); ctx.setLineDash([]);
  // sun altitude curve (zoomed spans use their own scale below the horizon)
  const below = span.day ? 24 : Math.max(6, -minAlt);
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.6 * dpr; ctx.beginPath();
  pts.forEach(([x, a], i) => {
    const y = a >= 0 ? horizon - (a / maxAlt) * (horizon - 6 * dpr) : horizon + Math.min(1, -a / below) * (H - horizon - 4 * dpr);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}

function bandHtml(slices) {
  const { start, end } = span;
  return slices.filter(s => s.to > start && s.from < end).map(s => {
    const r = pos(Math.max(s.from, start)), w = pos(Math.min(s.to, end)) - r;
    const title = (SEGMENTS[s.type]?.pill || '') + ' · ' + fmtTime(s.from) + ' – ' + fmtTime(s.to);
    return '<i class="t-' + s.type + '" style="right:' + r.toFixed(3) + '%;width:' + w.toFixed(3) + '%" title="' + esc(title) + '"></i>';
  }).join('');
}

/**
 * rows: [{ label, safe?, slices }] — one row draws as a plain band,
 * several draw labelled (safe row first).
 * labels: [{ at, text }] shown above the bands, skipping collisions.
 */
export function renderSkyOverlay(rows, labels, note) {
  if (!span) return;
  const multi = rows.length > 1;
  $('#skyRows').classList.toggle('multi', multi);
  $('#skyRows').innerHTML = rows.map(r =>
    '<div class="sky-row' + (r.safe ? ' safe' : '') + '">'
    + (multi ? '<span class="sky-row-label">' + esc(r.label) + '</span>' : '')
    + '<div class="sky-bands">' + bandHtml(r.slices) + '</div></div>').join('');

  // ticks: hours for a day, a fitting step for a prayer window
  const total = span.end - span.start;
  let ticks = '';
  if (span.day) {
    for (let hh = 0; hh <= 24; hh += 3) {
      const ms = span.start + hh * HOUR;
      if (ms > span.end) break;
      ticks += '<span style="right:' + pos(ms).toFixed(2) + '%">' + digits(String(hh % 24).padStart(2, '0')) + '</span>';
    }
  } else {
    const step = [15, 30, 60, 120, 180].map(m => m * MIN).find(s => total / s <= 7) || 4 * HOUR;
    for (let t = Math.ceil(span.start / step) * step; t <= span.end; t += step) {
      ticks += '<span style="right:' + pos(t).toFixed(2) + '%">' + esc(fmtTime(t)) + '</span>';
    }
  }
  $('#skyTicks').innerHTML = ticks;

  const wpx = $('#skyWrap').clientWidth;
  let last = -1e9, html = '';
  labels.filter(l => l.at >= span.start && l.at <= span.end).sort((a, b) => a.at - b.at).forEach(l => {
    const x = pos(l.at) / 100 * wpx;
    if (x - last < 58) return;
    last = x;
    html += '<span style="right:' + pos(l.at).toFixed(2) + '%">' + esc(l.text) + '</span>';
  });
  $('#skyLabels').innerHTML = html;
  $('#skyNote').textContent = note;
  updateSkyNow();
}

export function updateSkyNow() {
  if (!span) return;
  const now = Date.now(), el = $('#skyNow');
  if (now >= span.start && now < span.end) { el.hidden = false; el.style.right = pos(now).toFixed(3) + '%'; }
  else el.hidden = true;
}
