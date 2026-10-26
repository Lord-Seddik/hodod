import { $, esc } from './dom.js';

const MAX_TOASTS = 4;

/** Show an in-page toast. a = { title, body?, seg?, lvl? } */
export function toast(a) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast t-' + (a.seg || 'ok');
  el.setAttribute('role', 'status');
  el.innerHTML = '<i class="dot"></i><div><b>' + esc(a.title) + '</b><span>' + esc(a.body || '') + '</span></div><button type="button" aria-label="إغلاق">×</button>';
  el.querySelector('button').onclick = () => el.remove();
  box.prepend(el);
  setTimeout(() => el.remove(), a.lvl === 'exit' ? 30000 : 14000);
  while (box.children.length > MAX_TOASTS) box.lastChild.remove();
}
