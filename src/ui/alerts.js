// Alert delivery: toast, chime, system notification; plus the upcoming list.
import { cfg } from '../core/state.js';
import { getAlerts } from '../core/timeline.js';
import { fmtTime, digits } from '../core/time.js';
import { $, esc } from './dom.js';
import { toast } from './toast.js';

const LATE_LIMIT = 2 * 60000; // don't replay alerts older than this (e.g. after sleep)

// ── sound
let actx = null;
let audioPending = cfg.sound; // browsers need a user gesture before audio can start

export function initAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    audioPending = false;
  } catch { actx = null; }
}
/** True when sound is on but the audio context still needs a user gesture. */
export const audioNeedsGesture = () => cfg.sound && (!actx || actx.state !== 'running');

export function chime(urgent) {
  if (!cfg.sound || !actx) return;
  try {
    const t0 = actx.currentTime, notes = urgent ? [784, 659, 784, 523] : [659, 880];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const s = t0 + i * 0.32;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.22, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.9);
      o.connect(g); g.connect(actx.destination);
      o.start(s); o.stop(s + 1);
    });
  } catch { /* ignore */ }
}

// ── system notifications
export const notifySupported = () => 'Notification' in window;

/** Ask for permission; resolves to true when granted. */
export async function requestNotify() {
  if (!notifySupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
}

async function systemNotify(a) {
  if (!cfg.notify || !notifySupported() || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return; // the toast is enough
  const opts = { body: a.body || '', tag: a.id, lang: 'ar', dir: 'rtl', icon: './icon.svg', requireInteraction: a.lvl === 'exit' };
  try {
    // mobile browsers only allow notifications through a service worker
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) await reg.showNotification(a.title, opts);
    else new Notification(a.title, opts);
  } catch { /* ignore */ }
}

/** Deliver an alert on every enabled channel. */
export function deliver(a) {
  toast(a);
  if (!a.quiet) { chime(a.lvl === 'exit'); systemNotify(a); }
}

// ── scheduling
const fired = new Set();
let firstCheck = true;

/** Fire alerts whose time has come. The first check only marks past ones as seen. */
export function checkAlerts(now) {
  if (!cfg.alerts) { firstCheck = false; return; }
  for (const a of getAlerts()) {
    if (a.when > now) break;
    if (fired.has(a.id)) continue;
    fired.add(a.id);
    if (firstCheck || now - a.when > LATE_LIMIT) continue;
    deliver(a);
  }
  firstCheck = false;
}

export const nextAlert = now => (cfg.alerts ? getAlerts().find(a => a.when > now && !a.quiet) : null);

export function renderAlertList() {
  const now = Date.now();
  const list = getAlerts().filter(a => a.when > now && !a.quiet).slice(0, 5);
  $('#alertMeta').textContent = cfg.alerts
    ? 'قبل الخروج بـ' + digits(cfg.exitB) + ' د، وقبل الكراهة بـ' + digits(cfg.karB) + ' د'
    : 'متوقفة';
  $('#alertList').innerHTML = !cfg.alerts
    ? '<li><span class="muted">فعّل التنبيهات من الإعدادات.</span></li>'
    : list.length
      ? list.map(a => '<li class="t-' + a.seg + '"><time class="num">' + esc(fmtTime(a.when)) + '</time><span><span class="pill xs">' + esc(a.title) + '</span> <span class="muted">' + esc(a.body) + '</span></span></li>').join('')
      : '<li><span class="muted">لا تنبيهات خلال الساعات القادمة.</span></li>';

  const btn = $('#soundBtn');
  btn.setAttribute('aria-pressed', String(!!cfg.sound));
  btn.querySelector('span').textContent = cfg.sound
    ? (audioPending ? 'الصوت: اضغط للتفعيل' : 'الصوت مفعّل')
    : 'الصوت متوقف';
}
