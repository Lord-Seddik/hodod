// Prayer boundaries for a date: raw solar events → per-madhab timelines → combined rows.
import { solar, clamp, MIN, HOUR } from './astro.js';
import { cfg, loc, methodKey, isAdvanced, activeMadhabs, asrAt2, whiteIsha, version } from './state.js';
import { addDays, hijriMonth } from './time.js';
import { METHODS } from '../data/methods.js';
import { PRAYERS, PRAYER_ORDER, FARD, CONTEXT, MADHABS, VALID, combineSafe, combineMajority, summarize } from '../data/rulings.js';

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
  const adjust = key === 'CUSTOM' ? {} : (M.adjust || {});
  return { fajrAngle, ishaAngle, ishaMin, ishaDesc, adjust, name: M.name };
}

// ── per-version caches (cleared automatically when settings change)
let cacheVersion = -1;
const eventCache = new Map(), buildCache = new Map(), rowCache = new Map();
function syncCaches() {
  if (cacheVersion !== version.n) { eventCache.clear(); buildCache.clear(); rowCache.clear(); cacheVersion = version.n; }
}
const dkey = dt => dt.y + '-' + dt.m + '-' + dt.d;

/** Raw (unrounded) solar events for a date, in epoch ms. */
export function dayEvents(dt) {
  syncCaches();
  const ck = dkey(dt);
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
  let white = S.event(-18, 1);

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
      const pw = portion(18) * night;
      if (!Number.isFinite(white) || white - sunset > pw) { white = sunset + pw; est.white = 1; }
    }
    if (!Number.isFinite(fajr)) { fajr = sunrise - night / 2; est.fajr = 1; }
    if (!Number.isFinite(isha)) { isha = sunset + night / 2; est.isha = 1; }
    if (!Number.isFinite(white)) { white = sunset + night / 2; est.white = 1; }
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
    isfirar = clamp(isfirar, asr1, sunset);
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
    // Hanafi Isha: the white twilight, but never before the official Isha
    ishaWhite: Math.max(ishaMs, toMs(white)),
  };
  eventCache.set(ck, r);
  return r;
}

/** Round to the minute on the cautious side: entries later, warnings and exits earlier. */
export function adjust(ms, up) {
  if (!Number.isFinite(ms)) return NaN;
  const margin = (+cfg.iht || 0) * MIN;
  return up ? Math.ceil(ms / MIN) * MIN + margin : Math.floor(ms / MIN) * MIN - margin;
}

// ── combining madhabs

/** Combine the active madhabs' types: majority (recommended), the one (single) or the safest (several). */
export function combineTypes(types) {
  if (!isAdvanced()) return combineMajority(types);
  return types.length === 1 ? types[0] : combineSafe(types);
}

const isValid = t => VALID.has(t);
const typeOf = rule => (rule.seg === 'ok' && rule.fadila ? 'fadila' : rule.seg);

// ── per-date build

/**
 * Everything for one date: each applicable prayer with its marks (boundaries),
 * each active madhab's slices, and the combined row.
 *
 * mark: { key, at, label, short, sub, rules{m: rule}, rulings[{madhab,name,short,type,note}],
 *         type (combined at the mark), desc, quiet, exit, entry, context }
 * slice: { from, to, type, valid, prayer, mark, madhab }
 */
export function build(dt) {
  syncCaches();
  const ck = dkey(dt);
  if (buildCache.has(ck)) return buildCache.get(ck);
  const result = computeBuild(dt);
  buildCache.set(ck, result);
  return result;
}

