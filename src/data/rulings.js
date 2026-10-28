// All fiqh content lives here, so wording and rulings can be edited without
// touching the calculation code.
//
// Each prayer is a list of marks (boundaries) in time order. For every mark,
// `by` gives each madhab's ruling for the time from this mark until the next:
//   { seg, note, fadila }   seg: a type from SEGMENTS
//                           fadila: true → the whole stretch is the best time,
//                                   'early' → its first `cfg.fadilaMin` minutes are
//   'same'                  the ruling of the previous mark continues
//   fn(ctx, madhab)         computed from settings / the date
// `by.all` applies to every madhab not listed. Marks without `by` are context only.
// at(e, n, x): the mark's time from today's events e, tomorrow's n, extras x.
// when(ctx): include the mark only if this returns true.
// ctx = { cfg, has(m), asrAt2(m), whiteFor(m), whiteLater, anyAsr2, friday,
//         fajrAngle, ishaDesc, est(key) }

export const MADHABS = [
  { key: 'hanafi', name: 'الحنفية', label: 'حنفي' },
  { key: 'maliki', name: 'المالكية', label: 'مالكي' },
  { key: 'shafii', name: 'الشافعية', label: 'شافعي' },
  { key: 'hanbali', name: 'الحنابلة', label: 'حنبلي' },
];

// phase types (colors live in styles/tokens.css)
// pill: short badge · phrase: wording inside a sentence ("… عند المالكية")
export const SEGMENTS = {
  fadila: { pill: 'أفضل الوقت', phrase: 'أفضل الوقت' },
  ok:     { pill: 'وقت اختيار', phrase: 'وقت اختيار' },
  jawaz:  { pill: 'جواز', phrase: 'جواز بلا كراهة' },
  khilaf: { pill: 'منطقة خلاف', phrase: 'محل خلاف' },
  karaha: { pill: 'كراهة', phrase: 'كراهة' },
  darura: { pill: 'ضرورة', phrase: 'ضرورة يأثم المؤخِّر إليها بلا عذر' },
  kd:     { pill: 'كراهة أو ضرورة', phrase: 'كراهة أو ضرورة' },
  nahy:   { pill: 'وقت نهي', phrase: 'وقت نهي' },
  free:   { pill: 'ليس وقت نهي', phrase: 'ليس وقت نهي' },
  idle:   { pill: 'لا فريضة', phrase: 'لا فريضة' },
  prev:   { pill: 'لم يدخل بعد', phrase: 'لم يدخل الوقت بعد' },
  out:    { pill: 'خرج الوقت', phrase: 'خرج الوقت' },
  none:   { pill: '—', phrase: 'خارج الوقت' },
};

/** Types in which the prayer itself may be performed on time (adā'). */
export const VALID = new Set(['fadila', 'ok', 'jawaz', 'karaha', 'darura']);

// how cautious a type is; the "safe for all" row keeps the highest
const SEVERITY = { fadila: 0, ok: 1, jawaz: 2, free: 2, idle: 2, khilaf: 3, karaha: 3, darura: 4, kd: 4, nahy: 5, prev: 6, out: 6, none: 6 };

/** Several madhabs selected: the most cautious type (what is fine for all of them). */
export function combineSafe(types) {
  return types.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a));
}

/**
 * Recommended mode: agreement, else the majority (jumhur) of the four:
 * a type held by more than half; else the best-time/chosen group; else the
 * no-sin group (jawaz); else the blameworthy group (kd); else not valid; else khilaf.
 */
export function combineMajority(types) {
  const n = types.length, half = n / 2, c = {};
  for (const t of types) c[t] = (c[t] || 0) + 1;
  const sum = (...ks) => ks.reduce((s, k) => s + (c[k] || 0), 0);
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  if (top[1] > half) return top[0];
  if (sum('fadila', 'ok') > half) return 'ok';
  if (sum('fadila', 'ok', 'jawaz') > half) return 'jawaz';
  if (sum('karaha', 'darura') > half) return 'kd';
  if (sum('prev', 'out', 'none') > half) return 'none';
  if (sum('nahy', 'free') > half && c.nahy) return 'nahy';
  return 'khilaf';
}

