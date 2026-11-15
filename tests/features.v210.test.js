/* Tests for v2.1.0 features: recurring events, weekly review, storage meter, conflict detection, cache-busting. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import './setup.js';
const Utils = globalThis.Utils;
const Priority = globalThis.Priority;
const Planner = globalThis.Planner;
const Store = globalThis.Store;

const mkState = (events = [], tasks = []) => ({
  tasks,
  events,
  classes: [],
  categories: [],
  projects: [],
  goals: [],
  notes: [],
  breaks: [],
  activity: [],
  settings: { weekStartsOn: 0, dailyLoadLimit: 180 }
});

describe('recurring events — eventOccursOn', () => {
  const weekly = { date: '2025-01-06', recurrence: { type: 'weekly', interval: 1 } }; // a Monday

  it('weekly recurrence hits the same weekday every 7 days', () => {
    expect(Priority.eventOccursOn(weekly, '2025-01-06')).toBe(true); // start date
    expect(Priority.eventOccursOn(weekly, '2025-01-13')).toBe(true);
    expect(Priority.eventOccursOn(weekly, '2025-02-03')).toBe(true);
    expect(Priority.eventOccursOn(weekly, '2025-01-07')).toBe(false);
    expect(Priority.eventOccursOn(weekly, '2025-01-10')).toBe(false);
  });

  it('biweekly recurrence skips alternate weeks and respects interval', () => {
    const bi = { date: '2025-01-06', recurrence: { type: 'biweekly', interval: 1 } };
    expect(Priority.eventOccursOn(bi, '2025-01-20')).toBe(true);
    expect(Priority.eventOccursOn(bi, '2025-01-13')).toBe(false);
    const bi4 = { date: '2025-01-06', recurrence: { type: 'biweekly', interval: 2 } };
    expect(Priority.eventOccursOn(bi4, '2025-02-03')).toBe(true); // 4 weeks later
    expect(Priority.eventOccursOn(bi4, '2025-01-20')).toBe(false);
  });

  it('daily recurrence respects interval', () => {
    const d2 = { date: '2025-01-06', recurrence: { type: 'daily', interval: 2 } };
    expect(Priority.eventOccursOn(d2, '2025-01-08')).toBe(true);
    expect(Priority.eventOccursOn(d2, '2025-01-07')).toBe(false);
  });

  it('monthly recurrence matches day-of-month with interval', () => {
    const m = { date: '2025-01-10', recurrence: { type: 'monthly', interval: 1 } };
    expect(Priority.eventOccursOn(m, '2025-02-10')).toBe(true);
    expect(Priority.eventOccursOn(m, '2025-04-10')).toBe(true);
    expect(Priority.eventOccursOn(m, '2025-02-11')).toBe(false);
    const m2 = { date: '2025-01-10', recurrence: { type: 'monthly', interval: 2 } };
    expect(Priority.eventOccursOn(m2, '2025-03-10')).toBe(true);
    expect(Priority.eventOccursOn(m2, '2025-02-10')).toBe(false);
  });

  it('weekday recurrence skips weekends and respects interval', () => {
    const w = { date: '2025-01-06', recurrence: { type: 'weekdays', interval: 1 } }; // Monday
    expect(Priority.eventOccursOn(w, '2025-01-07')).toBe(true);
    expect(Priority.eventOccursOn(w, '2025-01-11')).toBe(false); // Saturday
    expect(Priority.eventOccursOn(w, '2025-01-12')).toBe(false); // Sunday
    expect(Priority.eventOccursOn(w, '2025-01-13')).toBe(true);
  });

  it('never fires before the start date or for type none', () => {
    expect(Priority.eventOccursOn(weekly, '2025-01-05')).toBe(false);
    expect(Priority.eventOccursOn({ date: '2025-01-06', recurrence: { type: 'none', interval: 1 } }, '2025-01-13')).toBe(false);
    expect(Priority.eventOccursOn({ date: '2025-01-06' }, '2025-01-13')).toBe(false);
  });
});

describe('eventsOn expands virtual occurrences', () => {
  it('returns the exact event on its date and virtual copies on recurrence dates', () => {
    const state = mkState([{ id: 'e1', title: 'Soccer', date: '2025-01-06', time: '18:00', recurrence: { type: 'weekly', interval: 1 } }]);
    const exact = Priority.eventsOn(state, '2025-01-06');
    expect(exact.length).toBe(1);
    expect(exact[0].recurring).toBeUndefined();
    const virt = Priority.eventsOn(state, '2025-01-13');
    expect(virt.length).toBe(1);
    expect(virt[0].id).toBe('e1');
    expect(virt[0].date).toBe('2025-01-13');
    expect(virt[0].recurring).toBe(true);
    expect(Priority.eventsOn(state, '2025-01-07').length).toBe(0);
  });

  it('upcomingEvents walks day-by-day so recurring events appear in the horizon', () => {
    const state = mkState([{ id: 'e1', title: 'Soccer', date: '2025-01-06', recurrence: { type: 'weekly', interval: 1 } }]);
    const up = Priority.upcomingEvents(state, 8, '2025-01-06');
    expect(up.filter(e => e.id === 'e1').length).toBe(2); // Jan 6 + Jan 13 (virtual)
  });

  it('recurrenceLabel renders human text and empty for one-offs', () => {
    expect(Priority.recurrenceLabel({ recurrence: { type: 'weekly', interval: 1 } })).toContain('week');
    expect(Priority.recurrenceLabel({ recurrence: { type: 'none', interval: 1 } })).toBe('');
    expect(Priority.recurrenceLabel({})).toBe('');
  });
});

describe('conflict detection — Planner.conflictsOn', () => {
  it('detects an event overlapping a timed study session', () => {
    const state = mkState(
      [{ id: 'e1', title: 'Dentist', date: '2025-01-06', time: '16:00', endTime: '17:00' }],
      [{ id: 't1', title: 'Homework', status: 'open', estimateMin: 60, sessions: [{ id: 's1', date: '2025-01-06', time: '16:30', durationMin: 45, done: false }] }]
    );
    const c = Planner.conflictsOn(state, '2025-01-06');
    expect(c.length).toBe(1);
    expect(c[0].a.label).toContain('Dentist');
    expect(c[0].b.label).toBe('Homework');
  });

  it('reports no conflicts when times do not overlap', () => {
    const state = mkState(
      [{ id: 'e1', title: 'Practice', date: '2025-01-06', time: '18:00', endTime: '19:30' }],
      [{ id: 't1', title: 'Homework', status: 'open', estimateMin: 60, sessions: [{ id: 's1', date: '2025-01-06', time: '16:00', durationMin: 45, done: false }] }]
    );
    expect(Planner.conflictsOn(state, '2025-01-06').length).toBe(0);
  });

  it('ignores all-day items and completed tasks', () => {
    const state = mkState(
      [{ id: 'e1', title: 'Fair', date: '2025-01-06' }],
      [{ id: 't1', title: 'Old', status: 'completed', dueDate: '2025-01-06', time: '10:00', estimateMin: 60 }]
    );
    expect(Planner.conflictsOn(state, '2025-01-06').length).toBe(0);
  });
});

describe('event-aware loadMap', () => {
  it('adds event duration to a day\u2019s load so balancing avoids it', () => {
    const evDay = '2025-01-08';
    const state = mkState([{ id: 'e1', title: 'Big event', date: evDay, time: '18:00', endTime: '20:00' }]);
    const map = Planner.loadMap(state, '2025-01-06', 5);
    expect(map[evDay]).toBeGreaterThanOrEqual(120);
    expect(map['2025-01-06']).toBe(0);
  });
});

describe('Utils.hhmm', () => {
  it('converts minutes-since-midnight to HH:MM and wraps around midnight', () => {
    expect(Utils.hhmm(0)).toBe('00:00');
    expect(Utils.hhmm(1080)).toBe('18:00');
    expect(Utils.hhmm(1500)).toBe('01:00');
  });
});
