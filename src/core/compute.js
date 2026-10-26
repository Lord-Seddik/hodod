// Prayer boundaries for a date: raw solar events → rounded, ordered marks.
import { solar, clamp, MIN, HOUR } from './astro.js';
import { cfg, loc, methodKey, version } from './state.js';
import { addDays, hijriMonth } from './time.js';
import { METHODS } from '../data/methods.js';
import { MARKS, PRAYER_NAMES } from '../data/rulings.js';

/** Effective Fajr/Isha parameters for a date (Isha may depend on Ramadan). */
export function methodParams(dt) {
  const key = methodKey(), M = METHODS[key] || METHODS.MWL;
  const fajrAngle = key === 'CUSTOM' ? +cfg.customF : M.fajr;
  let ishaAngle = null, ishaMin = null, ishaDesc = '';
  if (cfg.isha === 'red') { ishaAngle = 15; ishaDesc = 'الشفق الأحمر 15°'; }
  else if (cfg.isha === 'white') { ishaAngle = 18; ishaDesc = 'الشفق الأبيض 18°'; }
  else if (key === 'CUSTOM') { ishaAngle = +cfg.customI; ishaDesc = ishaAngle + '° تحت الأفق'; }
  else if (M.ishaMin) {
    ishaMin = (M.ishaMinRamadan && hijriMonth(dt) === 9) ? M.ishaMinRamadan : M.ishaMin;
    ishaDesc = ishaMin + ' دقيقة بعد المغرب';
  } else { ishaAngle = M.isha; ishaDesc = ishaAngle + '° تحت الأفق'; }
  return { fajrAngle, ishaAngle, ishaMin, ishaDesc, name: M.name };
}

// ── per-version caches (cleared automatically when settings change)
let cacheVersion = -1;
const eventCache = new Map(), buildCache = new Map();
function syncCaches() {
  if (cacheVersion !== version.n) { eventCache.clear(); buildCache.clear(); cacheVersion = version.n; }
}

/** Raw (unrounded) solar events for a date, in epoch ms. */
export function dayEvents(dt) {
  syncCaches();
  const ck = dt.y + '-' + dt.m + '-' + dt.d;
  if (eventCache.has(ck)) return eventCache.get(ck);

  const { lat, lon } = loc, M = methodParams(dt), S = solar(dt.y, dt.m, dt.d, lat, lon);
  const est = {};
  const dh = S.dhuhr;
  const sunrise = S.event(-0.833, -1), sunset = S.event(-0.833, 1);
  const polar = !Number.isFinite(sunrise) || !Number.isFinite(sunset);

  let fajr = S.event(-M.fajrAngle, -1);
  let isfar = S.event(-cfg.isfar, -1);
  let ishraq = S.event(+cfg.sunAlt, -1);
  let isfirar = S.event(+cfg.sunAlt, 1);
  let asr1 = S.event(S.asrAltitude(1), 1);
  let asr2 = S.event(S.asrAltitude(2), 1);
  let stars = S.event(-cfg.stars, 1);
  let isha = M.ishaMin != null ? sunset + M.ishaMin / 60 : S.event(-M.ishaAngle, 1);

  if (!polar) {
    const night = 24 - (sunset - sunrise);
    // high-latitude rule: cap twilight at a portion of the night
    const portion = a => cfg.highLat === 'angle' ? a / 60 : cfg.highLat === 'seventh' ? 1 / 7 : cfg.highLat === 'mid' ? 0.5 : null;
    if (cfg.highLat !== 'none') {
      const pf = portion(M.fajrAngle) * night;
      if (!Number.isFinite(fajr) || sunrise - fajr > pf) { fajr = sunrise - pf; est.fajr = 1; }
      if (M.ishaMin == null) {
        const pi = portion(M.ishaAngle) * night;
        if (!Number.isFinite(isha) || isha - sunset > pi) { isha = sunset + pi; est.isha = 1; }
      }
    }
    if (!Number.isFinite(fajr)) { fajr = sunrise - night / 2; est.fajr = 1; }
    if (!Number.isFinite(isha)) { isha = sunset + night / 2; est.isha = 1; }
    if (!Number.isFinite(isfar)) { isfar = sunrise - (sunrise - fajr) * Math.min(1, cfg.isfar / M.fajrAngle); est.isfar = 1; }
    const ishaRef = M.ishaAngle || 17;
    if (!Number.isFinite(stars)) { stars = sunset + (isha - sunset) * Math.min(1, cfg.stars / ishaRef); est.stars = 1; }
    if (!Number.isFinite(ishraq)) { ishraq = sunrise + 0.2 * (dh - sunrise); est.ishraq = 1; }
    if (!Number.isFinite(isfirar)) { isfirar = sunset - 0.2 * (sunset - dh); est.isfirar = 1; }

    isfar = clamp(isfar, fajr, sunrise);
    ishraq = clamp(ishraq, sunrise, dh - cfg.istiwa / 60);
    asr1 = clamp(asr1, dh, sunset);
    asr2 = clamp(asr2, asr1, sunset);
    const asrStart = cfg.asr === 'hanafi' ? asr2 : asr1;
    isfirar = clamp(isfirar, asrStart, sunset);
    stars = clamp(stars, sunset, isha);
  }

  const base = Date.UTC(dt.y, dt.m - 1, dt.d);
  const toMs = t => (Number.isFinite(t) ? base + t * HOUR : NaN);
  const r = {
    dt, polar, est, M,
    fajr: toMs(fajr), isfar: toMs(isfar), sunrise: toMs(sunrise), ishraq: toMs(ishraq),
    istiwa: toMs(dh) - cfg.istiwa * MIN, dhuhr: toMs(dh), asr1: toMs(asr1), asr2: toMs(asr2),
    isfirar: toMs(isfirar), sunset: toMs(sunset), stars: toMs(stars), isha: toMs(isha),
  };
  eventCache.set(ck, r);
  return r;
}