/**
 * One sentence in the classic style: "وقت اختيار باتفاق المذاهب." or
 * "وقت اختيار عند المالكية والشافعية والحنابلة، ولم يدخل الوقت بعد عند الحنفية."
 * rulings: [{ name, type, note }]
 */
export function summarize(rulings) {
  const notes = new Set(rulings.map(r => r.note));
  if (notes.size === 1) return rulings[0].note;
  const groups = [];
  for (const r of rulings) {
    const g = groups.find(x => x.type === r.type);
    if (g) g.names.push(r.name); else groups.push({ type: r.type, names: [r.name] });
  }
  if (groups.length === 1) return SEGMENTS[groups[0].type].phrase + ' باتفاق المذاهب.';
  groups.sort((a, b) => b.names.length - a.names.length);
  return groups.map((g, i) => (i ? 'و' : '') + SEGMENTS[g.type].phrase + ' عند ' + g.names.join(' و')).join('، ') + '.';
}

// ── rule helpers
const r = (seg, note, fadila) => ({ seg, note, fadila });
const early = note => r('ok', note, 'early');
const best = note => r('ok', note, true);
const out = note => r('out', note);
const prev = note => r('prev', note);
const SIN = 'يأثم المؤخِّر إليه بلا عذر، والصلاة أداء.';

// istiwa: forbidden for voluntary prayer except for Malikis, and for Shafi'is on Friday
const ISTIWA = {
  hanafi: r('nahy', 'وقت نهي لا تصح فيه صلاة ولو قضاءً.'),
  maliki: r('free', 'ليس وقت نهي في المشهور.'),
  shafii: (c) => (c.friday ? r('free', 'يوم الجمعة: لا يُكره التنفل عند الاستواء.') : r('nahy', 'وقت نهي عن النافلة المطلقة إلا يوم الجمعة.')),
  hanbali: r('nahy', 'وقت نهي عن النافلة المطلقة.'),
};

