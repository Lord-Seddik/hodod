// A continuous timeline (yesterday → tomorrow) of phases and scheduled alerts.
import { MIN } from './astro.js';
import { cfg, version } from './state.js';
import { build } from './compute.js';
import { todayLocal, addDays, fmtTime, digits, sameDay } from './time.js';
import { SEGMENTS, DUHA } from '../data/rulings.js';

let phases = [], alerts = [], key = '';

export const getPhases = () => phases;
export const getAlerts = () => alerts;

/** Rebuild when the local date or the settings version changes (or when forced). */
export function ensureTimeline(force = false) {
  const t = todayLocal(), k = version.n + '|' + t.y + '-' + t.m + '-' + t.d;
  if (!force && k === key) return;
  key = k; phases = []; alerts = [];

  for (const off of [-1, 0, 1]) {
    const dt = addDays(t, off), B = build(dt);
    if (B.polar) continue;

    for (const p of B.prayers) {
      const ms = p.marks;
      for (let i = 0; i < ms.length - 1; i++) {
        const a = ms[i], b = ms[i + 1];
        if (!a.seg || !(b.at > a.at)) continue;
        let title = p.name;
        if (a.key === 'sunrise') title = 'بعد الشروق';
        if (a.key === 'istiwa') title = 'الاستواء';
        phases.push({ from: a.at, to: b.at, seg: a.seg, title, pkey: p.key, dt, mark: a, next: b, prayer: p.name });
      }
      for (const m of ms) {
        if (!Number.isFinite(m.at)) continue;
        if (m.kind === 'exit' || m.kind === 'exit2') {
          alerts.push({ when: m.at - cfg.exitB * MIN, at: m.at, lvl: 'exit', seg: 'exit', title: 'خروج ' + p.name + ' بعد ' + digits(cfg.exitB) + ' د', body: m.label + ' عند ' + fmtTime(m.at), id: 'x' + m.key + m.at });
          alerts.push({ when: m.at, at: m.at, lvl: 'passed', quiet: true, seg: 'exit', title: 'خرج: ' + m.short, body: p.name + ' · ' + fmtTime(m.at), id: 'p' + m.key + m.at });
        } else if (m.kind === 'bound' && m.seg) {
          alerts.push({ when: m.at - cfg.karB * MIN, at: m.at, lvl: 'karaha', seg: m.seg, title: m.short + ' بعد ' + digits(cfg.karB) + ' د', body: p.name + ': ' + m.label + ' عند ' + fmtTime(m.at), id: 'k' + m.key + m.at });
        } else if (m.kind === 'start' && cfg.entry) {
          alerts.push({ when: m.at, at: m.at, lvl: 'entry', seg: 'ok', title: 'دخل وقت ' + p.name, body: fmtTime(m.at), id: 'e' + m.key + m.at });
        }
      }
    }

    // Duha: from Ishraq until Istiwa, no obligatory prayer
    phases.push({
      from: B.T.ishraq, to: B.T.istiwa, seg: 'idle', title: DUHA.title, pkey: 'duha', dt,
      mark: { key: 'duha', desc: DUHA.desc }, next: { short: 'الاستواء', kind: 'nahy', seg: 'nahy' }, prayer: DUHA.title,
    });
  }

  phases = phases.filter(p => Number.isFinite(p.from) && Number.isFinite(p.to) && p.to > p.from).sort((a, b) => a.from - b.from);
  alerts.sort((a, b) => a.when - b.when);
}

export function currentPhase(now = Date.now()) {
  return phases.find(p => now >= p.from && now < p.to);
}

/** Stable identity for a phase, for change detection. */
export const phaseId = ph => (ph ? ph.pkey + ':' + ph.mark.key + ':' + ph.from : '');

/** Is mark `m` of date `dt` the start of phase `ph`? */
export const isPhaseMark = (ph, dt, m) => !!ph && sameDay(ph.dt, dt) && ph.mark.key === m.key;

/** Short text for what happens at the end of a phase. */
export function afterText(ph) {
  const n = ph.next;
  if (n.kind === 'exit') return 'خروج وقت ' + ph.prayer;
  if (n.kind === 'exit2') return 'الخروج الكلي';
  if (n.kind === 'start') return 'دخول الوقت';
  if (n.kind === 'end') return 'تنتهي الكراهة';
  return n.seg && SEGMENTS[n.seg] ? 'يبدأ: ' + SEGMENTS[n.seg].pill : '';
}