/**
 * Round to the minute, on the cautious side:
 * entries ('start') and ends of a forbidden time ('end') round later;
 * exits and warnings round earlier. The precaution margin pushes the same way.
 */
export function adjust(ms, kind) {
  if (!Number.isFinite(ms)) return NaN;
  const margin = (+cfg.iht || 0) * MIN;
  return kind === 'start' || kind === 'end'
    ? Math.ceil(ms / MIN) * MIN + margin
    : Math.floor(ms / MIN) * MIN - margin;
}

/**
 * Mark kinds:
 *   start  – a prayer's time begins
 *   bound  – an internal boundary (end of chosen time, start of karaha …)
 *   exit   – the prayer's time ends (becomes qada)
 *   exit2  – the outer exit per the majority (Isha at Fajr)
 *   nahy   – start of a forbidden time for voluntary prayer
 *   end    – end of a forbidden time
 * `seg` is the phase type from this mark until the next one (null = none).
 */
export function build(dt) {
  syncCaches();
  const ck = dt.y + '-' + dt.m + '-' + dt.d;
  if (buildCache.has(ck)) return buildCache.get(ck);
  const result = computeBuild(dt);
  buildCache.set(ck, result);
  return result;
}

function computeBuild(dt) {
  const e = dayEvents(dt);
  if (e.polar) return { dt, e, polar: true, prayers: [], T: {} };

  const n = dayEvents(addDays(dt, 1));
  const nightEnd = cfg.nightEnd === 'sunrise' ? n.sunrise : n.fajr;
  const night = nightEnd - e.sunset;
  let third = e.sunset + night / 3, half = e.sunset + night / 2;
  third = Math.max(third, e.isha);
  half = Math.max(half, third);

  const hanafi = cfg.asr === 'hanafi';
  const asrStart = hanafi ? e.asr2 : e.asr1;

  const ctx = {
    cfg,
    fajrAngle: e.M.fajrAngle,
    ishaDesc: e.M.ishaDesc,
    est: k => (e.est[k] ? ' · تقديري' : ''),
  };
  const mk = (key, textKey, t, kind, seg) => {
    const T = MARKS[textKey];
    return {
      key, raw: t, at: adjust(t, kind), kind, seg,
      label: T.label, short: T.short,
      sub: typeof T.sub === 'function' ? T.sub(ctx) : (T.sub || ''),
      desc: T.desc || '',
    };
  };

  const P = [
    { key: 'fajr', marks: [
      mk('fajr', 'fajr', e.fajr, 'start', 'ok'),
      mk('isfar', 'isfar', e.isfar, 'bound', 'karaha'),
      mk('sunrise', 'sunrise', e.sunrise, 'exit', 'nahy'),
      mk('ishraq', 'ishraq', e.ishraq, 'end', null),
    ] },
    { key: 'dhuhr', marks: [
      mk('istiwa', 'istiwa', e.istiwa, 'nahy', 'nahy'),
      mk('dhuhr', 'dhuhr', e.dhuhr, 'start', 'ok'),
      mk('dhuhrExit', hanafi ? 'dhuhrExitHanafi' : 'dhuhrExit', asrStart, 'exit', null),
    ] },
    { key: 'asr', marks: hanafi ? [
      mk('asr', 'asrHanafi', e.asr2, 'start', 'ok'),
      mk('isfirar', 'isfirarHanafi', e.isfirar, 'bound', 'karaha'),
      mk('sunset', 'sunset', e.sunset, 'exit', null),
    ] : [
      mk('asr', 'asr', e.asr1, 'start', 'ok'),
      mk('asr2', 'asr2', e.asr2, 'bound', 'khilaf'),
      mk('isfirar', 'isfirar', e.isfirar, 'bound', 'karaha'),
      mk('sunset', 'sunset', e.sunset, 'exit', null),
    ] },
    { key: 'maghrib', marks: [
      mk('maghrib', 'maghrib', e.sunset, 'start', 'ok'),
      mk('stars', 'stars', e.stars, 'bound', 'karaha'),
      mk('maghribExit', 'maghribExit', e.isha, 'exit', null),
    ] },
    { key: 'isha', marks: [
      mk('isha', 'isha', e.isha, 'start', 'ok'),
      mk('third', 'third', third, 'bound', 'khilaf'),
      mk('half', 'half', half, 'exit', 'darura'),
      mk('ishaExit', 'ishaExit', n.fajr, 'exit2', null),
    ] },
  ];
  P.forEach(p => { p.name = PRAYER_NAMES[p.key]; });

  // keep each prayer's boundaries in order after minute rounding
  P.forEach(p => {
    for (let i = 1; i < p.marks.length; i++) {
      const a = p.marks[i - 1], b = p.marks[i];
      if (Number.isFinite(a.at) && Number.isFinite(b.at) && b.at < a.at) b.at = a.at;
    }
  });

  // flat lookup: mark key → rounded time
  const T = {};
  P.forEach(p => p.marks.forEach(m => { T[m.key] = m.at; }));
  return { dt, e, polar: false, prayers: P, T, night: { third, half } };
}
