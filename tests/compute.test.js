import { describe, it, expect, beforeEach } from 'vitest';
import { cfg, DEFAULTS, applyLocation, bumpVersion } from '../src/core/state.js';
import { build } from '../src/core/compute.js';
import { CITIES } from '../src/data/cities.js';

const cityIdx = en => CITIES.findIndex(c => c.en.includes(en));

function useCity(en, overrides = {}) {
  Object.assign(cfg, DEFAULTS, { cityIdx: cityIdx(en), custom: null }, overrides);
  applyLocation();
  bumpVersion();
}

function useCustom(lat, lon, tz) {
  Object.assign(cfg, DEFAULTS, { custom: { lat, lon, tz, name: 'test' } });
  applyLocation();
  bumpVersion();
}

/** HH:MM in a time zone */
const hhmm = (ms, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

describe('prayer boundaries', () => {
  beforeEach(() => useCity('Makkah'));

  it('Makkah, 2026-03-20: main times are in the expected window', () => {
    const B = build({ y: 2026, m: 3, d: 20 });
    expect(B.polar).toBe(false);
    const tz = 'Asia/Riyadh';
    // reference (Umm al-Qura): Fajr ~05:12, Sunrise ~06:27, Dhuhr ~12:31, Asr ~15:55, Maghrib ~18:35
    const near = (key, ref, tol = 4) => expect(Math.abs(toMin(hhmm(B.T[key], tz)) - toMin(ref))).toBeLessThanOrEqual(tol);
    near('fajr', '05:12');
    near('sunrise', '06:27');
    near('dhuhr', '12:31');
    near('asr', '15:55');
    near('maghrib', '18:35');
    // Umm al-Qura: Isha is 90 minutes after Maghrib
    expect(Math.round((B.T.isha - B.e.sunset) / 60000)).toBeGreaterThanOrEqual(90);
  });

  it('Umm al-Qura uses 120 minutes for Isha in Ramadan', () => {
    // 2026-03-01 falls in Ramadan 1447
    const B = build({ y: 2026, m: 3, d: 1 });
    expect(B.e.M.ishaMin).toBe(120);
  });

  it('marks are finite and ordered within each prayer, all year, many cities', () => {
    for (const en of ['Makkah', 'Cairo', 'London', 'Jakarta', 'Oslo', 'Reykjavik', 'Sydney', 'New York']) {
      useCity(en);
      for (let m = 1; m <= 12; m++) {
        for (const d of [1, 15]) {
          const B = build({ y: 2026, m, d });
          if (B.polar) continue;
          for (const p of B.prayers) {
            for (let i = 0; i < p.marks.length; i++) {
              const mk = p.marks[i];
              expect(Number.isFinite(mk.at), `${en} ${m}/${d} ${mk.key}`).toBe(true);
              if (i) expect(mk.at, `${en} ${m}/${d} ${mk.key}`).toBeGreaterThanOrEqual(p.marks[i - 1].at);
            }
          }
        }
      }
    }
  });

  it('Hanafi Asr starts at the 2× shadow and drops the khilaf mark', () => {
    useCity('Karachi', { asr: 'hanafi' });
    const B = build({ y: 2026, m: 6, d: 1 });
    const asr = B.prayers.find(p => p.key === 'asr');
    expect(asr.marks.map(m => m.key)).toEqual(['asr', 'isfirar', 'sunset']);
    expect(B.T.asr).toBeGreaterThanOrEqual(Math.floor(B.e.asr2 / 60000) * 60000);
  });

  it('high latitude in summer: twilight is estimated, not missing', () => {
    useCity('Oslo');
    const B = build({ y: 2026, m: 6, d: 21 });
    expect(B.polar).toBe(false);
    expect(B.e.est.fajr || B.e.est.isha).toBeTruthy();
  });

  it('polar night is reported as polar', () => {
    useCustom(78.22, 15.65, 'Arctic/Longyearbyen'); // Svalbard
    expect(build({ y: 2026, m: 12, d: 21 }).polar).toBe(true);
  });

  it('precaution margin moves entries later and exits earlier', () => {
    const dt = { y: 2026, m: 3, d: 20 };
    const base = build(dt).T;
    useCity('Makkah', { iht: 2 });
    const safe = build(dt).T;
    expect(safe.fajr - base.fajr).toBe(2 * 60000);
    expect(base.sunrise - safe.sunrise).toBe(2 * 60000);
  });
});