export const PRAYERS = {
  // ── الفجر
  fajr: {
    name: 'الفجر', fard: true,
    marks: [
      {
        key: 'fajr', at: e => e.fajr, label: 'دخول الفجر', short: 'دخول الفجر',
        sub: c => 'الفجر الصادق · ' + c.fajrAngle + '°' + c.est('fajr'),
        by: {
          hanafi: r('ok', 'وقت أداء بلا حرج، والأفضل تأخيرها إلى الإسفار.'),
          all: early('وقت اختيار، والأفضل التغليس بها أول الوقت.'),
        },
      },
      {
        key: 'isfar', at: e => e.isfar, label: 'الإسفار', short: 'الإسفار',
        sub: c => 'ضوء ' + c.cfg.isfar + '° تتراءى فيه الوجوه',
        by: {
          hanafi: best('وقت مستحب: يُستحب الإسفار بها بحيث يبقى ما يسع إعادتها قبل الشروق.'),
          maliki: r('darura', 'انتهى المختار، وما بعده ضروري ' + SIN),
          shafii: r('jawaz', 'خرج وقت الاختيار، وهو جواز بلا كراهة حتى تظهر الحمرة قُبيل الشروق.'),
          hanbali: r('ok', 'لا ضرورة لوقت الفجر، فهو وقت أداء إلى الشروق.'),
        },
      },
      {
        key: 'humra', at: e => e.humra, when: c => c.has('shafii'), label: 'الحمرة قُبيل الشروق', short: 'الحمرة',
        sub: c => 'انخفاض ' + c.cfg.humra + '° (اجتهادي)' + c.est('humra'),
        by: { shafii: r('karaha', 'وقت كراهة إلى الشروق، والصلاة أداء.'), all: 'same' },
      },
      {
        key: 'sunrise', at: e => e.sunrise, label: 'الشروق', exitLabel: 'الشروق — خروج الفجر', short: 'الشروق',
        sub: 'بعده تصير الصلاة قضاءً',
        by: {
          hanafi: out('خرج وقت الفجر. ولا تصح صلاة ولو قضاءً حتى ترتفع الشمس.'),
          all: out('خرج وقت الفجر وصارت قضاءً. ثم وقت نهي حتى ترتفع الشمس قيد رمح.'),
        },
      },
      {
        key: 'ishraq', at: e => e.ishraq, round: 'up', context: true,
        label: 'الإشراق — انتهاء وقت النهي', short: 'الإشراق',
        sub: c => 'ارتفاع الشمس ' + c.cfg.sunAlt + '° (قيد رمح)',
      },
    ],
  },

  // ── الضحى والإشراق (optional)
  duha: {
    name: 'الضحى', fard: false, option: 'showDuha',
    marks: [
      {
        key: 'duhaStart', at: e => e.ishraq, round: 'up', label: 'الإشراق — دخول الضحى', short: 'دخول الضحى',
        sub: c => 'ارتفاع الشمس ' + c.cfg.sunAlt + '° (قيد رمح)',
        by: { all: r('ok', 'وقت صلاة الإشراق، وهي أول الضحى.') },
      },
      {
        key: 'duhaBest', at: (e, n, x) => x.duhaBest, label: 'ربع النهار', short: 'أفضل الضحى',
        sub: 'حين ترمض الفصال: اشتداد الحر',
        by: { all: best('أفضل وقت الضحى حين يشتد الحر.') },
      },
      {
        key: 'duhaIstiwa', at: e => e.istiwa, label: 'الاستواء', short: 'الاستواء', sub: 'قُبيل الزوال (تقديري)',
        by: { ...ISTIWA, maliki: 'same', shafii: c => (c.friday ? 'same' : ISTIWA.shafii(c)) },
      },
      {
        key: 'duhaEnd', at: e => e.dhuhr, label: 'الزوال', exitLabel: 'الزوال — خروج الضحى', short: 'الزوال',
        sub: 'بدخول الظهر', by: { all: out('خرج وقت الضحى.') },
      },
    ],
  },

  // ── الظهر
  dhuhr: {
    name: 'الظهر', fard: true,
    marks: [
      {
        key: 'istiwa', at: e => e.istiwa, context: true, label: 'الاستواء', short: 'الاستواء',
        sub: 'قُبيل الزوال (تقديري)', by: ISTIWA,
      },
      {
        key: 'dhuhr', at: e => e.dhuhr, label: 'الزوال — دخول الظهر', short: 'دخول الظهر',
        sub: 'ميل الشمس عن كبد السماء',
        by: {
          hanafi: early('وقت اختيار، ويُستحب الإبراد بها في شدة الحر وتعجيلها في الشتاء.'),
          maliki: early('وقت اختيار، ويُستحب للجماعة تأخيرها إلى ربع القامة، والإبراد في شدة الحر.'),
          all: early('وقت اختيار، والأفضل أول الوقت إلا في شدة الحر.'),
        },
      },
      {
        key: 'dhuhrMithl', at: e => e.asr1, label: 'ظل المثل', exitLabel: 'ظل المثل — خروج الظهر', short: 'ظل المثل',
        sub: c => 'مصير ظل الشيء مثله' + (c.has('hanafi') && c.asrAt2('hanafi') ? ' · ويمتد عند أبي حنيفة إلى ظل المثلين' : ''),
        by: {
          all: (c, m) => (c.asrAt2(m) ? 'same'
            : m === 'maliki' ? r('darura', 'انتهى المختار، وما بعده ضروري إلى الغروب ' + SIN)
            : out('خرج وقت الظهر بدخول العصر.')),
        },
      },
      {
        key: 'dhuhrMithlayn', at: e => e.asr2, when: c => c.anyAsr2, label: 'ظل المثلين', exitLabel: 'ظل المثلين — خروج الظهر',
        short: 'ظل المثلين', sub: 'مصير ظل الشيء مثليه',
        by: {
          all: (c, m) => (!c.asrAt2(m) ? 'same'
            : m === 'maliki' ? r('darura', 'انتهى المختار، وما بعده ضروري إلى الغروب ' + SIN)
            : out(m === 'hanafi' ? 'خرج وقت الظهر عند أبي حنيفة بدخول العصر.' : 'خرج وقت الظهر.')),
        },
      },
      {
        key: 'dhuhrSunset', at: e => e.sunset, when: c => c.has('maliki'), label: 'الغروب',
        exitLabel: 'الغروب — نهاية ضروري الظهر', short: 'الغروب', sub: 'نهاية الوقت الضروري عند المالكية',
        by: { all: out('خرج وقت الظهر.') },
      },
    ],
  },

  // ── الجمعة (optional, Fridays)
  jumuah: {
    name: 'الجمعة', fard: false, option: 'showJumuah', friday: true,
    marks: [
      {
        key: 'jumuahEarly', at: e => e.ishraq, when: c => c.has('hanbali'), round: 'up',
        label: 'وقت صلاة العيد', short: 'وقت العيد', sub: 'ارتفاع الشمس قيد رمح',
        by: {
          hanbali: r('jawaz', 'تجوز الجمعة قبل الزوال عند الحنابلة من وقت صلاة العيد، والأفضل بعد الزوال.'),
          all: prev('لا تصح الجمعة قبل الزوال.'),
        },
      },
      {
        key: 'jumuah', at: e => e.dhuhr, label: 'الزوال — دخول الجمعة', short: 'دخول الجمعة', sub: 'ميل الشمس عن كبد السماء',
        by: { all: early('وقت الجمعة، والسنة تعجيلها.') },
      },
      {
        key: 'jumuahMithl', at: e => e.asr1, label: 'ظل المثل', exitLabel: 'ظل المثل — خروج الجمعة', short: 'ظل المثل',
        sub: 'إن خرج الوقت صُلّيت ظهراً',
        by: {
          all: (c, m) => (c.asrAt2(m) ? 'same'
            : m === 'maliki' ? r('darura', 'تصح إلى الغروب على المشهور إن بقي ما يسع ركعة من العصر.')
            : out('خرج وقت الجمعة، وتُصلّى ظهراً.')),
        },
      },
      {
        key: 'jumuahMithlayn', at: e => e.asr2, when: c => c.anyAsr2, label: 'ظل المثلين', exitLabel: 'ظل المثلين — خروج الجمعة',
        short: 'ظل المثلين', sub: 'إن خرج الوقت صُلّيت ظهراً',
        by: {
          all: (c, m) => (!c.asrAt2(m) ? 'same'
            : m === 'maliki' ? r('darura', 'تصح إلى الغروب على المشهور إن بقي ما يسع ركعة من العصر.')
            : out('خرج وقت الجمعة، وتُصلّى ظهراً.')),
        },
      },
      {
        key: 'jumuahSunset', at: e => e.sunset, when: c => c.has('maliki'), label: 'الغروب',
        exitLabel: 'الغروب — خروج الجمعة', short: 'الغروب', sub: 'نهاية وقتها عند المالكية',
        by: { all: out('خرج وقت الجمعة.') },
      },
    ],
  },

  // ── العصر
  asr: {
    name: 'العصر', fard: true,
    marks: [
      {
        key: 'asr', at: e => e.asr1, label: 'ظل المثل — دخول العصر', short: 'دخول العصر', sub: 'مصير ظل الشيء مثله',
        by: {
          hanafi: c => (c.asrAt2('hanafi') ? prev('لم يدخل العصر عند أبي حنيفة؛ هو من وقت الظهر حتى ظل المثلين.')
            : best('دخل العصر على قول الصاحبين، ويُستحب تأخيرها ما لم تتغير الشمس.')),
          maliki: c => (c.asrAt2('maliki') ? prev('لم يدخل الوقت بعد احتياطاً.') : early('وقت اختيار حتى الاصفرار، والأفضل أول الوقت.')),
          all: (c, m) => (c.asrAt2(m) ? prev('لم يدخل الوقت بعد احتياطاً.') : early('وقت اختيار حتى ظل المثلين، والأفضل أول الوقت.')),
        },
      },
      {
        key: 'asr2', at: e => e.asr2, label: 'ظل المثلين', short: 'ظل المثلين', sub: 'مصير ظل الشيء مثليه',
        by: {
          hanafi: c => (c.asrAt2('hanafi') ? best('دخل العصر عند أبي حنيفة، ويُستحب تأخيرها ما لم تتغير الشمس.') : 'same'),
          maliki: c => (c.asrAt2('maliki') ? early('دخل الوقت احتياطاً، والأفضل أول الوقت.') : 'same'),
          shafii: c => (c.asrAt2('shafii') ? early('دخل الوقت احتياطاً، والأفضل أول الوقت.')
            : r('jawaz', 'خرج وقت الاختيار، وهو جواز بلا كراهة حتى الاصفرار.')),
          hanbali: c => (c.asrAt2('hanbali') ? early('دخل الوقت احتياطاً، والأفضل أول الوقت.')
            : r('darura', 'انتهى المختار، وما بعده ضرورة ' + SIN)),
        },
      },
      {
        key: 'isfirar', at: e => e.isfirar, label: 'الاصفرار — تغيّر الشمس', short: 'الاصفرار',
        sub: c => 'ارتفاع الشمس ' + c.cfg.sunAlt + '°' + c.est('isfirar'),
        by: {
          hanafi: r('karaha', 'تأخير العصر إلى تغيّر الشمس مكروه تحريماً، وهي أداء.'),
          maliki: r('darura', 'انتهى المختار، وما بعده ضروري ' + SIN),
          shafii: r('karaha', 'وقت كراهة، والصلاة أداء.'),
          hanbali: r('darura', 'وقت ضرورة ' + SIN),
        },
      },
      {
        key: 'sunset', at: e => e.sunset, label: 'الغروب', exitLabel: 'الغروب — خروج العصر', short: 'الغروب',
        sub: 'بعده تصير الصلاة قضاءً', by: { all: out('خرج وقت العصر وصارت قضاءً.') },
      },
    ],
  },

  // ── المغرب
  maghrib: {
    name: 'المغرب', fard: true,
    marks: [
      {
        key: 'maghrib', at: e => e.sunset, label: 'دخول المغرب', short: 'دخول المغرب', sub: 'غروب قرص الشمس',
        by: {
          maliki: c => (c.has('maliki') ? best('مختارها مضيّق بقدر الطهارة والأذان والإقامة والصلاة، والسنة تعجيلها.') : early('السنة تعجيلها.')),
          shafii: early('السنة تعجيلها، ويمتد وقتها إلى مغيب الشفق على المعتمد.'),
          all: early('السنة تعجيلها.'),
        },
      },
      {
        key: 'maghribMukhtar', at: e => e.maghribMukhtar, when: c => c.has('maliki'),
        label: 'نهاية مختار المغرب عند المالكية', short: 'نهاية مختار المغرب',
        sub: c => 'بعد الغروب بـ ' + c.cfg.maghribMin + ' دقيقة (تقدير قابل للتعديل)',
        by: { maliki: r('darura', 'انتهى المختار المضيّق، وما بعده ضروري إلى الفجر ' + SIN), all: 'same' },
      },
      {
        key: 'stars', at: e => e.stars, label: 'اشتباك النجوم', short: 'اشتباك النجوم',
        sub: c => 'انخفاض ' + c.cfg.stars + '° (اجتهادي)' + c.est('stars'),
        by: {
          hanafi: r('karaha', 'يُكره تحريماً تأخيرها إلى اشتباك النجوم.'),
          maliki: c => (c.has('maliki') ? 'same' : r('darura', 'انتهى المختار، وما بعده ضروري إلى الفجر ' + SIN)),
          shafii: r('jawaz', 'خرج وقت الفضيلة، ويبقى الوقت إلى مغيب الشفق.'),
          hanbali: r('jawaz', 'يجوز التأخير ما لم يغب الشفق، والسنة التعجيل.'),
        },
      },
      {
        key: 'maghribExit', at: e => e.isha, label: 'مغيب الشفق', exitLabel: 'مغيب الشفق — خروج المغرب', short: 'مغيب الشفق',
        sub: c => c.ishaDesc + c.est('isha'),
        by: { all: (c, m) => (m === 'maliki' || c.whiteFor(m) ? 'same' : out('خرج وقت المغرب.')) },
      },
      {
        key: 'maghribWhite', at: e => e.ishaWhite, when: c => c.whiteLater, label: 'مغيب الشفق الأبيض',
        exitLabel: 'مغيب الشفق الأبيض — خروج المغرب', short: 'الشفق الأبيض', sub: 'الشفق الأبيض 18° (أبو حنيفة)',
        by: { all: (c, m) => (c.whiteFor(m) ? out('خرج وقت المغرب عند أبي حنيفة بمغيب الشفق الأبيض.') : 'same') },
      },
      {
        key: 'maghribFajr', at: (e, n) => n.fajr, when: c => c.has('maliki'), label: 'طلوع الفجر',
        exitLabel: 'طلوع الفجر — نهاية ضروري المغرب', short: 'طلوع الفجر', sub: 'نهاية الوقت الضروري عند المالكية',
        by: { all: out('خرج وقت المغرب.') },
      },
    ],
  },

  // ── العشاء
  isha: {
    name: 'العشاء', fard: true,
    marks: [
      {
        key: 'isha', at: e => e.isha, label: 'دخول العشاء', short: 'دخول العشاء', sub: c => 'مغيب الشفق · ' + c.ishaDesc,
        by: {
          hanafi: c => (c.whiteFor('hanafi') ? prev('لم يدخل العشاء عند أبي حنيفة حتى يغيب الشفق الأبيض.')
            : best('وقت مستحب إلى ثلث الليل.')),
          hanbali: best('وقت اختيار، والأفضل تأخيرها إلى ثلث الليل ما لم يشق.'),
          all: early('وقت اختيار إلى ثلث الليل، والأفضل أول الوقت.'),
        },
      },
      {
        key: 'ishaWhite', at: e => e.ishaWhite, when: c => c.whiteLater,
        label: 'مغيب الشفق الأبيض', short: 'الشفق الأبيض', sub: 'دخول العشاء عند أبي حنيفة (18°)',
        by: { all: (c, m) => (c.whiteFor(m) ? best('دخل العشاء عند أبي حنيفة، ويُستحب تأخيرها إلى ثلث الليل.') : 'same') },
      },
      {
        key: 'third', at: (e, n, x) => x.third, label: 'ثلث الليل', short: 'ثلث الليل', sub: 'الليل من الغروب إلى الفجر',
        by: {
          hanafi: r('jawaz', 'التأخير إلى نصف الليل مباح.'),
          maliki: r('darura', 'انتهى المختار، وما بعده ضروري إلى الفجر ' + SIN),
          shafii: r('jawaz', 'خرج وقت الاختيار، وهو جواز إلى طلوع الفجر.'),
          hanbali: r('darura', 'انتهى المختار، وما بعده ضرورة إلى الفجر ' + SIN),
        },
      },
      {
        key: 'half', at: (e, n, x) => x.half, label: 'نصف الليل', short: 'نصف الليل', sub: 'حدّ حديث عبد الله بن عمرو',
        by: { hanafi: r('karaha', 'التأخير بعد نصف الليل مكروه تحريماً.'), all: 'same' },
      },
      {
        key: 'ishaExit', at: (e, n) => n.fajr, label: 'طلوع الفجر', exitLabel: 'طلوع الفجر — خروج العشاء', short: 'طلوع الفجر',
        sub: 'بعده قضاء باتفاق', by: { all: out('خرج وقت العشاء وصارت قضاءً.') },
      },
    ],
  },
};

/** Order of prayers in the selector and cards. */
export const PRAYER_ORDER = ['fajr', 'duha', 'dhuhr', 'jumuah', 'asr', 'maghrib', 'isha'];
export const FARD = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

/** Times outside the obligatory prayers, for the day timeline. */
export const CONTEXT = [
  { key: 'afterSunrise', from: e => e.sunrise, to: e => e.ishraq, title: 'بعد الشروق',
    by: { all: r('nahy', 'وقت نهي حتى ترتفع الشمس قيد رمح.') } },
  { key: 'duhaTime', from: e => e.ishraq, to: e => e.istiwa, title: 'الضحى',
    by: { all: r('idle', 'وقت الضحى. لا فريضة حتى الزوال.') } },
  { key: 'istiwaTime', from: e => e.istiwa, to: e => e.dhuhr, title: 'الاستواء', by: ISTIWA },
];
