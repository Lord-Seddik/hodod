// Prayer cards for the selected day (all obligatory prayers, or the selected one).
import { MIN } from '../core/astro.js';
import { isAdvanced, isSimple, activeMadhabs } from '../core/state.js';
import { currentPhase, isPhaseMark } from '../core/timeline.js';
import { fmtTime, duration, sameDay } from '../core/time.js';
import { SEGMENTS } from '../data/rulings.js';
import { $, esc } from './dom.js';

const pill = t => (SEGMENTS[t] || SEGMENTS.none).pill;

function rowClass(m) {
  if (m.context) return 'minor';
  if (m.exit) return 'exit';
  return '';
}

function segmentBar(P) {
  const w = P.window;
  if (!w) return '';
  return P.row.filter(s => s.to > s.from).map(s =>
    '<i class="t-' + s.type + '" style="flex-grow:' + ((s.to - s.from) / MIN).toFixed(1) + '" title="' + esc(pill(s.type) + ' · ' + duration(s.to - s.from)) + '"></i>').join('');
}

/** Per-madhab verdicts: chips when they differ (several madhabs), notes in the details view. */
function rulingsHtml(m, multi) {
  if (!m.rulings) return '';
  const chips = multi && !m.agree ? '<span class="mz-chips">' + m.rulings.map(r =>
    '<span class="mz t-' + r.type + '" title="' + esc(r.name + ': ' + r.note) + '">' + esc(r.short) + ': ' + esc(pill(r.type)) + '</span>').join('') + '</span>' : '';
  const notes = m.desc ? '<span class="mz-notes">' + m.desc.split('\n').map(line => '<span class="mz-note">' + esc(line) + '</span>').join('') + '</span>' : '';
  return chips + notes;
}

/** Length of the stretch a mark opens (for the sub line). */
function stretch(P, m, i) {
  const next = P.marks.slice(i + 1).find(x => !x.quiet && !x.context);
  if (!next || !m.type || !SEGMENTS[m.type] || m.exit || m.context) return '';
  return ' · ' + pill(m.type) + ' ' + duration(next.at - m.at);
}

function card(B, P, cur, wide) {
  const multi = isAdvanced() && activeMadhabs().length > 1;
  const isCurrent = !!cur && !!cur.dt && sameDay(cur.dt, B.dt) && cur.pkey === P.key && cur.valid;
  const rows = P.marks.map((m, i) => {
    if (m.quiet && !m.context) return '';
    const curMark = isPhaseMark(cur, B.dt, m);
    const type = m.context ? 'nahy' : m.exit ? 'exit' : (m.type || 'nahy');
    return '<li class="mk t-' + type + ' ' + rowClass(m) + (curMark ? ' cur' : '') + '"' + (curMark ? ' aria-current="time"' : '') + '>'
      + '<i class="dot"></i>'
      + '<span class="lbl"><b>' + esc(isSimple() ? m.short : m.label) + '</b><small>' + esc(m.sub + stretch(P, m, i)) + '</small>' + rulingsHtml(m, multi) + '</span>'
      + '<time class="num">' + esc(fmtTime(m.at)) + '</time></li>';
  }).join('');
  const range = P.window ? fmtTime(P.window.from) + ' – ' + fmtTime(P.window.to) : '—';
  return '<article class="pcard' + (isCurrent ? ' current' : '') + (wide ? ' wide' : '') + '" data-prayer="' + P.key + '">'
    + '<header><h3>' + esc(P.name) + (isCurrent ? '<span class="now-tag">الآن</span>' : '') + '</h3>'
    + '<span class="range num">' + esc(range) + '</span></header>'
    + '<div class="seg">' + segmentBar(P) + '</div>'
    + '<ul class="marks">' + rows + '</ul></article>';
}

/** keys: prayers to show, in order. */
export function renderCards(B, keys) {
  const cur = currentPhase();
  const list = keys.map(k => B.prayers[k]).filter(Boolean);
  $('#cards').innerHTML = list.map(P => card(B, P, cur, list.length === 1)).join('')
    || '<p class="muted">لا تُصلّى هذه الصلاة في هذا اليوم.</p>';
}
