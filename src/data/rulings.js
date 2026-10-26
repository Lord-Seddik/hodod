// All user-facing text for prayer boundaries lives here, so wording can be
// edited without touching the calculation code.
//
// Each mark: label (card row title), short (used in countdown/alerts),
// sub (small line under the label; string or fn(ctx)), desc (shown in the
// "now" gauge while this phase is current).
// ctx = { cfg, fajrAngle, ishaDesc, est(key) } — est(key) returns " · تقديري"
// when that time was estimated for high latitudes.

export const PRAYER_NAMES = {
  fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء',
};

// phase types (colors live in styles/tokens.css as --ok, --khilaf, …)
export const SEGMENTS = {
  ok:     { pill: 'وقت اختيار' },
  khilaf: { pill: 'منطقة خلاف' },
  karaha: { pill: 'كراهة أو ضرورة' },
  darura: { pill: 'بعد الحدّ' },
  nahy:   { pill: 'وقت نهي' },
  idle:   { pill: 'لا فريضة' },
};

export const MARKS = {
  // ── الفجر
  fajr: {
    label: 'دخول الفجر', short: 'دخول الفجر',
    sub: c => 'الفجر الصادق · ' + c.fajrAngle + '°' + c.est('fajr'),
    desc: 'يجوز الأداء بلا حرج باتفاق المذاهب.',
  },
  isfar: {
    label: 'الإسفار — نهاية الاختيار', short: 'الإسفار',
    sub: c => 'ضوء ' + c.cfg.isfar + '° تتراءى فيه الوجوه',
    desc: 'الصلاة أداء، ويأثم المؤخِّر إلى هنا بلا عذر عند المالكية، وهو جواز مكروه عند الشافعية.',
  },
  sunrise: {
    label: 'الشروق — الخروج الكلي', short: 'الشروق',
    sub: 'بعده تصير الصلاة قضاءً',
    desc: 'خرج وقت الفجر. لا تُبتدأ نافلة مطلقة حتى ترتفع الشمس قيد رمح.',
  },
  ishraq: {
    label: 'الإشراق — انتهاء وقت النهي', short: 'الإشراق',
    sub: c => 'ارتفاع الشمس ' + c.cfg.sunAlt + '° (قيد رمح)',
  },

  // ── الظهر
  istiwa: {
    label: 'الاستواء — وقت نهي', short: 'الاستواء',
    sub: 'قُبيل الزوال (تقديري)',
    desc: 'وقت نهي قصير قبيل الزوال.',
  },
  dhuhr: {
    label: 'الزوال — دخول الظهر', short: 'دخول الظهر',
    sub: 'ميل الشمس عن كبد السماء',
    desc: 'وقت الظهر كله وقت اختيار عند الجمهور.',
  },
  dhuhrExit: {
    label: 'الخروج — دخول العصر', short: 'خروج الظهر',
    sub: 'ظل المثل · وعند المالكية يمتد الضروري إلى الغروب',
  },
  dhuhrExitHanafi: {
    label: 'الخروج — دخول العصر', short: 'خروج الظهر',
    sub: 'ظل المثلين، قول أبي حنيفة',
  },

  // ── العصر
  asr: {
    label: 'دخول العصر', short: 'دخول العصر',
    sub: 'ظل المثل',
    desc: 'وقت اختيار باتفاق المذاهب.',
  },
  asrHanafi: {
    label: 'دخول العصر', short: 'دخول العصر',
    sub: 'ظل المثلين، قول أبي حنيفة',
    desc: 'وقت مستحب عند الحنفية ما لم تتغير الشمس.',
  },
  asr2: {
    label: 'ظل المثلين — نهاية المختار عند الشافعية والحنابلة', short: 'ظل المثلين',
    sub: 'بعده مختار عند المالكية، وضرورة عند الحنابلة',
    desc: 'مختار عند المالكية، وجواز عند الشافعية، وضرورة يأثم المؤخِّر إليها بلا عذر عند الحنابلة.',
  },
  isfirar: {
    label: 'الاصفرار — وقت الكراهة', short: 'الاصفرار',
    sub: c => 'ارتفاع الشمس ' + c.cfg.sunAlt + '°' + c.est('isfirar'),
    desc: 'يأثم المؤخِّر إلى هنا بلا عذر عند المالكية والحنابلة، ومكروه تحريماً عند الحنفية، ومكروه عند الشافعية. وهي أداء.',
  },
  isfirarHanafi: {
    label: 'تغيّر الشمس — كراهة تحريمية', short: 'الاصفرار',
    sub: c => 'ارتفاع الشمس ' + c.cfg.sunAlt + '°' + c.est('isfirar'),
    desc: 'تأخير العصر إلى هنا مكروه تحريماً عند الحنفية، ويأثم به عند المالكية والحنابلة. وهي أداء.',
  },
  sunset: {
    label: 'الغروب — الخروج الكلي', short: 'الغروب',
    sub: 'بعده تصير الصلاة قضاءً',
  },

  // ── المغرب
  maghrib: {
    label: 'دخول المغرب', short: 'دخول المغرب',
    sub: 'غروب قرص الشمس',
    desc: 'السنة تعجيل المغرب. ووقتها مضيّق عند المالكية والشافعي في الجديد.',
  },
  stars: {
    label: 'اشتباك النجوم — يُكره التأخير', short: 'اشتباك النجوم',
    sub: c => 'انخفاض ' + c.cfg.stars + '° (اجتهادي)' + c.est('stars'),
    desc: 'يُكره تأخير المغرب إلى اشتباك النجوم، وما بعده جواز عند من مدّ وقتها إلى الشفق.',
  },
  maghribExit: {
    label: 'مغيب الشفق — الخروج', short: 'مغيب الشفق',
    sub: c => c.ishaDesc + c.est('isha'),
  },

  // ── العشاء
  isha: {
    label: 'دخول العشاء', short: 'دخول العشاء',
    sub: c => 'مغيب الشفق · ' + c.ishaDesc,
    desc: 'وقت اختيار باتفاق المذاهب.',
  },
  third: {
    label: 'ثلث الليل — نهاية المختار', short: 'ثلث الليل',
    sub: 'بعده مباح عند الحنفية، وخارج المختار عند الجمهور',
    desc: 'تأخيرها إلى هنا مباح عند الحنفية، وهو خارج المختار عند المالكية والشافعية والحنابلة.',
  },
  half: {
    label: 'نصف الليل — الخروج', short: 'نصف الليل',
    sub: 'حدّ حديث عبد الله بن عمرو · بعده ضرورة عند الجمهور',
    desc: 'خرج الوقت عند من حدّه بنصف الليل. وعند الجمهور هو وقت ضرورة يأثم المؤخِّر إليه بلا عذر.',
  },
  ishaExit: {
    label: 'طلوع الفجر — الخروج الكلي عند الجمهور', short: 'طلوع الفجر',
    sub: 'بعده قضاء باتفاق',
  },
};

// the gap between Ishraq and Istiwa (no obligatory prayer)
export const DUHA = {
  title: 'الضحى',
  desc: 'وقت الضحى. لا فريضة حتى الزوال.',
};
