// The live "now" gauge: current phase, countdown, progress, next alert.
import { MIN, clamp } from '../core/astro.js';
import { cfg } from '../core/state.js';
import { ensureTimeline, getPhases, afterText } from '../core/timeline.js';
import { fmtClock, fmtTime, hms } from '../core/time.js';
import { PRAYER_NAMES, SEGMENTS } from '../data/rulings.js';
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
    // rounding margin between one prayer's exit and the next one's entry
    $('#nowPrayer').textContent = PRAYER_NAMES[ph.pkey] || ph.title;
    pill.textContent = 'يدخل بعد لحظات'; setType(pill, 'ok');
    $('#nowDesc').textContent = 'فاصل احتياط بين خروج الوقت السابق ودخول هذا الوقت.';
    $('#countLabel').innerHTML = 'حتى <b>' + esc(ph.mark.short || 'دخول الوقت') + '</b>';
    $('#count').textContent = hms(ph.from - now);
    setType(card, 'ok');
    $('#countSub').textContent = fmtTime(ph.from);
    setProgress(0);
    document.title = hms(ph.from - now) + ' · ' + (ph.mark.short || APP_TITLE);
  } else {
    $('#nowPrayer').textContent = ph.title;
    pill.textContent = SEGMENTS[ph.seg].pill; setType(pill, ph.seg);
    $('#nowDesc').textContent = ph.mark.desc || '';
    $('#countLabel').innerHTML = 'يبقى حتى <b>' + esc(ph.next.short) + '</b>';
    $('#count').textContent = hms(ph.to - now);
    const nextIsExit = ph.next.kind === 'exit' || ph.next.kind === 'exit2';
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
