// All user-facing text for prayer boundaries lives here, so wording can be
// edited without touching the calculation code.
//
// Each mark: label (card row title), short (used in countdown/alerts),
// sub (small line under the label; string or fn(ctx)),
// by: the ruling per madhab for the time from this mark until the next one:
//   { hanafi: { seg, note }, maliki: …, shafii: …, hanbali: … }
//   ('all' applies to every madhab). seg is a phase type from SEGMENTS.
// Marks without `by` (exits, end of a forbidden time) open no phase.
// ctx = { cfg, fajrAngle, ishaDesc, est(key), has(madhab), hanafiAsr }
//   est(key) returns " · تقديري" when that time was estimated for high latitudes.

export const PRAYER_NAMES = {
  fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء',
};

export const MADHABS = [
  { key: 'hanafi', name: 'الحنفية', label: 'حنفي' },
  { key: 'maliki', name: 'المالكية', label: 'مالكي' },
  { key: 'shafii', name: 'الشافعية', label: 'شافعي' },
  { key: 'hanbali', name: 'الحنابلة', label: 'حنبلي' },
];

// phase types (colors live in styles/tokens.css as --ok, --jawaz, …)
// pill: short badge · phrase: wording inside a sentence ("… عند المالكية")
export const SEGMENTS = {
  ok:     { pill: 'وقت اختيار', phrase: 'وقت اختيار' },
  jawaz:  { pill: 'جواز', phrase: 'جواز بلا كراهة' },
  khilaf: { pill: 'منطقة خلاف', phrase: 'محل خلاف' },
  karaha: { pill: 'كراهة', phrase: 'كراهة' },
  darura: { pill: 'ضرورة', phrase: 'ضرورة يأثم المؤخِّر إليها بلا عذر' },
  kd:     { pill: 'كراهة أو ضرورة', phrase: 'كراهة أو ضرورة' }, // split between karaha and darura
  nahy:   { pill: 'وقت نهي', phrase: 'وقت نهي' },
  free:   { pill: 'ليس وقت نهي', phrase: 'ليس وقت نهي' },   // where one madhab sees no forbidden time
  prev:   { pill: 'لم يدخل بعد', phrase: 'لم يدخل الوقت بعد' }, // prayer not started yet for that madhab
  idle:   { pill: 'لا فريضة', phrase: 'لا فريضة' },
};

const BAD = t => t === 'karaha' || t === 'darura';

/**
 * Advanced mode — combine the selected madhabs' types for one phase:
 * all agree → that type; all karaha/darura → kd; nahy vs. not-nahy → nahy
 * (the cautious reading); otherwise → khilaf.
 */
export function combineSegments(types) {
  const set = new Set(types);
  if (set.size === 1) return types[0];
  if ([...set].every(BAD)) return 'kd';
  if (set.has('nahy') && [...set].every(t => t === 'nahy' || t === 'free')) return 'nahy';
  return 'khilaf';
}

/**
 * Recommended mode — agreement or the majority (jumhur) of all four madhabs:
 * a type held by more than half wins; if more than half find it blameworthy
 * (karaha or darura) → kd; otherwise → khilaf.
 */
export function majoritySegment(types) {
  const half = types.length / 2, count = {};
  for (const t of types) count[t] = (count[t] || 0) + 1;
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  if (top[1] > half) return top[0];
  if (types.filter(BAD).length > half) return 'kd';
  return 'khilaf';
}

/**
 * One sentence in the old style: "وقت اختيار باتفاق المذاهب." or
 * "وقت اختيار عند المالكية والشافعية والحنابلة، ولم يدخل الوقت بعد عند الحنفية."
 * rulings: [{ name, seg, note }]
 */
export function summarize(rulings) {
  const notes = new Set(rulings.map(r => r.note));
  if (notes.size === 1) return rulings[0].note;
  const groups = [];
  for (const r of rulings) {
    const g = groups.find(x => x.seg === r.seg);
    if (g) g.names.push(r.name); else groups.push({ seg: r.seg, names: [r.name] });
  }
  if (groups.length === 1) return SEGMENTS[groups[0].seg].phrase + ' باتفاق المذاهب.';
  groups.sort((a, b) => b.names.length - a.names.length);
  return groups.map((g, i) => (i ? 'و' : '') + SEGMENTS[g.seg].phrase + ' عند ' + g.names.join(' و')).join('، ') + '.';
}

