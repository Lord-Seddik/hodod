import { describe, it, expect } from 'vitest';
import { CITIES } from '../src/data/cities.js';
import { METHODS } from '../src/data/methods.js';
import { solar, HOUR } from '../src/core/astro.js';

const localHour = (ms, tz) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
    .formatToParts(ms).map(x => [x.type, x.value]));
  return +p.hour + +p.minute / 60;
};

describe('city data', () => {
  it('every entry is well-formed', () => {
    for (const c of CITIES) {
      const id = c.ar + ' / ' + c.en;
      expect(c.ar && c.en && c.country, id).toBeTruthy();
      expect(c.lat >= -90 && c.lat <= 90 && c.lon >= -180 && c.lon <= 180, id).toBe(true);
      expect(METHODS[c.method], id).toBeTruthy();
      expect(() => new Intl.DateTimeFormat('en', { timeZone: c.tz }), id).not.toThrow();
    }
  });

  it('no duplicate city within a country', () => {
    const seen = new Set();
    for (const c of CITIES) {
      const k = c.ar + '|' + c.country;
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
    }
  });

  it('solar noon falls at a plausible local hour (catches wrong sign or time zone)', () => {
    // equinox, before EU DST; US DST already on
    const [y, m, d] = [2026, 3, 20];
    for (const c of CITIES) {
      const noon = Date.UTC(y, m - 1, d) + solar(y, m, d, c.lat, c.lon).dhuhr * HOUR;
      const h = localHour(noon, c.tz);
      expect(h > 10.5 && h < 14.5, `${c.en} (${c.tz}) noon at ${h.toFixed(2)}`).toBe(true);
    }
  });
});
