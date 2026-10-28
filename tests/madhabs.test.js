import { describe, it, expect } from 'vitest';
import { cfg, DEFAULTS, applyLocation, bumpVersion } from '../src/core/state.js';
import { build, madhabDayRow, displayRows } from '../src/core/compute.js';
import { CITIES } from '../src/data/cities.js';
import { PRAYERS, MADHABS, SEGMENTS, combineMajority, combineSafe } from '../src/data/rulings.js';

const THU = { y: 2026, m: 3, d: 19 }, FRI = { y: 2026, m: 3, d: 20 };
const ALL = MADHABS.map(m => m.key);
const MIN = 60000;

/** Cairo (Egyptian method, Isha 17.5° — earlier than the white twilight). */
function use(madhabs, overrides = {}) {
  const rules = madhabs ? 'advanced' : 'recommended';
  Object.assign(cfg, DEFAULTS, { cityIdx: CITIES.findIndex(c => c.en === 'Cairo'), custom: null, rules, madhabs: madhabs || ALL }, overrides);
  applyLocation();
  bumpVersion();
}
const mark = (B, p, key) => B.prayers[p].marks.find(m => m.key === key);
const valid = (B, p, m) => B.prayers[p].slices[m].filter(s => s.valid);

describe('rulings data', () => {
  it('every boundary rules for all four madhabs', () => {
    for (const [pk, P] of Object.entries(PRAYERS)) {
      for (const md of P.marks) {
        if (!md.by) continue;
        for (const m of ALL) expect(md.by[m] !== undefined || md.by.all !== undefined, pk + '/' + md.key + '/' + m).toBe(true);
      }
    }
  });
});

describe('combining', () => {
  it('majority: more than half wins', () => expect(combineMajority(['prev', 'fadila', 'fadila', 'fadila'])).toBe('fadila'));
  it('majority: chosen-time group', () => expect(combineMajority(['fadila', 'ok', 'ok', 'darura'])).toBe('ok'));
  it('majority: no-sin group → jawaz', () => expect(combineMajority(['fadila', 'darura', 'jawaz', 'ok'])).toBe('jawaz'));
  it('majority: blameworthy group → kd', () => expect(combineMajority(['karaha', 'darura', 'jawaz', 'darura'])).toBe('kd'));
  it('majority: an even split → khilaf', () => expect(combineMajority(['jawaz', 'darura', 'jawaz', 'darura'])).toBe('khilaf'));
  it('safe: the most cautious', () => {
    expect(combineSafe(['fadila', 'darura', 'ok'])).toBe('darura');
    expect(combineSafe(['ok', 'prev'])).toBe('prev');
  });
});

describe('recommended (agreement and the majority)', () => {
  it('colors each boundary by the majority of the four', () => {
    use(null);
    const B = build(THU);
    expect(mark(B, 'asr', 'asr').type).toBe('fadila');       // Abu Hanifa has not entered yet
    expect(mark(B, 'fajr', 'isfar').type).toBe('jawaz');     // only the Malikis see sin
    expect(mark(B, 'asr', 'isfirar').type).toBe('kd');       // all blameworthy
    expect(mark(B, 'isha', 'third').type).toBe('khilaf');    // 2–2
    expect(mark(B, 'isha', 'half').type).toBe('kd');         // three of four
    expect(mark(B, 'dhuhr', 'istiwa').type).toBe('nahy');
    expect(build(FRI).prayers.dhuhr.marks.find(m => m.key === 'istiwa').type).toBe('nahy'); // 2–2, the cautious reading
  });

  it('describes a boundary in one sentence', () => {
    use(null);
    expect(mark(build(THU), 'asr', 'asr').desc).toBe('أفضل الوقت عند المالكية والشافعية والحنابلة، ولم يدخل الوقت بعد عند الحنفية.');
  });

  it('shows one combined row', () => {
    use(null);
    expect(displayRows([THU], 'fajr')).toHaveLength(1);
  });

  it('hides boundaries that do not change the majority picture', () => {
    use(null);
    expect(mark(build(THU), 'maghrib', 'maghribMukhtar').quiet).toBe(true);
  });
});