function computeBuild(dt) {
  const e = dayEvents(dt);
  if (e.polar) return { dt, e, polar: true, prayers: {}, list: [], T: {}, context: [] };

  const n = dayEvents(addDays(dt, 1));
  const nightEnd = cfg.nightEnd === 'sunrise' ? n.sunrise : n.fajr;
  const night = nightEnd - e.sunset;
  const third = Math.max(e.sunset + night / 3, e.isha);
  const half = Math.max(e.sunset + night / 2, third);
  // Duha is best from a quarter of the day (when the heat rises) until istiwa
  const duhaBest = clamp(e.sunrise + (e.sunset - e.sunrise) / 4, e.ishraq, e.istiwa);
  const x = { third, half, duhaBest };

  const adv = isAdvanced(), active = activeMadhabs();
  const picked = MADHABS.filter(m => active.includes(m.key));
  const whiteLater = active.some(whiteIsha) && e.ishaWhite - e.isha > 30000;
  const ctx = {
    cfg, adv,
    fajrAngle: e.M.fajrAngle,
    ishaDesc: e.M.ishaDesc,
    est: k => (e.est[k] ? ' · تقديري' : ''),
    has: k => active.includes(k),
    asrAt2,
    whiteLater,
    whiteFor: m => whiteLater && whiteIsha(m),
    anyAsr2: active.some(asrAt2),
    friday: new Date(Date.UTC(dt.y, dt.m - 1, dt.d)).getUTCDay() === 5,
  };

  const resolve = (by, m, prevRule) => {
    let v = by[m] !== undefined ? by[m] : by.all;
    if (typeof v === 'function') v = v(ctx, m);
    return v === 'same' || v === undefined ? (prevRule || { seg: 'prev', note: 'لم يدخل الوقت بعد.' }) : v;
  };

  const prayers = {}, list = [], T = {};
  for (const key of PRAYER_ORDER) {
    const def = PRAYERS[key];
    if (def.friday && !ctx.friday) continue;
    const P = buildPrayer(key, def, e, n, x, ctx, picked, resolve);
    prayers[key] = P;
    list.push(P);
    P.marks.forEach(m => { if (!(m.key in T)) T[m.key] = m.at; });
  }

  // context stretches outside the obligatory prayers (sunrise prohibition, Duha, istiwa)
  const context = CONTEXT.map(c => {
    const rules = {};
    picked.forEach(m => { rules[m.key] = resolve(c.by, m.key, null); });
    const rulings = picked.map(m => ({ madhab: m.key, name: m.name, short: m.label, type: rules[m.key].seg, note: rules[m.key].note }));
    return {
      key: c.key, from: c.from(e), to: c.to(e), title: c.title, short: c.title, label: c.title, rules, rulings,
      desc: describe(rulings, adv),
    };
  });

  return { dt, e, polar: false, ctx, prayers, list, T, context, night: { third, half } };
}

/**
 * Each active madhab's status for a prayer at a moment: { madhab, name, short, type, note }.
 * Used for the "now" box, so the text matches the present stretch, not the boundary that opened it.
 */
export function rulingsAt(B, prayerKey, t) {
  const P = B?.prayers?.[prayerKey];
  if (!P) return [];
  return MADHABS.filter(m => activeMadhabs().includes(m.key)).map(m => {
    const list = P.slices[m.key] || [];
    const s = list.find(x => x.from <= t && t < x.to);
    if (s) return { madhab: m.key, name: m.name, short: m.label, type: s.type, note: s.rule.note };
    const before = !list.length || t < list[0].from;
    return { madhab: m.key, name: m.name, short: m.label, type: before ? 'prev' : 'out', note: before ? 'لم يدخل الوقت بعد.' : 'خرج الوقت.' };
  });
}

/** "Now"-box text for a set of rulings: one sentence (recommended) or one line per group (advanced). */
export function describe(rulings, adv = isAdvanced()) {
  if (!rulings.length) return '';
  if (!adv) return summarize(rulings);
  const groups = [];
  for (const r of rulings) {
    const g = groups.find(x => x.note === r.note);
    if (g) g.names.push(r.name); else groups.push({ note: r.note, names: [r.name] });
  }
  return groups.length === 1 ? groups[0].note : groups.map(g => g.names.join(' و') + ': ' + g.note).join('\n');
}

