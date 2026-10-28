// Prayer boundaries for a date: raw solar events → rounded, ordered marks.
import { solar, clamp, MIN, HOUR } from './astro.js';
import { cfg, loc, methodKey, hanafiAsr, ishaRule, version } from './state.js';
import { addDays, hijriMonth } from './time.js';
import { METHODS } from '../data/methods.js';
import { MARKS, MADHABS, PRAYER_NAMES, combineSegments } from '../data/rulings.js';

/** Effective Fajr/Isha parameters for a date (Isha may depend on Ramadan). */
export function methodParams(dt) {
  const key = methodKey(), M = METHODS[key] || METHODS.MWL;
  const fajrAngle = key === 'CUSTOM' ? +cfg.customF : M.fajr;
  let ishaAngle = null, ishaMin = null, ishaDesc = '';
  const rule = ishaRule();
  if (rule === 'red') { ishaAngle = 15; ishaDesc = 'الشفق الأحمر 15°'; }
  else if (rule === 'white') { ishaAngle = 18; ishaDesc = 'الشفق الأبيض 18°' + (cfg.isha === 'auto' ? ' (أبو حنيفة)' : ''); }
  else if (key === 'CUSTOM') { ishaAngle = +cfg.customI; ishaDesc = ishaAngle + '° تحت الأفق'; }
  else if (M.ishaMin) {
    ishaMin = (M.ishaMinRamadan && hijriMonth(dt) === 9) ? M.ishaMinRamadan : M.ishaMin;
    ishaDesc = ishaMin + ' دقيقة بعد المغرب';
  } else { ishaAngle = M.isha; ishaDesc = ishaAngle + '° تحت الأفق'; }
  const adjust = key === 'CUSTOM' ? {} : (M.adjust || {});
  return { fajrAngle, ishaAngle, ishaMin, ishaDesc, adjust, name: M.name };
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
  let humra = S.event(-cfg.humra, -1);
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

    if (!Number.isFinite(humra)) { humra = sunrise - (sunrise - isfar) * Math.min(1, cfg.humra / cfg.isfar); est.humra = 1; }
    isfar = clamp(isfar, fajr, sunrise);
    humra = clamp(humra, isfar, sunrise);
    ishraq = clamp(ishraq, sunrise, dh - cfg.istiwa / 60);
    asr1 = clamp(asr1, dh, sunset);
    asr2 = clamp(asr2, asr1, sunset);
    const asrStart = hanafiAsr() ? asr2 : asr1;
    isfirar = clamp(isfirar, asrStart, sunset);
    stars = clamp(stars, sunset, isha);
  }

  // official fixed offsets (e.g. Diyanet temkin) move the published entry/exit
  // times only; istiwa stays at true solar noon and Isha keeps its own rule
  const A = M.adjust, off = k => (A[k] || 0) / 60;
  const base = Date.UTC(dt.y, dt.m - 1, dt.d);
  const toMs = t => (Number.isFinite(t) ? base + t * HOUR : NaN);
  const sunriseMs = toMs(sunrise + off('sunrise')), sunsetMs = toMs(sunset + off('maghrib'));
  const starsMs = toMs(stars), ishaMs = toMs(isha);
  // an earlier official sunrise must not fall before the boundaries leading up to it
  const humraMs = Math.min(toMs(humra), sunriseMs), isfarMs = Math.min(toMs(isfar), humraMs);
  // Maliki narrow Maghrib: a fixed span after sunset, never past the stars or Isha
  const maghribMukhtar = Math.max(sunsetMs, Math.min(sunsetMs + cfg.maghribMin * MIN, starsMs, ishaMs));
  const r = {
    dt, polar, est, M,
    fajr: toMs(fajr), isfar: isfarMs, humra: humraMs, sunrise: sunriseMs, ishraq: toMs(ishraq),
    istiwa: toMs(dh) - cfg.istiwa * MIN, dhuhr: toMs(dh + off('dhuhr')),
    asr1: toMs(asr1 + off('asr')), asr2: toMs(asr2 + off('asr')),
    isfirar: toMs(isfirar), sunset: sunsetMs, maghribMukhtar, stars: starsMs, isha: ishaMs,
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
 *   nahy   – start of a forbidden time for voluntary prayer
 *   end    – end of a forbidden time
 * `rulings` lists each selected madhab's { madhab, name, seg, note } for the
 * time from this mark until the next one; `seg` combines them (null = none).
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

  const hanafi = hanafiAsr();
  const asrStart = hanafi ? e.asr2 : e.asr1;

  const picked = MADHABS.filter(m => cfg.madhabs.includes(m.key));
  const ctx = {
    cfg,
    fajrAngle: e.M.fajrAngle,
    ishaDesc: e.M.ishaDesc,
    est: k => (e.est[k] ? ' · تقديري' : ''),
    has: k => cfg.madhabs.includes(k),
    hanafiAsr: hanafi,
    friday: new Date(Date.UTC(dt.y, dt.m - 1, dt.d)).getUTCDay() === 5,
  };
  const mk = (key, textKey, t, kind) => {
    const T = MARKS[textKey];
    // `friday` overrides a madhab's ruling on Fridays (Shafi'i istiwa)
    const ruleFor = m => (ctx.friday && T.friday?.[m.key]) || T.by[m.key] || T.by.all;
    const rulings = T.by ? picked.map(m => ({ madhab: m.key, name: m.name, short: m.label, ...ruleFor(m) })) : null;
    // madhabs sharing the same note are grouped: "المالكية والشافعية: …"
    const groups = [];
    for (const r of rulings || []) {
      const g = groups.find(x => x.note === r.note);
      if (g) g.names.push(r.name); else groups.push({ note: r.note, seg: r.seg, names: [r.name] });
    }
    groups.forEach(g => { g.label = g.names.join(' و'); });
    return {
      key, raw: t, at: adjust(t, kind), kind,
      seg: rulings ? combineSegments(rulings.map(r => r.seg)) : null,
      rulings, groups,
      agree: !rulings || new Set(rulings.map(r => r.seg)).size === 1,
      label: T.label, short: T.short,
      sub: typeof T.sub === 'function' ? T.sub(ctx) : (T.sub || ''),
      // one shared note, or one line per group of madhabs
      desc: groups.length <= 1 ? (groups[0]?.note || '') : groups.map(g => g.label + ': ' + g.note).join('\n'),
    };
  };

  // a boundary that exists only in some madhabs is shown only when one of them is selected
  const onlyFor = (keys, mark) => (keys.some(ctx.has) ? [mark] : []);

  const P = [
    { key: 'fajr', marks: [
      mk('fajr', 'fajr', e.fajr, 'start'),
      mk('isfar', 'isfar', e.isfar, 'bound'),
      ...onlyFor(['shafii'], mk('humra', 'humra', e.humra, 'bound')),
      mk('sunrise', 'sunrise', e.sunrise, 'exit'),
      mk('ishraq', 'ishraq', e.ishraq, 'end'),
    ] },
    { key: 'dhuhr', marks: [
      mk('istiwa', 'istiwa', e.istiwa, 'nahy'),
      mk('dhuhr', 'dhuhr', e.dhuhr, 'start'),
      mk('dhuhrExit', 'dhuhrExit', asrStart, 'exit'),
    ] },
    { key: 'asr', marks: hanafi ? [
      mk('asr', 'asrHanafi', e.asr2, 'start'),
      mk('isfirar', 'isfirar', e.isfirar, 'bound'),
      mk('sunset', 'sunset', e.sunset, 'exit'),
    ] : [
      mk('asr', 'asr', e.asr1, 'start'),
      mk('asr2', 'asr2', e.asr2, 'bound'),
      mk('isfirar', 'isfirar', e.isfirar, 'bound'),
      mk('sunset', 'sunset', e.sunset, 'exit'),
    ] },
    { key: 'maghrib', marks: [
      mk('maghrib', 'maghrib', e.sunset, 'start'),
      ...onlyFor(['maliki'], mk('maghribMukhtar', 'maghribMukhtar', e.maghribMukhtar, 'bound')),
      mk('stars', 'stars', e.stars, 'bound'),
      mk('maghribExit', 'maghribExit', e.isha, 'exit'),
    ] },
    { key: 'isha', marks: [
      mk('isha', 'isha', e.isha, 'start'),
      mk('third', 'third', third, 'bound'),
      mk('half', 'half', half, 'bound'),
      mk('ishaExit', 'ishaExit', n.fajr, 'exit'),
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