const DARURA_SIN = 'وقت ضرورة يأثم المؤخِّر إليه بلا عذر، والصلاة أداء.';

export const MARKS = {
  // ── الفجر
  fajr: {
    label: 'دخول الفجر', short: 'دخول الفجر',
    sub: c => 'الفجر الصادق · ' + c.fajrAngle + '°' + c.est('fajr'),
    by: {
      hanafi: { seg: 'ok', note: 'وقت أداء بلا حرج، والأفضل تأخيرها إلى الإسفار.' },
      maliki: { seg: 'ok', note: 'وقت اختيار، والأفضل التغليس بها.' },
      shafii: { seg: 'ok', note: 'وقت اختيار، والأفضل التغليس بها.' },
      hanbali: { seg: 'ok', note: 'وقت اختيار، والأفضل التغليس بها.' },
    },
  },
  isfar: {
    label: 'الإسفار', short: 'الإسفار',
    sub: c => 'ضوء ' + c.cfg.isfar + '° تتراءى فيه الوجوه',
    by: {
      hanafi: { seg: 'ok', note: 'وقت مستحب؛ يُستحب الإسفار بالفجر.' },
      maliki: { seg: 'darura', note: 'انتهى المختار، وما بعده ' + DARURA_SIN },
      shafii: { seg: 'jawaz', note: 'خرج وقت الاختيار، وهو جواز بلا كراهة حتى تظهر الحمرة قُبيل الشروق.' },
      hanbali: { seg: 'ok', note: 'لا ضرورة لوقت الفجر، فهو وقت أداء إلى الشروق.' },
    },
  },
  humra: { // shown only when the Shafi'i school is selected
    label: 'الحمرة قُبيل الشروق', short: 'الحمرة',
    sub: c => 'انخفاض ' + c.cfg.humra + '° (اجتهادي)' + c.est('humra'),
    by: {
      hanafi: { seg: 'ok', note: 'يستمر الوقت المستحب إلى الشروق.' },
      maliki: { seg: 'darura', note: 'يستمر وقت الضرورة إلى الشروق.' },
      shafii: { seg: 'karaha', note: 'وقت كراهة إلى الشروق، والصلاة أداء.' },
      hanbali: { seg: 'ok', note: 'يستمر وقت الأداء إلى الشروق.' },
    },
  },
  sunrise: {
    label: 'الشروق — خروج الفجر', short: 'الشروق',
    sub: 'بعده تصير الصلاة قضاءً',
    by: {
      hanafi: { seg: 'nahy', note: 'خرج وقت الفجر. لا تصح فيه صلاة ولو قضاءً حتى ترتفع الشمس.' },
      maliki: { seg: 'nahy', note: 'خرج وقت الفجر. لا تُبتدأ نافلة مطلقة حتى ترتفع الشمس قيد رمح.' },
      shafii: { seg: 'nahy', note: 'خرج وقت الفجر. لا تُبتدأ نافلة مطلقة حتى ترتفع الشمس قيد رمح.' },
      hanbali: { seg: 'nahy', note: 'خرج وقت الفجر. لا تُبتدأ نافلة مطلقة حتى ترتفع الشمس قيد رمح.' },
    },
  },
  ishraq: {
    label: 'الإشراق — انتهاء وقت النهي', short: 'الإشراق',
    sub: c => 'ارتفاع الشمس ' + c.cfg.sunAlt + '° (قيد رمح)',
  },

  // ── الظهر
  istiwa: {
    label: 'الاستواء', short: 'الاستواء',
    sub: 'قُبيل الزوال (تقديري)',
    by: {
      hanafi: { seg: 'nahy', note: 'وقت نهي لا تصح فيه صلاة ولو قضاءً.' },
      maliki: { seg: 'free', note: 'ليس وقت نهي في المشهور.' },
      shafii: { seg: 'nahy', note: 'وقت نهي عن النافلة المطلقة إلا يوم الجمعة.' },
      hanbali: { seg: 'nahy', note: 'وقت نهي عن النافلة المطلقة.' },
    },
    friday: {
      shafii: { seg: 'free', note: 'يوم الجمعة: لا يُكره التنفل عند الاستواء.' },
    },
  },
  dhuhr: {
    label: 'الزوال — دخول الظهر', short: 'دخول الظهر',
    sub: 'ميل الشمس عن كبد السماء',
    by: {
      hanafi: { seg: 'ok', note: 'وقت اختيار، ويمتد عند أبي حنيفة حتى يصير ظل الشيء مثليه.' },
      maliki: { seg: 'ok', note: 'مختار حتى يصير ظل الشيء مثله، ثم ضروري إلى الغروب.' },
      shafii: { seg: 'ok', note: 'وقت اختيار حتى يصير ظل الشيء مثله.' },
      hanbali: { seg: 'ok', note: 'وقت اختيار حتى يصير ظل الشيء مثله.' },
    },
  },
  dhuhrExit: {
    label: 'خروج الظهر — دخول العصر', short: 'خروج الظهر',
    sub: c => (c.hanafiAsr ? 'ظل المثلين' : 'ظل المثل')
      + (c.has('maliki') ? ' · وعند المالكية يمتد الضروري إلى الغروب' : '')
      + (c.has('hanafi') && !c.hanafiAsr ? ' · وعند أبي حنيفة يمتد إلى ظل المثلين' : ''),
  },

  // ── العصر
  asr: { // at one shadow length (majority)
    label: 'ظل المثل — دخول العصر', short: 'دخول العصر',
    sub: 'ظل المثل',
    by: {
      hanafi: { seg: 'prev', note: 'لم يدخل العصر عند أبي حنيفة؛ هو من وقت الظهر حتى ظل المثلين.' },
      maliki: { seg: 'ok', note: 'وقت اختيار حتى الاصفرار.' },
      shafii: { seg: 'ok', note: 'وقت اختيار حتى ظل المثلين.' },
      hanbali: { seg: 'ok', note: 'وقت اختيار حتى ظل المثلين.' },
    },
  },
  asrHanafi: { // at two shadow lengths (Abu Hanifa)
    label: 'ظل المثلين — دخول العصر', short: 'دخول العصر',
    sub: 'ظل المثلين، قول أبي حنيفة',
    by: {
      hanafi: { seg: 'ok', note: 'وقت مستحب ما لم تتغير الشمس.' },
      maliki: { seg: 'ok', note: 'وقت اختيار حتى الاصفرار.' },
      shafii: { seg: 'jawaz', note: 'خرج وقت الاختيار، وهو جواز بلا كراهة حتى الاصفرار.' },
      hanbali: { seg: 'darura', note: 'انتهى المختار، وما بعده ' + DARURA_SIN },
    },
  },
  asr2: {
    label: 'ظل المثلين', short: 'ظل المثلين',
    sub: 'مصير ظل الشيء مثليه',
    by: {
      hanafi: { seg: 'ok', note: 'دخل العصر عند أبي حنيفة، وهو وقت مستحب ما لم تتغير الشمس.' },
      maliki: { seg: 'ok', note: 'وقت اختيار حتى الاصفرار.' },
      shafii: { seg: 'jawaz', note: 'خرج وقت الاختيار، وهو جواز بلا كراهة حتى الاصفرار.' },
      hanbali: { seg: 'darura', note: 'انتهى المختار، وما بعده ' + DARURA_SIN },
    },
  },
  isfirar: {
    label: 'الاصفرار — تغيّر الشمس', short: 'الاصفرار',
    sub: c => 'ارتفاع الشمس ' + c.cfg.sunAlt + '°' + c.est('isfirar'),
    by: {
      hanafi: { seg: 'karaha', note: 'تأخير العصر إلى تغيّر الشمس مكروه تحريماً، وهي أداء.' },
      maliki: { seg: 'darura', note: 'انتهى المختار، وما بعده ' + DARURA_SIN },
      shafii: { seg: 'karaha', note: 'وقت كراهة، والصلاة أداء.' },
      hanbali: { seg: 'darura', note: DARURA_SIN },
    },
  },
  sunset: {
    label: 'الغروب — خروج العصر', short: 'الغروب',
    sub: 'بعده تصير الصلاة قضاءً',
  },

  // ── المغرب
  maghrib: {
    label: 'دخول المغرب', short: 'دخول المغرب',
    sub: 'غروب قرص الشمس',
    by: {
      hanafi: { seg: 'ok', note: 'السنة تعجيلها.' },
      maliki: { seg: 'ok', note: 'مختارها مضيّق بقدر الطهارة والأذان والإقامة والصلاة، ثم ضروري إلى الفجر.' },
      shafii: { seg: 'ok', note: 'السنة تعجيلها، ويمتد وقتها إلى مغيب الشفق على المعتمد.' },
      hanbali: { seg: 'ok', note: 'السنة تعجيلها.' },
    },
  },
  maghribMukhtar: { // shown only when the Maliki school is selected
    label: 'نهاية مختار المغرب عند المالكية', short: 'نهاية مختار المغرب',
    sub: c => 'بعد الغروب بـ ' + c.cfg.maghribMin + ' دقيقة (تقدير قابل للتعديل)',
    by: {
      hanafi: { seg: 'ok', note: 'السنة تعجيلها.' },
      maliki: { seg: 'darura', note: 'انتهى المختار المضيّق، وما بعده ضروري إلى الفجر يأثم المؤخِّر إليه بلا عذر.' },
      shafii: { seg: 'ok', note: 'السنة تعجيلها، ويمتد وقتها إلى مغيب الشفق على المعتمد.' },
      hanbali: { seg: 'ok', note: 'السنة تعجيلها.' },
    },
  },
  stars: {
    label: 'اشتباك النجوم', short: 'اشتباك النجوم',
    sub: c => 'انخفاض ' + c.cfg.stars + '° (اجتهادي)' + c.est('stars'),
    by: {
      hanafi: { seg: 'karaha', note: 'يُكره تحريماً تأخيرها إلى اشتباك النجوم.' },
      maliki: { seg: 'darura', note: 'يستمر وقت الضرورة إلى الفجر.' },
      shafii: { seg: 'jawaz', note: 'خرج وقت الفضيلة، ويبقى الوقت إلى مغيب الشفق.' },
      hanbali: { seg: 'jawaz', note: 'يجوز التأخير ما لم يغب الشفق، والسنة التعجيل.' },
    },
  },
  maghribExit: {
    label: 'مغيب الشفق — خروج المغرب', short: 'مغيب الشفق',
    sub: c => c.ishaDesc + c.est('isha') + (c.has('maliki') ? ' · وعند المالكية يمتد الضروري إلى الفجر' : ''),
  },

  // ── العشاء
  isha: {
    label: 'دخول العشاء', short: 'دخول العشاء',
    sub: c => 'مغيب الشفق · ' + c.ishaDesc,
    by: {
      hanafi: { seg: 'ok', note: 'وقت مستحب إلى ثلث الليل.' },
      maliki: { seg: 'ok', note: 'وقت اختيار إلى ثلث الليل.' },
      shafii: { seg: 'ok', note: 'وقت اختيار إلى ثلث الليل.' },
      hanbali: { seg: 'ok', note: 'وقت اختيار إلى ثلث الليل.' },
    },
  },
  third: {
    label: 'ثلث الليل', short: 'ثلث الليل',
    sub: 'الليل من الغروب إلى الفجر',
    by: {
      hanafi: { seg: 'jawaz', note: 'التأخير إلى نصف الليل مباح.' },
      maliki: { seg: 'darura', note: 'انتهى المختار، وما بعده ضروري إلى الفجر يأثم المؤخِّر إليه بلا عذر.' },
      shafii: { seg: 'jawaz', note: 'خرج وقت الاختيار، وهو جواز إلى طلوع الفجر.' },
      hanbali: { seg: 'darura', note: 'انتهى المختار، وما بعده ضرورة إلى الفجر يأثم المؤخِّر إليها بلا عذر.' },
    },
  },
  half: {
    label: 'نصف الليل', short: 'نصف الليل',
    sub: 'حدّ حديث عبد الله بن عمرو',
    by: {
      hanafi: { seg: 'karaha', note: 'التأخير بعد نصف الليل مكروه تحريماً.' },
      maliki: { seg: 'darura', note: 'وقت ضروري يأثم المؤخِّر إليه بلا عذر.' },
      shafii: { seg: 'jawaz', note: 'جواز إلى طلوع الفجر.' },
      hanbali: { seg: 'darura', note: 'وقت ضرورة يأثم المؤخِّر إليه بلا عذر.' },
    },
  },
  ishaExit: {
    label: 'طلوع الفجر — خروج العشاء', short: 'طلوع الفجر',
    sub: 'بعده قضاء باتفاق',
  },
};

// the gap between Ishraq and Istiwa (no obligatory prayer)
export const DUHA = {
  title: 'الضحى',
  desc: 'وقت الضحى. لا فريضة حتى الزوال.',
};
