// Location dialog: city search, current position, custom coordinates.
import { CITIES } from '../data/cities.js';
import { cfg, loc, BROWSER_TZ, validTz, applyLocation } from '../core/state.js';
import { $, esc } from './dom.js';

const MAX_RESULTS = 300;

// loose matching: ignore hamza forms, taa marbuta and alif maqsura
const norm = s => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();
const ALL = CITIES.map((c, i) => ({ c, i, hay: norm(c.ar + ' ' + c.en + ' ' + c.country) }));

function cityHtml(list) {
  return list.slice(0, MAX_RESULTS).map(({ c, i }) => {
    const sel = !cfg.custom && cfg.cityIdx === i;
    return '<button type="button" data-i="' + i + '"' + (sel ? ' class="sel" aria-current="true"' : '') + '>'
      + '<span>' + esc(c.ar) + ' <small>' + esc(c.country) + '</small></span>'
      + '<small class="num">' + esc(c.tz) + '</small></button>';
  }).join('') || '<p class="note">لا نتائج. جرّب الاسم بالإنجليزية أو استخدم الإحداثيات.</p>';
}

function filterCities() {
  const q = norm($('#citySearch').value);
  $('#cityList').innerHTML = cityHtml(q ? ALL.filter(x => x.hay.includes(q)) : ALL);
}

function fillTimeZones() {
  let zones = [];
  try { zones = Intl.supportedValuesOf('timeZone'); } catch { /* old browser */ }
  if (!zones.length) zones = [...new Set(CITIES.map(c => c.tz))].sort();
  if (!zones.includes(BROWSER_TZ)) zones.unshift(BROWSER_TZ);
  $('#cTz').innerHTML = zones.map(z => '<option value="' + esc(z) + '">' + esc(z) + '</option>').join('');
}

/** onChange() is called after the location changes. */
export function initLocationDialog(onChange) {
  const dlg = $('#locDlg');
  fillTimeZones();

  const commit = () => { applyLocation(); dlg.close(); onChange(); };

  $('#citySearch').addEventListener('input', filterCities);
  $('#citySearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('#cityList button')?.click(); }
  });
  $('#cityList').addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    cfg.cityIdx = +b.dataset.i; cfg.custom = null;
    commit();
  });

  $('#cSave').onclick = () => {
    const lat = parseFloat($('#cLat').value), lon = parseFloat($('#cLon').value), tz = $('#cTz').value;
    const err = $('#cErr');
    if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) { err.textContent = 'أدخل خط عرض بين ‎-90 و 90، وخط طول بين ‎-180 و 180.'; return; }
    if (!validTz(tz)) { err.textContent = 'اختر منطقة زمنية صحيحة.'; return; }
    err.textContent = '';
    cfg.custom = { lat, lon, tz, name: $('#cName').value.trim() || 'موقع مخصّص' };
    commit();
  };

  const geoBtn = $('#geoBtn');
  if (!('geolocation' in navigator)) geoBtn.hidden = true;
  geoBtn.onclick = () => {
    const err = $('#cErr');
    geoBtn.setAttribute('aria-busy', 'true'); geoBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(pos => {
      geoBtn.removeAttribute('aria-busy'); geoBtn.disabled = false;
      const lat = +pos.coords.latitude.toFixed(4), lon = +pos.coords.longitude.toFixed(4);
      cfg.custom = { lat, lon, tz: BROWSER_TZ, name: 'موقعي الحالي' };
      commit();
    }, e => {
      geoBtn.removeAttribute('aria-busy'); geoBtn.disabled = false;
      $('#customBox').open = true;
      err.textContent = e.code === 1
        ? 'لم يُسمح بالوصول إلى الموقع. اختر مدينة أو أدخل الإحداثيات.'
        : 'تعذّر تحديد الموقع. حاول مرة أخرى أو أدخل الإحداثيات.';
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60000 });
  };

  $('#locBtn').onclick = () => {
    $('#citySearch').value = ''; filterCities();
    $('#cLat').value = loc.lat; $('#cLon').value = loc.lon; $('#cTz').value = loc.tz;
    $('#cName').value = cfg.custom ? cfg.custom.name : '';
    $('#cErr').textContent = '';
    dlg.showModal();
    $('#citySearch').focus();
    $('#cityList .sel')?.scrollIntoView({ block: 'nearest' });
  };
}
