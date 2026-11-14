import { describe, it, expect } from 'vitest';
import './setup.js';

const U = globalThis.Utils;

describe('date helpers', () => {
  it('addDays crosses month boundaries correctly', () => {
    expect(U.addDays('2025-01-30', 3)).toBe('2025-02-02');
    expect(U.addDays('2024-02-28', 1)).toBe('2024-02-29'); // leap year
    expect(U.addDays('2025-02-28', 1)).toBe('2025-03-01'); // non-leap
    expect(U.addDays('2025-03-01', -1)).toBe('2025-02-28');
  });

  it('addMonths clamps end-of-month overflow', () => {
    expect(U.addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(U.addMonths('2025-03-31', 1)).toBe('2025-04-30');
    expect(U.addMonths('2025-02-15', 12)).toBe('2026-02-15');
  });

  it('diffDays and daysUntil are signed and exact', () => {
    expect(U.diffDays('2025-06-10', '2025-06-01')).toBe(9);
    expect(U.diffDays('2025-06-01', '2025-06-10')).toBe(-9);
  });

  it('startOfWeek respects week start setting', () => {
    // 2025-06-05 is a Thursday
    expect(U.startOfWeek('2025-06-05', 1)).toBe('2025-06-02'); // Monday
    expect(U.startOfWeek('2025-06-05', 0)).toBe('2025-06-01'); // Sunday
  });

  it('parses invalid dates to null', () => {
    expect(U.parseDate('2025-13-40')).toBe(null);
    expect(U.parseDate('')).toBe(null);
    expect(U.parseDate('not-a-date')).toBe(null);
  });
});

describe('time helpers', () => {
  it('fmtTime converts to 12h format', () => {
    expect(U.fmtTime('09:05')).toBe('9:05 AM');
    expect(U.fmtTime('13:45')).toBe('1:45 PM');
    expect(U.fmtTime('00:15')).toBe('12:15 AM');
    expect(U.fmtTime('12:00')).toBe('12:00 PM');
  });

  it('minutesOf parses valid times only', () => {
    expect(U.minutesOf('02:30')).toBe(150);
    expect(U.minutesOf('23:59')).toBe(1439);
    expect(U.minutesOf('25:00')).toBe(null);
    expect(U.minutesOf(null)).toBe(null);
  });

  it('fmtDuration renders compact durations', () => {
    expect(U.fmtDuration(45)).toBe('45m');
    expect(U.fmtDuration(60)).toBe('1h');
    expect(U.fmtDuration(135)).toBe('2h 15m');
  });
});

describe('formatting & safety', () => {
  it('escapeHtml neutralizes markup', () => {
    expect(U.escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(U.escapeHtml('a & b "c"')).toBe('a &amp; b &quot;c&quot;');
  });

  it('greeting matches time of day', () => {
    expect(U.greeting(8)).toBe('Good morning');
    expect(U.greeting(14)).toBe('Good afternoon');
    expect(U.greeting(21)).toBe('Good evening');
  });
});
