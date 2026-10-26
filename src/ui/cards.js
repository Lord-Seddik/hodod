// The five prayer cards for the selected day.
import { MIN } from '../core/astro.js';
import { currentPhase, isPhaseMark } from '../core/timeline.js';
import { fmtTime, duration, sameDay } from '../core/time.js';
import { SEGMENTS } from '../data/rulings.js';
import { $, esc } from './dom.js';

function markClass(m) {
  if (m.kind === 'exit') return 'exit';
  if (m.kind === 'exit2') return 'exit2';
  if (m.kind === 'end' || m.kind === 'nahy') return 'minor';
  return '';
}
function markType(m) {
  if (m.kind === 'exit') return 'exit';
  if (m.kind === 'exit2') return 'darura';
  return m.seg || 'nahy';
}

function segmentBar(marks) {
  const out = [];
  for (let i = 0; i < marks.length - 1; i++) {
    const a = marks[i], b = marks[i + 1];
    if (!a.seg || a.seg === 'nahy' || !(b.at > a.at)) continue;
    const title = SEGMENTS[a.seg].pill + ' · ' + duration(b.at - a.at);
    out.push('<i class="t-' + a.seg + '" style="flex-grow:' + ((b.at - a.at) / MIN).toFixed(1) + '" title="' + esc(title) + '"></i>');
  }
  return out.join('');
}

export function renderCards(B) {
  const cur = currentPhase();
  const curOnThisDay = !!cur && sameDay(cur.dt, B.dt);

  $('#cards').innerHTML = B.prayers.map(p => {
    const ms = p.marks;
    const start = ms.find(m => m.kind === 'start'), exit = ms.find(m => m.kind === 'exit');
    const isCurrent = curOnThisDay && cur.pkey === p.key && cur.seg !== 'nahy';

    const rows = ms.map((m, i) => {
      const nx = ms[i + 1];
      const segLen = (m.seg && nx && nx.at > m.at && m.seg !== 'nahy') ? ' · ' + SEGMENTS[m.seg].pill + ' ' + duration(nx.at - m.at) : '';
      const curMark = isPhaseMark(cur, B.dt, m);
      return '<li class="mk t-' + markType(m) + ' ' + markClass(m) + (curMark ? ' cur' : '') + '"' + (curMark ? ' aria-current="time"' : '') + '>'
        + '<i class="dot"></i>'
        + '<span class="lbl"><b>' + esc(m.label) + '</b><small>' + esc(m.sub + segLen) + '</small></span>'
        + '<time class="num">' + esc(fmtTime(m.at)) + '</time></li>';
    }).join('');

    return '<article class="pcard' + (isCurrent ? ' current' : '') + '">'
      + '<header><h3>' + esc(p.name) + (isCurrent ? '<span class="now-tag">الآن</span>' : '') + '</h3>'
      + '<span class="range num">' + esc(fmtTime(start.at)) + ' – ' + esc(fmtTime(exit.at)) + '</span></header>'
      + '<div class="seg">' + segmentBar(ms) + '</div>'
      + '<ul class="marks">' + rows + '</ul></article>';
  }).join('');
}