describe('one madhab', () => {
  it('Hanafi: Asr at two shadows, Isha at the white twilight, isfar is the best Fajr time', () => {
    use(['hanafi']);
    const B = build(THU);
    expect(B.prayers.asr.window.from).toBeGreaterThanOrEqual(Math.floor(B.e.asr2 / MIN) * MIN);
    expect(B.prayers.isha.window.from).toBeGreaterThanOrEqual(Math.floor(B.e.ishaWhite / MIN) * MIN);
    expect(B.e.ishaWhite).toBeGreaterThan(B.e.isha);
    expect(B.prayers.maghrib.window.to).toBe(B.prayers.isha.window.from > 0 ? mark(B, 'maghrib', 'maghribWhite').at : 0);
    const best = valid(B, 'fajr', 'hanafi').find(s => s.type === 'fadila');
    expect(best.from).toBe(mark(B, 'fajr', 'isfar').at);
  });

  it('Maliki: Maghrib necessity time runs to Fajr, Dhuhr necessity to sunset', () => {
    use(['maliki']);
    const B = build(THU), next = build({ y: 2026, m: 3, d: 20 });
    expect(B.prayers.maghrib.window.to).toBe(mark(B, 'maghrib', 'maghribFajr').at);
    expect(mark(B, 'maghrib', 'maghribMukhtar').type).toBe('darura');
    expect(B.prayers.dhuhr.window.to).toBe(mark(B, 'dhuhr', 'dhuhrSunset').at);
    expect(next.polar).toBe(false);
  });

  it("Maliki day row: during Asr the row shows Asr, not Dhuhr's necessity time", () => {
    use(['maliki']);
    const B = build(THU), t = B.e.asr1 + 30 * MIN;
    const s = madhabDayRow('maliki', [THU]).find(x => x.from <= t && t < x.to);
    expect(s.prayer).toBe('asr');
  });

  it("Shafi'i: karaha from the redness before sunrise; istiwa free on Friday", () => {
    use(['shafii']);
    expect(mark(build(THU), 'fajr', 'humra').type).toBe('karaha');
    expect(mark(build(THU), 'dhuhr', 'istiwa').type).toBe('nahy');
    expect(mark(build(FRI), 'dhuhr', 'istiwa').type).toBe('free');
  });

  it('Hanbali: Jumu\'ah may start at the time of the Eid prayer', () => {
    use(['hanbali']);
    const B = build(FRI);
    expect(B.prayers.jumuah.window.from).toBe(mark(B, 'jumuah', 'jumuahEarly').at);
    expect(mark(B, 'jumuah', 'jumuahEarly').type).toBe('jawaz');
    expect(build(THU).prayers.jumuah).toBeUndefined();
  });

  it('the best time ("early") lasts fadilaMin minutes', () => {
    use(['shafii'], { fadilaMin: 25 });
    const s = valid(build(THU), 'dhuhr', 'shafii').find(x => x.type === 'fadila');
    expect((s.to - s.from) / MIN).toBe(25);
  });
});

describe('several madhabs', () => {
  it('draws a safe row plus one row per madhab', () => {
    use(['hanafi', 'shafii']);
    const rows = displayRows([THU], 'asr');
    expect(rows.map(r => r.label)).toEqual(['الآمن للجميع', 'الحنفية', 'الشافعية']);
  });

  it('the safe row starts where every selected madhab has entered', () => {
    use(['hanafi', 'shafii']);
    const B = build(THU);
    const safe = displayRows([THU], 'asr')[0].slices;
    expect(safe[0].from).toBeGreaterThanOrEqual(Math.floor(B.e.asr2 / MIN) * MIN);
  });

  it('chips appear where they disagree', () => {
    use(['maliki', 'shafii']);
    const m = mark(build(THU), 'fajr', 'isfar');
    expect(m.agree).toBe(false);
    expect(m.type).toBe('darura'); // the most cautious
    expect(m.desc.split('\n')).toHaveLength(2);
    expect(SEGMENTS[m.rulings[1].type].pill).toBe('جواز');
  });
});
