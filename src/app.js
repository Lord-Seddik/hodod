// App shell: view state, rendering orchestration, navigation, timers.
import { cfg, loc, saveSettings, bumpVersion, hanafiAsr, isAdvanced } from './core/state.js';
import { MADHABS } from './data/rulings.js';
import { build, methodParams } from './core/compute.js';
import { ensureTimeline, currentPhase, phaseId } from './core/timeline.js';
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
};

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

function renderSky(B) {
  renderSkyOverlay(B, build(addDays(view.sel, -1)));
}

function renderDay() {
  const B = build(view.sel);
  setSpan(localMidnight(view.sel), localMidnight(addDays(view.sel, 1)));
  drawSky();
  const polar = $('#polarMsg');
  if (B.polar) {
    polar.hidden = false;
    polar.innerHTML = '<b>لا تشرق الشمس أو لا تغرب في هذا اليوم في هذا الموقع.</b><p class="muted">يُقدَّر الوقت هنا بأقرب البلاد التي تتميّز فيها العلامات، أو باختيار مدينة قريبة جنوباً من قائمة المواقع.</p>';
    $('#cards').innerHTML = '';
  } else {
    polar.hidden = true;
    renderCards(B);
  }
  renderSky(B);
  view.curId = phaseId(currentPhase());
}

const ADJUST_LABELS = { sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب' };

function renderMethodLine() {
  const M = methodParams(view.sel);
  const adj = Object.entries(M.adjust).filter(([, v]) => v)
    .map(([k, v]) => ADJUST_LABELS[k] + ' ' + (v > 0 ? '+' : '−') + digits(Math.abs(v)) + ' د');
  $('#methodLine').textContent = 'طريقة الحساب: ' + M.name + ' · الفجر ' + M.fajrAngle + '° · العشاء ' + M.ishaDesc
    + (adj.length ? ' · تعديل رسمي: ' + adj.join('، ') : '')
    + ' · العصر ' + (hanafiAsr() ? 'ظل المثلين' : 'ظل المثل')
    + ' · الأحكام: ' + (isAdvanced() ? MADHABS.filter(m => cfg.madhabs.includes(m.key)).map(m => m.name).join('، ') : 'الاتفاق وقول الجمهور')
    + ' · ' + loc.lat.toFixed(3) + '، ' + loc.lon.toFixed(3) + ' · ' + loc.tz;
}

/** Advanced mode shows the madhab bar and details toggle; recommended keeps the classic look. */
function renderFilters() {
  const adv = isAdvanced(), app = $('#app');
  $('#filters').hidden = !adv;
  $('#madhabBar').innerHTML = MADHABS.map(m =>
    '<button type="button" data-m="' + m.key + '" aria-pressed="' + cfg.madhabs.includes(m.key) + '">' + m.name + '</button>').join('');
  $('#detailsBtn').setAttribute('aria-pressed', String(!!cfg.details));
  app.classList.toggle('mode-rec', !adv);
  app.classList.toggle('compact', adv && !cfg.details);
  $('#legendNote').textContent = adv ? 'بحسب المذاهب المختارة' : 'بحسب الاتفاق وقول الجمهور';
}

function renderAll() {
  $('#locName').textContent = loc.name + (loc.country ? '، ' + loc.country : '');
  $('#nowCity').textContent = loc.name;
  $('#app').classList.toggle('nu-arab', cfg.nu === 'arab');
  renderFilters();
  ensureTimeline(true);
  renderDateHead();
  const isDay = view.mode === 'day';
  $('#dayView').hidden = !isDay;
  $('#monthView').hidden = isDay;
  if (isDay) renderDay(); else renderMonth(view.sel);
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
  $('#csvBtn').onclick = () => exportCsv(view.sel);

  // madhab filter: toggle one; at least one stays selected
  $('#madhabBar').addEventListener('click', e => {
    const b = e.target.closest('button[data-m]');
    if (!b) return;
    const k = b.dataset.m, on = cfg.madhabs.includes(k);
    if (on && cfg.madhabs.length === 1) {
      toast({ title: 'اختر مذهباً واحداً على الأقل', seg: 'idle' });
      return;
    }
    cfg.madhabs = MADHABS.map(m => m.key).filter(x => (x === k ? !on : cfg.madhabs.includes(x)));
    changed();
    $('#madhabBar button[data-m="' + k + '"]')?.focus();
  });
  // details: display only, no recalculation
  $('#detailsBtn').onclick = () => {
    cfg.details = !cfg.details;
    saveSettings();
    renderFilters();
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
    else if (e.code === 'KeyD' && isAdvanced()) $('#detailsBtn').click();
    else return;
    e.preventDefault();
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (view.mode === 'day') { drawSky(); renderSky(build(view.sel)); }
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
  if (view.mode === 'day' && phaseId(currentPhase()) !== view.curId) renderDay();
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