function buildPrayer(key, def, e, n, x, ctx, picked, resolve) {
  const defs = def.marks.filter(md => !md.when || md.when(ctx));
  const last = {};
  const marks = defs.map(md => {
    const rules = md.by ? {} : null;
    let entry = false;
    if (md.by) {
      for (const m of picked) {
        const before = last[m.key];
        const rule = resolve(md.by, m.key, before);
        if (isValid(typeOf(rule)) && !(before && isValid(typeOf(before)))) entry = true;
        rules[m.key] = rule;
        last[m.key] = rule;
      }
    }
    const raw = md.at(e, n, x);
    return { def: md, key: md.key, raw, at: adjust(raw, md.round === 'up' || entry), rules, entry, context: !!md.context };
  });

  // keep boundaries in order after rounding
  for (let i = 1; i < marks.length; i++) {
    if (Number.isFinite(marks[i - 1].at) && Number.isFinite(marks[i].at) && marks[i].at < marks[i - 1].at) marks[i].at = marks[i - 1].at;
  }

  // each madhab's slices: merge runs of the same rule, then split the best time
  const slices = {};
  for (const m of picked) {
    const out = [];
    let run = null;
    const flush = to => {
      if (!run || !(to > run.from)) return;
      const rule = run.rule, base = { prayer: key, mark: run.mark, madhab: m.key, rule };
      if (rule.seg === 'ok' && rule.fadila === 'early') {
        const cut = Math.min(run.from + cfg.fadilaMin * MIN, to);
        out.push({ ...base, from: run.from, to: cut, type: 'fadila' });
        if (to > cut) out.push({ ...base, from: cut, to, type: 'ok', fadilaEnd: true });
      } else {
        out.push({ ...base, from: run.from, to, type: typeOf(rule) });
      }
    };
    for (const mk of marks) {
      if (!mk.rules) { flush(mk.at); run = null; continue; }
      const rule = mk.rules[m.key];
      if (run && run.rule === rule) continue;
      flush(mk.at);
      run = { rule, from: mk.at, mark: mk };
    }
    out.forEach(s => { s.valid = isValid(s.type); });
    slices[m.key] = out;
  }

  // per-mark display: each madhab's type at the mark, the combined type, text
  let prevType = null, prevRules = null;
  marks.forEach((mk, i) => {
    const md = mk.def;
    mk.label = md.label; mk.short = md.short;
    mk.sub = typeof md.sub === 'function' ? md.sub(ctx) : (md.sub || '');
    if (!mk.rules) { mk.type = null; mk.rulings = null; mk.desc = ''; mk.quiet = false; return; }
    mk.rulings = picked.map(m => {
      const s = slices[m.key].find(sl => sl.from <= mk.at && mk.at < sl.to);
      const rule = mk.rules[m.key];
      return { madhab: m.key, name: m.name, short: m.label, type: s ? s.type : rule.seg, note: rule.note };
    });
    mk.type = combineTypes(mk.rulings.map(r => r.type));
    mk.agree = new Set(mk.rulings.map(r => r.type)).size === 1;
    mk.exit = mk.type === 'out' || mk.type === 'none';
    if (mk.exit && md.exitLabel) mk.label = md.exitLabel;
    mk.desc = describe(mk.rulings, ctx.adv);
    // a boundary that changes nothing for the active view is hidden
    const unchanged = prevRules && picked.every(m => {
      const a = prevRules[m.key], b = mk.rules[m.key];
      return a === b || (a.seg === b.seg && (a.seg === 'out' || a.seg === 'prev'));
    });
    const allPrev = mk.rulings.every(r => r.type === 'prev');
    mk.quiet = i > 0 && !mk.context && (allPrev || (ctx.adv ? unchanged : (unchanged || mk.type === prevType)));
    if (i === 0 && allPrev) mk.quiet = true;
    prevType = mk.type; prevRules = mk.rules;
  });

  // the prayer's window: from the first madhab's entry to the last madhab's exit
  // (recommended: where the majority holds it valid)
  const valid = Object.values(slices).flat().filter(s => s.valid);
  const union = valid.length ? { from: Math.min(...valid.map(s => s.from)), to: Math.max(...valid.map(s => s.to)) } : null;
  const row = combineRows(picked.map(m => slices[m.key].filter(s => s.valid)), union);
  const window = ctx.adv ? union : (row.length ? { from: row[0].from, to: row[row.length - 1].to } : null);

  return { key, name: def.name, fard: def.fard, def, marks, slices, window, row };
}

/**
 * Combine several rows (each a sorted list of non-overlapping slices) into one,
 * using combineTypes on every stretch between boundaries. Missing = 'none'.
 * Each output slice keeps `parts` (the rows' slices there) for prayer/mark lookup.
 */
export function combineRows(rows, span) {
  if (rows.length === 1) return rows[0].filter(s => !span || (s.to > span.from && s.from < span.to));
  const cuts = new Set();
  rows.forEach(r => r.forEach(s => { cuts.add(s.from); cuts.add(s.to); }));
  if (span) { cuts.add(span.from); cuts.add(span.to); }
  const times = [...cuts].filter(t => !span || (t >= span.from && t <= span.to)).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < times.length - 1; i++) {
    const a = times[i], b = times[i + 1];
    if (!(b > a)) continue;
    const parts = rows.map(r => r.find(s => s.from <= a && a < s.to) || null);
    if (parts.every(p => !p)) continue;
    const type = combineTypes(parts.map(p => (p ? p.type : 'none')));
    if (type === 'none') continue;
    const lead = pickLead(parts);
    const prevOut = out[out.length - 1];
    if (prevOut && prevOut.to === a && prevOut.type === type && prevOut.prayer === lead.prayer && prevOut.key === lead.key) {
      prevOut.to = b; continue;
    }
    out.push({ from: a, to: b, type, valid: VALID.has(type), prayer: lead.prayer, key: lead.key, mark: lead.mark, title: lead.title, dt: lead.dt, parts });
  }
  return out;
}

