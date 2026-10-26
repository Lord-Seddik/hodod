// Low-precision solar position (≈1 arc-minute; good to about a minute of time).
// All times returned by solar() are fractional UT hours on the given date.

export const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const R = Math.PI / 180;

export const sind = x => Math.sin(x * R);
export const cosd = x => Math.cos(x * R);
export const tand = x => Math.tan(x * R);
export const asind = x => Math.asin(x) / R;
export const acosd = x => Math.acos(x) / R;
export const atand = x => Math.atan(x) / R;
export const atan2d = (y, x) => Math.atan2(y, x) / R;
const fixAngle = a => ((a % 360) + 360) % 360;
const fixHour = h => ((h % 24) + 24) % 24;
export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Julian day at 0h UT of a Gregorian calendar date. */
export function julianDay(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

/** Sun declination (°) and equation of time (hours) for a Julian day. */
export function sunPosition(jd) {
  const d = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * d);
  const q = fixAngle(280.459 + 0.98564736 * d);
  const L = fixAngle(q + 1.915 * sind(g) + 0.020 * sind(2 * g));
  const e = 23.439 - 0.00000036 * d;
  const RA = fixHour(atan2d(cosd(e) * sind(L), cosd(L)) / 15);
  const decl = asind(sind(e) * sind(L));
  let eqt = q / 15 - RA;
  eqt = ((eqt + 12) % 24 + 24) % 24 - 12;
  return { decl, eqt };
}

/** Sun altitude (°) at an epoch-ms instant for a given lat/lon. */
export function sunAltitude(ms, lat, lon) {
  const { decl, eqt } = sunPosition(ms / DAY + 2440587.5);
  const ut = (((ms % DAY) + DAY) % DAY) / HOUR;
  const H = 15 * (ut - (12 - lon / 15 - eqt));
  return asind(sind(lat) * sind(decl) + cosd(lat) * cosd(decl) * cosd(H));
}

/**
 * Solar events for one date.
 * dhuhr: solar noon (UT hours).
 * event(alt, dir): UT hours when the sun is at `alt` degrees,
 *   dir = -1 morning, +1 evening. `alt` may be a function of declination.
 *   Returns NaN when the sun never reaches that altitude.
 * asrAltitude(n): altitude function for shadow factor n (1 = standard, 2 = Hanafi).
 */
export function solar(y, m, d, lat, lon) {
  const jd0 = julianDay(y, m, d);
  const sp = t => sunPosition(jd0 + t / 24);
  const noon = t => 12 - lon / 15 - sp(t).eqt;

  let dhuhr = noon(12 - lon / 15);
  dhuhr = noon(dhuhr);
  dhuhr = noon(dhuhr);

  function event(alt, dir) {
    let t = dhuhr + dir * 6;
    for (let i = 0; i < 5; i++) {
      const { decl } = sp(t);
      const a = typeof alt === 'function' ? alt(decl) : alt;
      const c = (sind(a) - sind(lat) * sind(decl)) / (cosd(lat) * cosd(decl));
      if (c < -1 || c > 1) return NaN;
      t = noon(t) + dir * acosd(c) / 15;
    }
    return t;
  }

  const asrAltitude = n => decl => atand(1 / (n + tand(Math.abs(lat - decl))));
  return { dhuhr, event, asrAltitude };
}
