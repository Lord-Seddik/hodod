// App shell: view state, rendering orchestration, navigation, timers.
import { cfg, loc, saveSettings, bumpVersion, isAdvanced, DEFAULTS } from './core/state.js';
import { MADHABS, PRAYERS, PRAYER_ORDER, FARD } from './data/rulings.js';
import { build, methodParams, displayRows } from './core/compute.js';
import { ensureTimeline, currentPhase, getPhases, phaseId } from './core/timeline.js';
import { todayLocal, addDays, addMonths, sameDay, localMidnight, gregString, hijriString, isoDate, parseIsoDate, digits } from './core/time.js';
import { $ } from './ui/dom.js';
import { toast } from './ui/toast.js';
import { renderNow } from './ui/now.js';
import { renderCards } from './ui/cards.js';
import { setSpan, drawSky, renderSkyOverlay, updateSkyNow } from './ui/sky.js';
import { renderMonth, exportCsv } from './ui/month.js';
import { renderAlertList, initAudio, chime, audioNeedsGesture } from './ui/alerts.js';
import { initLocationDialog } from './ui/location.js';
import { initSettingsDialog, syncSettingsForm, applyTheme } from './ui/settings.js';
import { initWakeLock } from './ui/wake.js';

const view = {
  sel: todayLocal(),   // selected date
  mode: 'day',         // 'day' | 'month'
  today: todayLocal(), // last seen local date (for midnight rollover)
  curId: '',           // current phase id shown in the cards
  prayer: null,        // selected prayer key, or null for all
  autoPrayer: true,    // follow the current prayer until the user picks another
};

// outside the obligatory prayers, the prayer to show: after sunrise and in Duha → Duha (or Dhuhr), istiwa → Dhuhr
const CONTEXT_PRAYER = { afterSunrise: 'duha', duhaTime: 'duha', istiwaTime: 'dhuhr' };

/** The prayer whose time it is now (or the next one between prayers). */
function currentPrayerKey() {
  const now = Date.now();
  const ph = currentPhase(now) || getPhases().find(p => p.from > now);
  if (!ph) return null;
  let k = PRAYERS[ph.pkey] ? ph.pkey : CONTEXT_PRAYER[ph.pkey] || null;
  if (k === 'duha' && !cfg.showDuha) k = 'dhuhr';
  return k;
}

/**
 * The build that holds the selected prayer's instance: on today, a prayer that
 * started yesterday and is still running (Isha after midnight) comes from yesterday.
 */
function prayerBuild(key) {
  const B = build(view.sel);
  if (!key || !sameDay(view.sel, todayLocal())) return B;
  const prev = build(addDays(view.sel, -1)), w = prev.prayers?.[key]?.window, now = Date.now();
  return w && now >= w.from && now < w.to ? prev : B;
}

const isFriday = dt => new Date(Date.UTC(dt.y, dt.m - 1, dt.d)).getUTCDay() === 5;

/** Prayers offered in the selector for a date (optional ones per settings). */
function prayerKeys(dt) {
  return PRAYER_ORDER.filter(k => {
    const def = PRAYERS[k];
    if (def.option && !cfg[def.option]) return false;
    return !def.friday || isFriday(dt);
  });
}

/** Keep the selected prayer valid for the selected date (Jumu'ah → Dhuhr on other days). */
function fixPrayer() {
  if (!view.prayer) return;
  if (!prayerKeys(view.sel).includes(view.prayer)) view.prayer = view.prayer === 'jumuah' ? 'dhuhr' : null;
}

