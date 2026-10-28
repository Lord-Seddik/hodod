// Settings dialog: two-way binding between the form and cfg.
import { METHODS } from '../data/methods.js';
import { cfg, DEFAULTS, LIMITS, resetSettings } from '../core/state.js';
import { $, esc } from './dom.js';
import { initAudio, chime, requestNotify, notifySupported } from './alerts.js';
import { toast } from './toast.js';

// form control id → cfg key
const FIELDS = {
  sRules: 'rules', sMethod: 'method', sCF: 'customF', sCI: 'customI', sAsr: 'asr', sIsha: 'isha',
  sIsfar: 'isfar', sSunAlt: 'sunAlt', sStars: 'stars', sIstiwa: 'istiwa', sNightEnd: 'nightEnd',
  sHigh: 'highLat', sIht: 'iht', sHumra: 'humra', sMaghribMin: 'maghribMin', sExitB: 'exitB', sKarB: 'karB', sH12: 'h12', sNu: 'nu', sTheme: 'theme',
};
const CHECKS = { sAlerts: 'alerts', sEntry: 'entry', sSound: 'sound', sNotify: 'notify' };

/** Apply cfg.theme to the document (auto = follow the OS). */
export function applyTheme() {
  const root = document.documentElement;
  if (cfg.theme === 'light' || cfg.theme === 'dark') root.dataset.theme = cfg.theme;
  else delete root.dataset.theme;
}

export function syncSettingsForm() {
  for (const [id, k] of Object.entries(FIELDS)) document.getElementById(id).value = cfg[k];
  for (const [id, k] of Object.entries(CHECKS)) document.getElementById(id).checked = !!cfg[k];
  $('#customAngles').hidden = cfg.method !== 'CUSTOM';
}

/** onChange() is called after any setting changes. */
export function initSettingsDialog(onChange) {
  const dlg = $('#setDlg');

  $('#sMethod').innerHTML = '<option value="AUTO">تلقائي حسب المدينة</option>' + Object.entries(METHODS).map(([k, m]) => {
    const detail = k === 'CUSTOM' ? '' : ' · ' + m.fajr + '° / ' + (m.ishaMin ? m.ishaMin + ' د' : m.isha + '°');
    return '<option value="' + k + '">' + esc(m.name + detail) + '</option>';
  }).join('');

  if (!notifySupported()) $('#sNotify').closest('label').hidden = true;

  $('#setForm').addEventListener('change', async e => {
    const id = e.target.id;
    if (FIELDS[id]) {
      const k = FIELDS[id];
      let v = e.target.value;
      if (LIMITS[k]) {
        v = parseFloat(v);
        if (!Number.isFinite(v)) v = DEFAULTS[k];
        v = Math.min(Math.max(v, LIMITS[k][0]), LIMITS[k][1]);
        e.target.value = v;
      }
      cfg[k] = v;
    } else if (CHECKS[id]) {
      cfg[CHECKS[id]] = e.target.checked;
      if (id === 'sSound' && e.target.checked) { initAudio(); chime(false); }
      if (id === 'sNotify' && e.target.checked && !(await requestNotify())) {
        cfg.notify = false; e.target.checked = false;
        toast({ title: 'لم يُسمح بالإشعارات', body: 'اسمح بها من إعدادات المتصفح لهذا الموقع ثم أعد المحاولة.', seg: 'idle' });
      }
    }
    $('#customAngles').hidden = cfg.method !== 'CUSTOM';
    if (id === 'sTheme') applyTheme();
    onChange();
  });

  $('#resetBtn').onclick = () => { resetSettings(); syncSettingsForm(); applyTheme(); onChange(); };
  $('#setBtn').onclick = () => { syncSettingsForm(); dlg.showModal(); };
}
