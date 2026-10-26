import './styles/index.css';
import { start } from './app.js';

start();

// offline support + background notifications (production build only)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* ignore */ });
  });
}
