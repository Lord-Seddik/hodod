import { describe, it, expect } from 'vitest';
import { cfg, DEFAULTS, applyLocation, bumpVersion, hanafiAsr } from '../src/core/state.js';
import { build } from '../src/core/compute.js';
import { CITIES } from '../src/data/cities.js';
import { MARKS, MADHABS, SEGMENTS, combineSegments, majoritySegment } from '../src/data/rulings.js';

const dt = { y: 2026, m: 3, d: 20 };
function use(madhabs, overrides = {}) {
  Object.assign(cfg, DEFAULTS, { cityIdx: CITIES.findIndex(c => c.en === 'Cairo'), custom: null, madhabs, rules: 'advanced' }, overrides);
  applyLocation();
  bumpVersion();
}
const mark = (B, key) => B.prayers.flatMap(p => p.marks).find(m => m.key === key);

describe('rulings data', () => {
  it('every boundary rules for all four madhabs with a known type and a note', () => {
    for (const [key, T] of Object.entries(MARKS)) {
      if (!T.by) continue;
      for (const m of MADHABS) {
        const r = T.by[m.key] || T.by.all;
        expect(r, key + ' / ' + m.key).toBeTruthy();
        expect(SEGMENTS[r.seg], key + ' / ' + m.key).toBeTruthy();
        expect(r.note, key + ' / ' + m.key).toBeTruthy();
      }
    }
  });
});

describe('combineSegments', () => {
  it('agreement keeps the type', () => expect(combineSegments(['ok', 'ok'])).toBe('ok'));
  it('karaha + darura → kd', () => expect(combineSegments(['karaha', 'darura', 'karaha'])).toBe('kd'));
  it('nahy + not-nahy → nahy (cautious)', () => expect(combineSegments(['nahy', 'free', 'nahy'])).toBe('nahy'));
  it('anything else → khilaf', () => expect(combineSegments(['ok', 'darura'])).toBe('khilaf'));
});

describe('madhab filter', () => {
  it('isfar: each madhab gets its own verdict', () => {
    const seg = m => { use([m]); return mark(build(dt), 'isfar').seg; };
    expect(seg('hanafi')).toBe('ok');
    expect(seg('maliki')).toBe('darura');
    expect(seg('shafii')).toBe('jawaz');
    expect(seg('hanbali')).toBe('ok');
    use(['hanafi', 'hanbali']);
    expect(mark(build(dt), 'isfar').seg).toBe('ok');
    use(['maliki', 'shafii']);
    expect(mark(build(dt), 'isfar').seg).toBe('khilaf');
  });

  it('isfirar: all four agree it is blameworthy → kd', () => {
    use(MADHABS.map(m => m.key));
    expect(mark(build(dt), 'isfirar').seg).toBe('kd');
  });

  it('istiwa is not a forbidden time for Malikis alone', () => {
    use(['maliki']);
    expect(mark(build(dt), 'istiwa').seg).toBe('free');
    use(MADHABS.map(m => m.key));
    expect(mark(build(dt), 'istiwa').seg).toBe('nahy');
  });

  it('description is one note per madhab when they differ, a single note when they match', () => {
    use(['maliki', 'shafii']);
    expect(mark(build(dt), 'isfar').desc.split('\n')).toHaveLength(2);
    use(['hanafi']);
    expect(mark(build(dt), 'isfar').desc).not.toContain('\n');
  });

  it("Asr 'auto' follows the madhab: two shadows only for Hanafi alone", () => {
    use(['hanafi']);
    expect(hanafiAsr()).toBe(true);
    expect(build(dt).prayers.find(p => p.key === 'asr').marks.map(m => m.key)).toEqual(['asr', 'isfirar', 'sunset']);
    use(['hanafi', 'shafii']);
    expect(hanafiAsr()).toBe(false);
    use(['hanafi'], { asr: 'std' });
    expect(hanafiAsr()).toBe(false);
  });

  it('Isha: half the night is a boundary, the exit is Fajr', () => {
    use(MADHABS.map(m => m.key));
    const B = build(dt);
    expect(mark(B, 'half').kind).toBe('bound');
    expect(mark(B, 'ishaExit').kind).toBe('exit');
  });
});

