// User settings (persisted) and the active location.
import { CITIES } from '../data/cities.js';
import { METHODS } from '../data/methods.js';

export const DEFAULTS = {
  // location
  cityIdx: -1, custom: null,
  // calculation
  method: 'AUTO', customF: 18, customI: 17, asr: 'std', isha: 'method',
  // boundary definitions
  isfar: 6, sunAlt: 5, stars: 8, istiwa: 5, nightEnd: 'fajr', highLat: 'angle', iht: 0,
  // alerts
  alerts: true, exitB: 15, karB: 10, entry: false, sound: false, notify: false,
  // display
  h12: '24', nu: 'latn', theme: 'auto',
};

/** [min, max] for numeric settings; also used to sanitize stored values. */
export const LIMITS = {
  customF: [5, 25], customI: [5, 25], isfar: [1, 12], sunAlt: [1, 15], stars: [4, 14],
  istiwa: [0, 20], iht: [0, 10], exitB: [1, 120], karB: [1, 120],
};

const STORE_KEY = 'hudud-alwaqt-v1';

/** The live settings object. Mutate in place; call saveSettings() after. */
export const cfg = { ...DEFAULTS };

function sanitize() {
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    const v = parseFloat(cfg[k]);
    cfg[k] = Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : DEFAULTS[k];
  }
  if (cfg.method !== 'AUTO' && !METHODS[cfg.method]) cfg.method = 'AUTO';
  if (!CITIES[cfg.cityIdx]) cfg.cityIdx = -1;
}

try {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) Object.assign(cfg, JSON.parse(raw));
} catch { /* storage unavailable */ }
sanitize();

export function saveSettings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

/** Restore defaults but keep the chosen location. */
export function resetSettings() {
  const keep = { cityIdx: cfg.cityIdx, custom: cfg.custom };
  for (const k of Object.keys(cfg)) delete cfg[k];
  Object.assign(cfg, DEFAULTS, keep);
}

export const BROWSER_TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
})();

export function validTz(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

// first run: pick the first city in the browser's time zone
if (cfg.cityIdx < 0 && !cfg.custom) {
  const i = CITIES.findIndex(c => c.tz === BROWSER_TZ);
  cfg.cityIdx = i < 0 ? 0 : i;
}

/** Index of the built-in city closest to a point (great-circle distance). */
export function nearestCity(lat, lon) {
  const r = Math.PI / 180;
  let best = 0, bestCos = -2;
  CITIES.forEach((c, i) => {
    const cosD = Math.sin(lat * r) * Math.sin(c.lat * r) + Math.cos(lat * r) * Math.cos(c.lat * r) * Math.cos((lon - c.lon) * r);
    if (cosD > bestCos) { bestCos = cosD; best = i; }
  });
  return best;
}

/** The active location: { name, country, lat, lon, tz, method }. */
export const loc = {};

export function applyLocation() {
  let next;
  if (cfg.custom && validTz(cfg.custom.tz)) {
    const lat = +cfg.custom.lat, lon = +cfg.custom.lon;
    // custom points inherit the official method of the nearest known city
    next = { name: cfg.custom.name || 'موقع مخصّص', country: '', lat, lon, tz: cfg.custom.tz, method: CITIES[nearestCity(lat, lon)].method };
  } else {
    const c = CITIES[cfg.cityIdx] || CITIES[0];
    next = { name: c.ar, country: c.country, lat: c.lat, lon: c.lon, tz: c.tz, method: c.method };
  }
  Object.assign(loc, next);
}
applyLocation();

export const methodKey = () => (cfg.method === 'AUTO' ? loc.method : cfg.method);

/** Bumped whenever settings/location change; computation caches key on it. */
export const version = { n: 0 };
export function bumpVersion() { version.n++; }
