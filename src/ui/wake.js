// "Keep screen on" toggle (Screen Wake Lock API).
import { $ } from './dom.js';
import { toast } from './toast.js';

let sentinel = null, wanted = false;

async function request() {
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
    return true;
  } catch { return false; }
}

export function initWakeLock() {
  const btn = $('#wakeBtn');
  btn.onclick = async () => {
    if (wanted) {
      wanted = false;
      try { await sentinel?.release(); } catch { /* ignore */ }
      btn.setAttribute('aria-pressed', 'false');
      return;
    }
    if (!('wakeLock' in navigator)) {
      toast({ title: 'غير متاح هنا', body: 'متصفحك لا يسمح بإبقاء الشاشة مضاءة.', seg: 'idle' });
      return;
    }
    wanted = await request();
    btn.setAttribute('aria-pressed', String(wanted));
    if (!wanted) toast({ title: 'لم يُسمح بإبقاء الشاشة مضاءة', body: 'قد يمنعه المتصفح أو وضع توفير الطاقة.', seg: 'idle' });
  };
  // the lock is dropped when the tab is hidden; take it again on return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wanted && !sentinel) request();
  });
}
