// Date/time helpers in the active location's time zone.
// A "date" here is a plain { y, m, d } object (m is 1-12).
import { cfg, loc } from './state.js';
import { MIN } from './astro.js';

const formatters = new Map();
function cached(key, make) {
  let f = formatters.get(key);
  if (!f) { f = make(); formatters.set(key, f); }
  return f;
}

function formatter(kind) {
  const h12 = cfg.h12 === '12', locale = 'ar-u-nu-' + cfg.nu, timeZone = loc.tz;
  return cached(kind + '|' + timeZone + '|' + cfg.h12 + '|' + cfg.nu, () => {
    switch (kind) {
      case 'time': return new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hour12: h12 });
      case 'clock': return new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: h12 });
      case 'parts': return new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      case 'csv': return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    }
  });
}

export const fmtTime = ms => (Number.isFinite(ms) ? formatter('time').format(ms) : '—');
export const fmtClock = ms => formatter('clock').format(ms);
export const fmtCsvTime = ms => (Number.isFinite(ms) ? formatter('csv').format(ms) : '');

/** Convert Western digits to Arabic-Indic when that numeral system is selected. */
export function digits(s) {
  return cfg.nu === 'arab' ? String(s).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]) : String(s);
}

const pad2 = n => String(n).padStart(2, '0');

function partsAt(ms) {
  const p = {};
  for (const x of formatter('parts').formatToParts(ms)) p[x.type] = x.value;
  return p;
}

/** Offset (ms) of the active time zone from UTC at an instant. */
function tzOffset(ms) {
  const p = partsAt(ms);
  return Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

/** Epoch ms of local midnight starting the given date. */
export function localMidnight(dt) {
  const g = Date.UTC(dt.y, dt.m - 1, dt.d);
  let ms = g - tzOffset(g);
  const o2 = tzOffset(ms);
  if (g - o2 !== ms) ms = g - o2;
  return ms;
}

export function todayLocal() {
  const p = partsAt(Date.now());
  return { y: +p.year, m: +p.month, d: +p.day };
}

export function addDays(dt, k) {
  const t = new Date(Date.UTC(dt.y, dt.m - 1, dt.d + k));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function addMonths(dt, k) {
  const t = new Date(Date.UTC(dt.y, dt.m - 1 + k, 1));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: 1 };
}

export const daysInMonth = dt => new Date(Date.UTC(dt.y, dt.m, 0)).getUTCDate();
export const sameDay = (a, b) => a.y === b.y && a.m === b.m && a.d === b.d;
export const isoDate = dt => dt.y + '-' + pad2(dt.m) + '-' + pad2(dt.d);

export function parseIsoDate(s) {
  const v = String(s).split('-').map(Number);
  if (v.length !== 3 || !(v[0] > 1800) || !(v[1] >= 1 && v[1] <= 12) || !(v[2] >= 1 && v[2] <= 31)) return null;
  return { y: v[0], m: v[1], d: v[2] };
}

/** "45 د" / "2 س 10 د" */
export function duration(ms) {
  const m = Math.round(ms / MIN);
  if (m < 60) return digits(m) + ' د';
  const h = Math.floor(m / 60), r = m % 60;
  return digits(h) + ' س' + (r ? ' ' + digits(r) + ' د' : '');
}

/** "HH:MM:SS" countdown */
export function hms(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return digits(pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor((s % 3600) / 60)) + ':' + pad2(s % 60));
}

// ── calendars (dates are formatted at UTC noon so the zone never shifts the day)
const noonUTC = dt => Date.UTC(dt.y, dt.m - 1, dt.d, 12);

export function hijriMonth(dt) {
  try {
    const f = cached('hm', () => new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric', timeZone: 'UTC' }));
    return parseInt(f.format(noonUTC(dt)), 10);
  } catch { return 0; }
}

export function hijriString(dt) {
  try {
    const f = cached('hs|' + cfg.nu, () => new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-' + cfg.nu, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }));
    return f.format(noonUTC(dt));
  } catch { return ''; }
}

export function hijriNumeric(dt) {
  try {
    const f = cached('hn', () => new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }));
    return f.format(noonUTC(dt));
  } catch { return ''; }
}

export function gregString(dt, opts) {
  const f = cached('g|' + cfg.nu + '|' + JSON.stringify(opts), () => new Intl.DateTimeFormat('ar-u-nu-' + cfg.nu, { timeZone: 'UTC', ...opts }));
  return f.format(noonUTC(dt));
}