/** The prayer a combined stretch belongs to: the most common one; its most recently opened mark. */
function pickLead(parts) {
  const ps = parts.filter(Boolean);
  const pool = ps.some(p => p.valid) ? ps.filter(p => p.valid) : ps;
  const count = {};
  pool.forEach(p => { count[p.prayer] = (count[p.prayer] || 0) + 1; });
  const prayer = Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
  const cands = pool.filter(p => p.prayer === prayer).sort((a, b) => b.from - a.from);
  const p = cands[0];
  return { prayer, mark: p.mark, title: p.title, dt: p.dt, key: p.key || prayer };
}

// ── day rows

/**
 * One madhab's continuous row over the given dates: at each moment, the latest
 * started obligatory prayer that is still valid; otherwise the context
 * (sunrise prohibition, Duha, istiwa).
 */
export function madhabDayRow(m, dates) {
  syncCaches();
  const ck = 'd|' + m + '|' + dates.map(dkey).join(',');
  if (rowCache.has(ck)) return rowCache.get(ck);
  const items = [];
  for (const dt of dates) {
    const B = build(dt);
    if (B.polar) continue;
    for (const key of FARD) {
      const P = B.prayers[key];
      const sl = (P?.slices[m] || []).filter(s => s.valid);
      if (!sl.length) continue;
      const start = sl[0].from;
      sl.forEach(s => items.push({ ...s, start, dt, title: P.name, key: key + '|' + dkey(dt) }));
    }
    for (const c of B.context) {
      const rule = c.rules[m];
      if (rule && c.to > c.from) items.push({ from: c.from, to: c.to, type: rule.seg, valid: false, prayer: c.key, mark: c, title: c.title, start: -Infinity, dt, key: c.key + '|' + dkey(dt), context: true });
    }
  }
  const cuts = [...new Set(items.flatMap(s => [s.from, s.to]))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1];
    const cover = items.filter(s => s.from <= a && a < s.to);
    if (!cover.length) continue;
    const pick = cover.filter(s => s.valid).sort((p, q) => q.start - p.start)[0] || cover.find(s => s.context) || cover[0];
    const last = out[out.length - 1];
    if (last && last.to === a && last.key === pick.key && last.type === pick.type && last.mark === pick.mark) { last.to = b; continue; }
    out.push({ ...pick, from: a, to: b });
  }
  rowCache.set(ck, out);
  return out;
}

/** The row shown for the active view across the given dates (combined over the active madhabs). */
export function primaryDayRow(dates) {
  syncCaches();
  const ck = 'p|' + dates.map(dkey).join(',');
  if (rowCache.has(ck)) return rowCache.get(ck);
  const rows = activeMadhabs().map(m => madhabDayRow(m, dates));
  const out = combineRows(rows);
  rowCache.set(ck, out);
  return out;
}

/** Rows to draw: one combined row, or (several madhabs in advanced mode) the safe row plus one per madhab. */
export function displayRows(dates, prayerKey) {
  const active = activeMadhabs();
  const names = Object.fromEntries(MADHABS.map(m => [m.key, m.name]));
  let perMadhab, combined;
  if (prayerKey) {
    const P = dates.map(build).map(B => B.prayers?.[prayerKey]).find(Boolean);
    if (!P) return [];
    perMadhab = active.map(m => ({ label: names[m], madhab: m, slices: P.slices[m].filter(s => s.valid) }));
    combined = P.row;
  } else {
    perMadhab = active.map(m => ({ label: names[m], madhab: m, slices: madhabDayRow(m, dates) }));
    combined = primaryDayRow(dates);
  }
  if (isAdvanced() && active.length > 1) return [{ label: 'الآمن للجميع', safe: true, slices: combined }, ...perMadhab];
  return [{ label: '', slices: combined }];
}

