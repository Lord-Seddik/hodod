// The live "now" gauge: current phase, countdown, progress, next alert.
import { MIN, clamp } from '../core/astro.js';
import { cfg } from '../core/state.js';
import { ensureTimeline, getPhases, afterText } from '../core/timeline.js';
import { fmtClock, fmtTime, hms } from '../core/time.js';
import { SEGMENTS, PRAYERS } from '../data/rulings.js';
import { build, rulingsAt, describe } from '../core/compute.js';
import { $, esc, setType, ICONS } from './dom.js';
import { checkAlerts, nextAlert } from './alerts.js';

const APP_TITLE = 'حدود الوقت';

function setProgress(pct) {
  $('#prog').style.width = pct.toFixed(2) + '%';
  $('#progBar').setAttribute('aria-valuenow', String(Math.round(pct)));
}

export function renderNow() {
  ensureTimeline();
  const now = Date.now(), phases = getPhases();
  $('#clock').textContent = fmtClock(now);

  let ph = phases.find(p => now >= p.from && now < p.to), gap = false;
  if (!ph) { ph = phases.find(p => p.from > now); gap = true; }
  const card = $('#nowCount'), pill = $('#nowPill');

  if (!ph) {
    $('#nowPrayer').textContent = '—';
    pill.textContent = '';
    $('#nowDesc').textContent = 'لا يمكن حساب الأوقات لهذا الموقع في هذه الأيام.';
    $('#count').textContent = '--:--:--';
    $('#countLabel').textContent = '';
    $('#countSub').textContent = '';
    setProgress(0);
    document.title = APP_TITLE;
  } else if (gap) {
    // between one prayer's exit and the next one's entry (rounding margin, or a
    // selected madhab that has not entered yet)
    $('#nowPrayer').textContent = ph.title;
    pill.textContent = 'لم يدخل بعد'; setType(pill, 'prev');
    $('#nowDesc').textContent = 'فاصل بين خروج الوقت السابق ودخول هذا الوقت عند المذاهب المختارة.';
    $('#countLabel').innerHTML = 'حتى <b>' + esc(ph.mark.short || 'دخول الوقت') + '</b>';
    $('#count').textContent = hms(ph.from - now);
    setType(card, 'ok');
    $('#countSub').textContent = fmtTime(ph.from);
    setProgress(0);
    document.title = hms(ph.from - now) + ' · ' + (ph.mark.short || APP_TITLE);
  } else {
    $('#nowPrayer').textContent = ph.title;
    pill.textContent = (SEGMENTS[ph.seg] || SEGMENTS.none).pill; setType(pill, ph.seg);
    // each madhab's status for this prayer right now
    $('#nowDesc').textContent = (PRAYERS[ph.pkey] && ph.dt ? describe(rulingsAt(build(ph.dt), ph.pkey, now)) : ph.desc) || '';
    $('#countLabel').innerHTML = 'يبقى حتى <b>' + esc(ph.next.short) + '</b>';
    $('#count').textContent = hms(ph.to - now);
    const nextIsExit = ph.next.kind === 'exit';
    setType(card, nextIsExit && ph.to - now < cfg.exitB * MIN ? 'exit' : ph.seg);
    $('#countSub').textContent = fmtTime(ph.to) + ' · ' + afterText(ph);
    setProgress(100 * clamp((now - ph.from) / (ph.to - ph.from), 0, 1));
    document.title = hms(ph.to - now) + ' · ' + ph.next.short;
  }

  const up = nextAlert(now);
  $('#nextAlert').innerHTML = up
    ? ICONS.bell + '<span>التنبيه القادم ' + esc(fmtTime(up.when)) + ': ' + esc(up.title) + '</span>'
    : (cfg.alerts ? '' : '<span>التنبيهات متوقفة</span>');

  checkAlerts(now);
}
