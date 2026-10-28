// Month ledger table + CSV export.
import { cfg, loc } from '../core/state.js';
import { build } from '../core/compute.js';
import { fmtTime, fmtCsvTime, gregString, hijriString, hijriNumeric, daysInMonth, sameDay, todayLocal, isoDate } from '../core/time.js';
import { $, esc } from './dom.js';
import { toast } from './toast.js';

// [mark key, header, type]
const COLUMNS = [
  ['fajr', 'الفجر', 'ok'], ['isfar', 'الإسفار', 'khilaf'], ['sunrise', 'الشروق', 'exit'],
  ['dhuhr', 'الظهر', 'ok'], ['asr', 'العصر', 'ok'], ['asr2', 'ظل المثلين', 'khilaf'], ['isfirar', 'الاصفرار', 'karaha'],
  ['maghrib', 'المغرب', 'ok'], ['stars', 'الاشتباك', 'karaha'], ['isha', 'العشاء', 'ok'], ['third', 'ثلث الليل', 'khilaf'], ['half', 'نصف الليل', 'darura'],
];

// Hanafi Asr starts at the 2× shadow, so the separate column is redundant
const columns = () => (cfg.asr === 'hanafi' ? COLUMNS.filter(c => c[0] !== 'asr2') : COLUMNS);
const isExitCol = c => c[2] === 'exit' || c[0] === 'half';

function monthRows(sel) {
  const rows = [];
  for (let d = 1; d <= daysInMonth(sel); d++) {
    const dt = { y: sel.y, m: sel.m, d };
    rows.push({ dt, B: build(dt) });
  }
  return rows;
}

export function renderMonth(sel) {
  const today = todayLocal(), cols = columns();
  $('#monthTitle').textContent = gregString(sel, { month: 'long', year: 'numeric' }) + ' · ' + loc.name;
  const head = '<thead><tr><th scope="col">اليوم</th>' + cols.map(c => '<th scope="col" class="t-' + c[2] + '"><i></i>' + c[1] + '</th>').join('') + '</tr></thead>';
  const body = monthRows(sel).map(({ dt, B }) => {
    const cells = cols.map(c => {
      const v = B.polar ? NaN : B.T[c[0]];
      return '<td class="num' + (isExitCol(c) ? ' x' : '') + '">' + esc(fmtTime(v)) + '</td>';
    }).join('');
    const isToday = sameDay(dt, today);
    return '<tr' + (isToday ? ' class="today" aria-current="date"' : '') + '><th scope="row">'
      + esc(gregString(dt, { weekday: 'short', day: 'numeric' })) + '<small>' + esc(hijriString(dt)) + '</small></th>'
      + cells + '</tr>';
  }).join('');
  $('#monthTable').innerHTML = head + '<tbody>' + body + '</tbody>';
  // scroll the table (not the page) so today's row is in view
  const wrap = $('#monthTable').parentElement, tr = $('#monthTable tr.today');
  wrap.scrollTop = tr ? Math.max(0, tr.getBoundingClientRect().top - wrap.getBoundingClientRect().top - wrap.clientHeight / 3) : 0;
}

const csvCell = v => (/[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));

export function exportCsv(sel) {
  const cols = columns();
  const lines = [['التاريخ', 'الهجري'].concat(cols.map(c => c[1])).map(csvCell).join(',')];
  monthRows(sel).forEach(({ dt, B }) => {
    const times = cols.map(c => fmtCsvTime(B.polar ? NaN : B.T[c[0]]));
    lines.push([isoDate(dt), hijriNumeric(dt)].concat(times).map(csvCell).join(','));
  });
  const fname = 'hudud-' + loc.name.replace(/\s+/g, '-') + '-' + sel.y + '-' + String(sel.m).padStart(2, '0') + '.csv';
  // BOM so Excel opens the Arabic headers as UTF-8
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: fname });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast({ title: 'تم تنزيل الجدول', body: fname, seg: 'ok' });
}