// ── rendering
function renderDateHead() {
  const { sel } = view;
  if (view.mode === 'day') {
    $('#gDate').textContent = gregString(sel, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('#hDate').textContent = hijriString(sel);
  } else {
    $('#gDate').textContent = gregString(sel, { month: 'long', year: 'numeric' });
    $('#hDate').textContent = hijriString({ ...sel, d: 1 }) + ' …';
  }
  $('#dateInput').value = isoDate(sel);
  $('#todayBtn').disabled = view.mode === 'day' ? sameDay(sel, todayLocal()) : (sel.y === view.today.y && sel.m === view.today.m);
  $('#prevBtn').setAttribute('aria-label', view.mode === 'day' ? 'اليوم السابق' : 'الشهر السابق');
  $('#nextBtn').setAttribute('aria-label', view.mode === 'day' ? 'اليوم التالي' : 'الشهر التالي');
}

/** Sun strip: the whole day, or the selected prayer's window from first entry to last exit. */
function renderSky(B) {
  const P = view.prayer && B.prayers?.[view.prayer];
  if (P?.window) {
    const w = P.window, pad = Math.max((w.to - w.from) * 0.04, 5 * 60000);
    setSpan(w.from - pad, w.to + pad, false);
    drawSky();
    const labels = P.marks.filter(m => !m.quiet && !m.context && m.rules).map(m => ({ at: m.at, text: m.short }));
    $('#skyTitle').textContent = 'وقت ' + P.name + (sameDay(B.dt, view.sel) ? '' : ' · ليلة ' + gregString(B.dt, { weekday: 'long' }));
    renderSkyOverlay(displayRows([B.dt], view.prayer), labels, 'من أول دخوله إلى آخر خروجه عند المذاهب المختارة');
    return;
  }
  setSpan(localMidnight(view.sel), localMidnight(addDays(view.sel, 1)), true);
  drawSky();
  $('#skyTitle').textContent = 'مسار الشمس وحدود اليوم';
  const labels = B.polar ? [] : FARD.map(k => B.prayers[k]?.window && { at: B.prayers[k].window.from, text: B.prayers[k].name }).filter(Boolean);
  const estimated = !B.polar && Object.keys(B.e.est).length;
  renderSkyOverlay(B.polar ? [] : displayRows([addDays(view.sel, -1), view.sel]), labels,
    estimated ? 'بعض الأوقات تقديرية لارتفاع خط العرض' : 'من منتصف الليل إلى منتصف الليل بالتوقيت المحلي');
}

function renderDay() {
  const B = build(view.sel);
  const polar = $('#polarMsg');
  if (B.polar) {
    polar.hidden = false;
    polar.innerHTML = '<b>لا تشرق الشمس أو لا تغرب في هذا اليوم في هذا الموقع.</b><p class="muted">يُقدَّر الوقت هنا بأقرب البلاد التي تتميّز فيها العلامات، أو باختيار مدينة قريبة جنوباً من قائمة المواقع.</p>';
    $('#cards').innerHTML = '';
  } else {
    polar.hidden = true;
    renderCards(view.prayer ? prayerBuild(view.prayer) : B, view.prayer ? [view.prayer] : FARD);
  }
  renderSky(view.prayer ? prayerBuild(view.prayer) : B);
  view.curId = phaseId(currentPhase());
}

const ADJUST_LABELS = { sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب' };

function renderMethodLine() {
  const M = methodParams(view.sel);
  const adj = Object.entries(M.adjust).filter(([, v]) => v)
    .map(([k, v]) => ADJUST_LABELS[k] + ' ' + (v > 0 ? '+' : '−') + digits(Math.abs(v)) + ' د');
  $('#methodLine').textContent = 'طريقة الحساب: ' + M.name + ' · الفجر ' + M.fajrAngle + '° · العشاء ' + M.ishaDesc
    + (adj.length ? ' · تعديل رسمي: ' + adj.join('، ') : '')
    + ' · العصر ' + (cfg.asr === 'hanafi' ? 'ظل المثلين للجميع' : cfg.asr === 'std' ? 'ظل المثل للجميع' : 'ظل المثل، والمثلين للحنفية')
    + ' · الأحكام: ' + (isAdvanced() ? MADHABS.filter(m => cfg.madhabs.includes(m.key)).map(m => m.name).join('، ') : 'الاتفاق وقول الجمهور')
    + ' · ' + loc.lat.toFixed(3) + '، ' + loc.lon.toFixed(3) + ' · ' + loc.tz;
}

const chip = (attr, val, pressed, text) =>
  '<button type="button" ' + attr + '="' + val + '" aria-pressed="' + pressed + '">' + text + '</button>';

/** Madhab and prayer selectors, details toggle, mode classes and the key's note. */
function renderSelectors() {
  const adv = isAdvanced(), app = $('#app'), multi = adv && cfg.madhabs.length > 1;
  $('#madhabBar').innerHTML = chip('data-m', 'jumhur', !adv, 'الجمهور')
    + MADHABS.map(m => chip('data-m', m.key, adv && cfg.madhabs.includes(m.key), m.name)).join('');
  // the current prayer's chip carries a «now» dot
  const nowKey = sameDay(view.sel, todayLocal()) ? currentPrayerKey() : null;
  $('#prayerBar').innerHTML = chip('data-p', 'all', !view.prayer, 'الكل')
    + prayerKeys(view.sel).map(k => chip('data-p', k, view.prayer === k, PRAYERS[k].name)
      .replace('<button ', '<button ' + (k === nowKey ? 'class="is-now" title="الصلاة الحالية" ' : ''))).join('');
  $('#detailsBtn').setAttribute('aria-pressed', String(!!cfg.details));
  app.classList.toggle('mode-rec', !adv);
  app.classList.toggle('mode-multi', multi);
  app.classList.toggle('compact', !cfg.details);
  $('#legendNote').textContent = !adv ? 'بحسب الاتفاق وقول الجمهور'
    : multi ? 'سطر لكل مذهب، والأعلى الآمن للجميع' : 'بحسب ' + MADHABS.find(m => m.key === cfg.madhabs[0]).name;
}

function renderAll() {
  $('#locName').textContent = loc.name + (loc.country ? '، ' + loc.country : '');
  $('#nowCity').textContent = loc.name;
  $('#app').classList.toggle('nu-arab', cfg.nu === 'arab');
  ensureTimeline(true);
  // by default the day view focuses the current prayer (the month view shows all)
  if (view.autoPrayer) view.prayer = view.mode === 'day' && sameDay(view.sel, todayLocal()) ? currentPrayerKey() : null;
  fixPrayer();
  renderSelectors();
  renderDateHead();
  const isDay = view.mode === 'day';
  $('#dayView').hidden = !isDay;
  $('#monthView').hidden = isDay;
  if (isDay) renderDay(); else renderMonth(view.sel, view.prayer);
  renderMethodLine();
  renderNow();
  renderAlertList();
}

/** Settings or location changed: invalidate caches, persist, re-render. */
function changed() {
  bumpVersion();
  saveSettings();
  renderAll();
}

// ── navigation
function setMode(mode) {
  view.mode = mode;
  const day = mode === 'day';
  $('#tabDay').setAttribute('aria-selected', String(day));
  $('#tabMonth').setAttribute('aria-selected', String(!day));
  $('#tabDay').tabIndex = day ? 0 : -1;
  $('#tabMonth').tabIndex = day ? -1 : 0;
  renderAll();
}

function shift(k) {
  view.sel = view.mode === 'day' ? addDays(view.sel, k) : addMonths(view.sel, k);
  renderAll();
}

function goToday() {
  view.sel = todayLocal();
  renderAll();
}

function initNavigation() {
  $('#tabDay').onclick = () => setMode('day');
  $('#tabMonth').onclick = () => setMode('month');
  // arrow keys move between tabs (RTL: left = next)
  $('.tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const to = view.mode === 'day' ? 'month' : 'day';
    setMode(to);
    (to === 'day' ? $('#tabDay') : $('#tabMonth')).focus();
  });

  $('#prevBtn').onclick = () => shift(-1);
  $('#nextBtn').onclick = () => shift(1);
  $('#todayBtn').onclick = goToday;
  $('#dateInput').onchange = e => {
    const dt = parseIsoDate(e.target.value);
    if (dt) { view.sel = dt; renderAll(); }
  };
  $('#csvBtn').onclick = () => exportCsv(view.sel, view.prayer);

  // madhab selector: «الجمهور», or any set of madhabs (removing the last returns to «الجمهور»)
  $('#madhabBar').addEventListener('click', e => {
    const b = e.target.closest('button[data-m]');
    if (!b) return;
    const k = b.dataset.m;
    if (k === 'jumhur') {
      if (!isAdvanced()) return;
      cfg.rules = 'recommended';
    } else if (!isAdvanced()) {
      cfg.rules = 'advanced'; cfg.madhabs = [k];
    } else {
      const on = cfg.madhabs.includes(k);
      const next = MADHABS.map(m => m.key).filter(x => (x === k ? !on : cfg.madhabs.includes(x)));
      if (next.length) cfg.madhabs = next;
      else { cfg.rules = 'recommended'; cfg.madhabs = DEFAULTS.madhabs; }
    }
    changed();
    $('#madhabBar button[data-m="' + k + '"]')?.focus();
  });
  // prayer selector (display only, no recalculation)
  // choosing the current prayer goes back to following it; any other choice stays put
  const selectPrayer = k => {
    const next = k === 'all' || k === view.prayer ? null : k;
    view.autoPrayer = !!next && next === currentPrayerKey() && sameDay(view.sel, todayLocal());
    view.prayer = next;
    renderAll();
  };
  $('#prayerBar').addEventListener('click', e => {
    const b = e.target.closest('button[data-p]');
    if (!b) return;
    selectPrayer(b.dataset.p === view.prayer ? 'all' : b.dataset.p);
    $('#prayerBar button[data-p="' + (view.prayer || 'all') + '"]')?.focus();
  });
  // tapping a card's title selects that prayer (or returns to all)
  $('#cards').addEventListener('click', e => {
    const h = e.target.closest('.pcard header');
    if (h) selectPrayer(h.parentElement.dataset.prayer);
  });
  // details: display only, no recalculation
  $('#detailsBtn').onclick = () => {
    cfg.details = !cfg.details;
    saveSettings();
    renderSelectors();
  };

  // keyboard: ← next, → previous (RTL), T today, M toggles day/month, D details
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.target instanceof Element && e.target.closest('input, select, textarea, [role="tablist"]')) return;
    if (e.key === 'ArrowLeft') shift(1);
    else if (e.key === 'ArrowRight') shift(-1);
    else if (e.code === 'KeyT') goToday(); // physical key, so it works on Arabic layouts too
    else if (e.code === 'KeyM') setMode(view.mode === 'day' ? 'month' : 'day');
    else if (e.code === 'KeyD') $('#detailsBtn').click();
    else return;
    e.preventDefault();
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (view.mode === 'day') renderSky(build(view.sel));
    }, 120);
  });
}

