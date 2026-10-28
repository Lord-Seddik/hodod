// Month ledger table + CSV export.
import { loc } from '../core/state.js';
import { build } from '../core/compute.js';
import { fmtTime, fmtCsvTime, gregString, hijriString, hijriNumeric, daysInMonth, sameDay, todayLocal, isoDate } from '../core/time.js';
import { $, esc } from './dom.js';
import { toast } from './toast.js';
import { PRAYERS } from '../data/rulings.js';

// all-prayers view: [mark key, header]
const COLUMNS = [
  ['fajr', 'الفجر'], ['isfar', 'الإسفار'], ['sunrise', 'الشروق'],
  ['dhuhr', 'الظهر'], ['asr', 'العصر'], ['asr2', 'ظل المثلين'], ['isfirar', 'الاصفرار'],
  ['maghrib', 'المغرب'], ['stars', 'الاشتباك'], ['isha', 'العشاء'], ['third', 'ثلث الليل'], ['half', 'نصف الليل'],
];

const findMark = (B, key) => B.list?.flatMap(p => p.marks).find(m => m.key === key);

/**
 * Columns for the current view. All prayers: the classic set. One prayer: its
 * own boundaries (those shown on any day of the month). Each column is colored
 * by the type the mark opens for the active view.
 */
function columns(rows, prayerKey) {
  const live = rows.filter(r => !r.B.polar);
  let keys;
  if (prayerKey) {
    const seen = new Map();
    live.forEach(({ B }) => B.prayers[prayerKey]?.marks.forEach((m, i) => {
      if (!m.quiet && !m.context && !seen.has(m.key)) seen.set(m.key, [i, m.short]);
    }));
    keys = [...seen.entries()].sort((a, b) => a[1][0] - b[1][0]).map(([k, [, head]]) => [k, head]);
  } else {
    keys = COLUMNS.filter(([k]) => !live.length || live.some(({ B }) => k in B.T));
  }
  return keys.map(([key, head]) => {
    const ref = live.map(({ B }) => findMark(B, key)).find(Boolean);
    const exit = !!ref?.exit;
    return { key, head, exit, type: exit ? 'exit' : (ref?.type || 'ok') };
  });
}

function monthRows(sel) {
  const rows = [];
  for (let d = 1; d <= daysInMonth(sel); d++) {
    const dt = { y: sel.y, m: sel.m, d };
    rows.push({ dt, B: build(dt) });
  }
  return rows;
}

export function renderMonth(sel, prayerKey) {
  const today = todayLocal(), rows = monthRows(sel), cols = columns(rows, prayerKey);
  $('#monthTitle').textContent = gregString(sel, { month: 'long', year: 'numeric' }) + ' · ' + loc.name + (prayerKey ? ' · ' + PRAYERS[prayerKey].name : '');
  const head = '<thead><tr><th scope="col">اليوم</th>' + cols.map(c => '<th scope="col" class="t-' + c.type + '"><i></i>' + c.head + '</th>').join('') + '</tr></thead>';
  const body = rows.map(({ dt, B }) => {
    const cells = cols.map(c => {
      const v = B.polar ? NaN : B.T[c.key];
      return '<td class="num' + (c.exit ? ' x' : '') + '">' + esc(fmtTime(v)) + '</td>';
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

export function exportCsv(sel, prayerKey) {
  const rows = monthRows(sel), cols = columns(rows, prayerKey);
  const lines = [['التاريخ', 'الهجري'].concat(cols.map(c => c.head)).map(csvCell).join(',')];
  rows.forEach(({ dt, B }) => {
    const times = cols.map(c => fmtCsvTime(B.polar ? NaN : B.T[c.key]));
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
