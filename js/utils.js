/* Momentum — shared utilities (browser global + testable) */
(function (global) {
  'use strict';

  const DAY_MS = 86400000;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTHS_SHORT = MONTHS.map(m => m.slice(0, 3));
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function todayStr() {
    return toDateStr(new Date());
  }

  function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function parseDate(str) {
    if (!str) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str));
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), day = Number(m[3]);
    if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
    const d = new Date(y, mo - 1, day);
    if (isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) return null;
    return d;
  }

  function addDays(str, n) {
    const d = parseDate(str);
    if (!d) return null;
    d.setDate(d.getDate() + n);
    return toDateStr(d);
  }

  function addMonths(str, n) {
    const d = parseDate(str);
    if (!d) return null;
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return toDateStr(d);
  }

  function diffDays(a, b) {
    const da = parseDate(a), db = parseDate(b);
    if (!da || !db) return null;
    return Math.round((da - db) / DAY_MS);
  }

  function daysUntil(str, from) {
    return diffDays(str, from || todayStr());
  }

  function sameDay(a, b) {
    return a && b && a === b;
  }

  function startOfWeek(str, weekStartsOn) {
    const d = parseDate(str);
    if (!d) return null;
    const shift = (d.getDay() - weekStartsOn + 7) % 7;
    d.setDate(d.getDate() - shift);
    return toDateStr(d);
  }

  function fmtDate(str, opts) {
    const d = parseDate(str);
    if (!d) return '—';
    opts = opts || {};
    if (opts.short) return `${DOW_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
    if (opts.long) return `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  function fmtDateSmart(str) {
    if (!str) return '';
    const n = daysUntil(str);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    if (n > 1 && n <= 6) return DOW_SHORT[parseDate(str).getDay()] + ', ' + MONTHS_SHORT[parseDate(str).getMonth()] + ' ' + parseDate(str).getDate();
    return fmtDate(str);
  }

  function fmtTime(t) {
    if (!t) return '';
    const m = /^([01]?\d|2[0-9]):([0-5]\d)$/.exec(t);
    if (!m) return t;
    let h = Number(m[1]);
    const min = m[2];
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${min} ${ap}`;
  }

  function minutesOf(t) {
    if (!t) return null;
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  function hhmm(mins) {
    mins = ((Math.round(mins) % 1440) + 1440) % 1440;
    return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
  }

  function fmtDuration(mins) {
    if (mins == null || isNaN(mins)) return '—';
    mins = Math.round(mins);
    if (mins < 60) return mins + 'm';
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  function relDayLabel(str) {
    const n = daysUntil(str);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    if (n < 0) return `${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'} overdue`;
    if (n <= 6) return DOW[parseDate(str).getDay()];
    return `in ${n} days`;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      const args = arguments, self = this;
      t = setTimeout(() => fn.apply(self, args), ms);
    };
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function greeting(hour) {
    if (hour < 5) return 'Burning the midnight oil';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function monthLabel(year, monthIdx) {
    return `${MONTHS[monthIdx]} ${year}`;
  }

  function isWindows() { return navigator.platform && /win/i.test(navigator.platform); }

  const Utils = {
    DAY_MS, MONTHS, MONTHS_SHORT, DOW, DOW_SHORT,
    uid, todayStr, toDateStr, parseDate, addDays, addMonths, diffDays, daysUntil,
    sameDay, startOfWeek, fmtDate, fmtDateSmart, fmtTime, minutesOf, hhmm, fmtDuration,
    relDayLabel, escapeHtml, debounce, clamp, greeting, monthLabel, isWindows
  };

  global.Utils = Utils;
  global.H = Utils.escapeHtml;
  if (typeof module !== 'undefined' && module.exports) module.exports = Utils;
})(typeof window !== 'undefined' ? window : globalThis);