// ── alert controls
function initAlertControls() {
  $('#soundBtn').onclick = () => {
    cfg.sound = !cfg.sound;
    if (cfg.sound) { initAudio(); chime(false); }
    saveSettings(); renderAlertList(); syncSettingsForm();
  };
  $('#testBtn').onclick = () => {
    if (cfg.sound) initAudio();
    toast({ title: 'تجربة: الاصفرار بعد ' + digits(cfg.karB) + ' د', body: 'هكذا يظهر التنبيه، مع الصوت إن كان مفعّلاً.', seg: 'karaha' });
    chime(true);
  };
  // audio can only start after a user gesture
  document.addEventListener('pointerdown', () => {
    if (audioNeedsGesture()) { initAudio(); renderAlertList(); }
  }, { passive: true });
}

// ── timers
function tick30() {
  const today = todayLocal();
  // midnight rollover: follow "today" if the user was looking at it
  if (!sameDay(today, view.today)) {
    const wasToday = sameDay(view.sel, view.today);
    view.today = today;
    if (wasToday) view.sel = today;
    renderAll();
    return;
  }
  updateSkyNow();
  renderAlertList();
  // re-render the cards only when the current phase has moved on
  // when the phase moves on: follow the new prayer (auto) or just refresh the cards
  if (view.mode === 'day' && phaseId(currentPhase()) !== view.curId) { if (view.autoPrayer) renderAll(); else { renderSelectors(); renderDay(); } }
}

export function start() {
  applyTheme();
  initNavigation();
  initAlertControls();
  initWakeLock();
  initLocationDialog(() => { view.sel = todayLocal(); changed(); });
  initSettingsDialog(changed);
  // close dialogs on backdrop click
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { ensureTimeline(true); renderNow(); tick30(); }
  });

  renderAll();
  setInterval(renderNow, 1000);
  setInterval(tick30, 30000);
}
