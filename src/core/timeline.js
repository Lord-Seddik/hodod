// A continuous timeline (two days back → tomorrow) of phases and scheduled alerts,
// taken from the active view's combined row.
import { MIN } from './astro.js';
import { cfg, version } from './state.js';
import { build, primaryDayRow, rulingsAt, describe } from './compute.js';
import { todayLocal, addDays, fmtTime, digits, sameDay } from './time.js';
import { SEGMENTS, PRAYERS } from '../data/rulings.js';

let phases = [], alerts = [], key = '';

export const getPhases = () => phases;
export const getAlerts = () => alerts;

const GOOD = new Set(['fadila', 'ok']);

/** Label for what happens at the end of a stretch. */
function boundaryAt(s, next) {
  const B = s.dt && build(s.dt);
  const own = B?.prayers?.[s.prayer]?.marks.find(m => m.at === s.to && m.rules);
  if (own) return own;
  if (next?.mark && next.mark.at === s.to) return next.mark;
  if (next?.mark && next.mark.from === s.to) return next.mark;
  return s.type === 'fadila' ? { short: 'نهاية أفضل الوقت', key: 'fadilaEnd' } : { short: SEGMENTS[next?.type]?.pill || '', key: 'bound' };
}

/** Rebuild when the local date or the settings version changes (or when forced). */
export function ensureTimeline(force = false) {
  const t = todayLocal(), k = version.n + '|' + t.y + '-' + t.m + '-' + t.d;
  if (!force && k === key) return;
  key = k;
  const row = primaryDayRow([-2, -1, 0, 1].map(o => addDays(t, o)));

  phases = row.map((s, i) => {
    const next = row[i + 1] && row[i + 1].from === s.to ? row[i + 1] : null;
    const at = boundaryAt(s, next);
    let kind;
    if (s.valid && (!next || next.prayer !== s.prayer || !next.valid)) kind = 'exit';
    else if (!s.valid && next?.valid) kind = 'start';
    else if (s.type === 'nahy' && next?.type !== 'nahy') kind = 'end';
    else kind = 'bound';
    // the text describes this stretch: each madhab's status for this prayer now
    const desc = PRAYERS[s.prayer] && s.dt ? describe(rulingsAt(build(s.dt), s.prayer, s.from)) : (s.mark?.desc || '');
    return {
      from: s.from, to: s.to, seg: s.type, valid: s.valid, title: s.title || PRAYERS[s.prayer]?.name || '',
      pkey: s.prayer, dt: s.dt, mark: s.mark || {}, desc,
      next: { short: at.short, kind, type: next?.type, prayer: next?.prayer, at },
      prayer: s.title,
    };
  });

  alerts = [];
  for (const ph of phases) {
    const n = ph.next;
    const id = ph.pkey + ph.to;
    if (ph.valid && n.kind === 'exit') {
      alerts.push({ when: ph.to - cfg.exitB * MIN, at: ph.to, lvl: 'exit', seg: 'exit', title: 'خروج ' + ph.title + ' بعد ' + digits(cfg.exitB) + ' د', body: (n.at.label || n.short) + ' عند ' + fmtTime(ph.to), id: 'x' + id });
      alerts.push({ when: ph.to, at: ph.to, lvl: 'passed', quiet: true, seg: 'exit', title: 'خرج: ' + ph.title, body: n.short + ' · ' + fmtTime(ph.to), id: 'p' + id });
    } else if (ph.valid && n.kind === 'bound' && n.type && !GOOD.has(n.type)) {
      // the time is getting worse within the same prayer (end of the chosen time, karaha …)
      alerts.push({ when: ph.to - cfg.karB * MIN, at: ph.to, lvl: 'karaha', seg: n.type, title: n.short + ' بعد ' + digits(cfg.karB) + ' د', body: ph.title + ': ' + SEGMENTS[n.type].pill + ' عند ' + fmtTime(ph.to), id: 'k' + id });
    }
    if (cfg.entry && n.type && GOOD.has(n.type) && n.prayer !== ph.pkey && PRAYERS[n.prayer]) {
      alerts.push({ when: ph.to, at: ph.to, lvl: 'entry', seg: 'ok', title: 'دخل وقت ' + PRAYERS[n.prayer].name, body: fmtTime(ph.to), id: 'e' + id });
    }
  }
  phases = phases.filter(p => p.to > p.from).sort((a, b) => a.from - b.from);
  alerts.sort((a, b) => a.when - b.when);
}

export function currentPhase(now = Date.now()) {
  return phases.find(p => now >= p.from && now < p.to);
}

/** Stable identity for a phase, for change detection. */
export const phaseId = ph => (ph ? ph.pkey + ':' + (ph.mark?.key || '') + ':' + ph.from : '');

/** Is mark `m` of date `dt` where the current phase opened? */
export const isPhaseMark = (ph, dt, m) => !!ph && !!ph.dt && sameDay(ph.dt, dt) && ph.mark === m;

/** Short text for what happens at the end of a phase. */
export function afterText(ph) {
  const n = ph.next;
  if (n.kind === 'exit') return 'خروج وقت ' + ph.title;
  if (n.kind === 'start') return 'دخول الوقت';
  if (n.kind === 'end') return 'تنتهي الكراهة';
  return n.type && SEGMENTS[n.type] ? 'يبدأ: ' + SEGMENTS[n.type].pill : '';
}