describe('school-specific boundaries', () => {
  it("Hanafi only: Isha follows the white twilight (18°) automatically", () => {
    use(['hanafi']);
    const hanafiIsha = build(dt).e.isha;
    expect(build(dt).e.M.ishaAngle).toBe(18);
    use(MADHABS.map(m => m.key)); // Cairo, Egyptian method: 17.5°
    expect(build(dt).e.M.ishaAngle).toBe(17.5);
    expect(hanafiIsha).toBeGreaterThan(build(dt).e.isha);
    use(['hanafi'], { isha: 'method' }); // forced back to the method
    expect(build(dt).e.M.ishaAngle).toBe(17.5);
  });

  it("Shafi'i redness mark sits between isfar and sunrise, only when Shafi'i is selected", () => {
    use(['shafii']);
    const B = build(dt), h = mark(B, 'humra');
    expect(h.seg).toBe('karaha');
    expect(h.at).toBeGreaterThan(mark(B, 'isfar').at);
    expect(h.at).toBeLessThanOrEqual(mark(B, 'sunrise').at);
    use(['hanafi', 'maliki', 'hanbali']);
    expect(mark(build(dt), 'humra')).toBeUndefined();
  });

  it('Maliki narrow Maghrib ends maghribMin minutes after sunset, only when Maliki is selected', () => {
    use(['maliki'], { maghribMin: 20 });
    const B = build(dt), m = mark(B, 'maghribMukhtar');
    expect(m.seg).toBe('darura');
    expect(Math.round((m.raw - B.e.sunset) / 60000)).toBe(20);
    use(['shafii']);
    expect(mark(build(dt), 'maghribMukhtar')).toBeUndefined();
  });

  it("Friday: istiwa is not a forbidden time for Shafi'is", () => {
    use(['shafii']);
    expect(mark(build({ y: 2026, m: 10, d: 30 }), 'istiwa').seg).toBe('free'); // Friday
    expect(mark(build({ y: 2026, m: 10, d: 29 }), 'istiwa').seg).toBe('nahy'); // Thursday
    use(['shafii', 'hanafi']);
    expect(mark(build({ y: 2026, m: 10, d: 30 }), 'istiwa').seg).toBe('nahy'); // Hanafis still forbid it
  });
});

describe('recommended mode (agreement and the majority)', () => {
  const rec = (overrides = {}) => use(['hanafi'], { rules: 'recommended', ...overrides }); // madhab pick is ignored

  it('majoritySegment: more than half wins, else blameworthy → kd, else khilaf', () => {
    expect(majoritySegment(['prev', 'ok', 'ok', 'ok'])).toBe('ok');
    expect(majoritySegment(['karaha', 'darura', 'jawaz', 'darura'])).toBe('kd');
    expect(majoritySegment(['ok', 'darura', 'jawaz', 'ok'])).toBe('khilaf');
  });

  it('uses all four madhabs whatever was picked in advanced mode', () => {
    rec();
    const B = build(dt);
    expect(mark(B, 'asr').seg).toBe('ok');         // majority: one shadow (Abu Hanifa differs)
    expect(mark(build({ y: 2026, m: 3, d: 19 }), 'istiwa').seg).toBe('nahy'); // Thursday: only Malikis differ
    expect(mark(B, 'istiwa').seg).toBe('khilaf');  // Friday (20 Mar): Shafi'is join the Malikis, 2–2
    expect(mark(B, 'isfar').seg).toBe('khilaf');   // no majority
    expect(mark(B, 'isfirar').seg).toBe('kd');     // all blameworthy, split karaha/darura
    expect(mark(B, 'half').seg).toBe('kd');        // three of four
    expect(B.prayers.find(p => p.key === 'asr').marks.map(m => m.key)).toEqual(['asr', 'asr2', 'isfirar', 'sunset']);
    expect(B.e.M.ishaAngle).toBe(17.5); // Cairo method, not the Hanafi white twilight
  });

  it('hides school-specific boundaries', () => {
    rec();
    const B = build(dt);
    expect(mark(B, 'humra')).toBeUndefined();
    expect(mark(B, 'maghribMukhtar')).toBeUndefined();
  });

  it('describes each boundary in one sentence', () => {
    rec();
    const B = build(dt);
    expect(mark(B, 'asr').desc).toBe('وقت اختيار عند المالكية والشافعية والحنابلة، ولم يدخل الوقت بعد عند الحنفية.');
    expect(mark(B, 'dhuhr').desc).toBe('وقت اختيار باتفاق المذاهب.');
    expect(mark(B, 'isfar').desc).not.toContain('\n');
  });
});
