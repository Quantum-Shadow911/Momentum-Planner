/* AI tools: built-in smart engine — parsing, breakdown, estimation, study kits,
   writing feedback, weekly insights, and schedule suggestions. All use real data. */
import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';

const AI = globalThis.AI;
const S = globalThis.Storage;
const Store = globalThis.Store;

beforeEach(() => {
  globalThis.localStorage.clear();
  Store.replaceState(S.emptyState());
});

function makeState(tasks, extra) {
  const base = S.emptyState();
  base.tasks = tasks.map(t => S.normalizeTask(t));
  Object.assign(base, extra || {});
  return base;
}

describe('natural-language task parsing', () => {
  it('extracts due dates, priority and duration from a sentence', () => {
    const r = AI.parseTaskText('Science project due next Thursday, high priority, about an hour');
    expect(r.title.toLowerCase()).not.toContain('thursday');
    expect(r.dueDate).toBeTruthy();
    expect(r.priority).toBe('high');
    expect(r.estimateMin).toBe(60);
  });

  it('understands today, tomorrow, in N days and weekdays', () => {
    const today = AI.parseTaskText('Read chapter 4 today');
    const tomorrow = AI.parseTaskText('Read chapter 4 tomorrow');
    const inDays = AI.parseTaskText('Read chapter 4 in 3 days');
    const weekday = AI.parseTaskText('Read chapter 4 by friday');
    expect(today.dueDate).toBeTruthy();
    expect(tomorrow.dueDate).toBeTruthy();
    expect(inDays.dueDate).toBeTruthy();
    expect(weekday.dueDate).toBeTruthy();
    const diff = new Date(inDays.dueDate) - new Date(today.dueDate);
    expect([2, 3]).toContain(Math.round(diff / 86400000));
  });

  it('extracts times like "at 4pm"', () => {
    const r = AI.parseTaskText('Band practice at 4pm');
    expect(r.time).toBe('16:00');
  });

  it('detects urgent and low priority without letting them pollute the title', () => {
    expect(AI.parseTaskText('Finish lab urgent').priority).toBe('urgent');
    expect(AI.parseTaskText('Finish lab urgent').title).not.toContain('urgent');
    expect(AI.parseTaskText('Organize binder, low priority').priority).toBe('low');
  });

  it('guesses the class from its name and keeps plain text as title', () => {
    const state = makeState([], { classes: [S.normalizeClass({ id: 'cls-math', name: 'Course 3 Math', period: '04' })] });
    const r = AI.parseTaskText('Math worksheet 4.2', state);
    expect(r.classId).toBe('cls-math');
    const plain = AI.parseTaskText('Buy new notebooks');
    expect(plain.title).toBe('Buy new notebooks');
    expect(plain.dueDate).toBeNull();
    expect(plain.priority).toBe('medium');
  });
});

describe('assignment breakdown', () => {
  it('produces steps for each assignment type and distributes the estimate', async () => {
    const r = await AI.breakdown({ assignmentType: 'essay', title: 'Industrial Revolution essay', estimateMin: 120 });
    expect(r.steps.length).toBeGreaterThanOrEqual(4);
    expect(r.steps.some(s => /draft/i.test(s.title))).toBe(true);
    const total = r.steps.reduce((n, s) => n + s.minutes, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('adds extra steps when the description mentions diagrams or presenting', async () => {
    const r = await AI.breakdown({ assignmentType: 'project', title: 'Water cycle', description: 'Include diagrams and present it on Friday' });
    expect(r.steps.some(s => /diagram/i.test(s.title))).toBe(true);
    expect(r.steps.some(s => /present/i.test(s.title))).toBe(true);
  });

  it('spreads study sessions between today and the due date, skipping breaks', async () => {
    const today = globalThis.Utils.todayStr();
    const due = globalThis.Utils.addDays(today, 5);
    const state = makeState([], { breaks: [S.normalizeBreak({ id: 'b1', name: 'Day off', start: globalThis.Utils.addDays(today, 2), end: globalThis.Utils.addDays(today, 2) })] });
    Store.replaceState(state);
    const r = await AI.breakdown({ assignmentType: 'project', title: 'Big project', dueDate: due, estimateMin: 90 });
    expect(r.sessions.length).toBeGreaterThan(0);
    for (const s of r.sessions) {
      expect(s.date >= today && s.date <= due).toBe(true);
      expect(s.date).not.toBe(globalThis.Utils.addDays(today, 2));
    }
  });
});

describe('time estimation', () => {
  it('gives a range and a split based on assignment type', () => {
    const r = AI.estimate({ assignmentType: 'homework', title: 'Problems 1-20' }, S.emptyState());
    expect(r.lo).toBeGreaterThanOrEqual(5);
    expect(r.hi).toBeGreaterThan(r.lo);
    expect(r.split.length).toBe(3);
    expect(r.fromHistory).toBe(false);
  });

  it('uses completion history from similar finished tasks', () => {
    const state = makeState([
      { id: 'done1', title: 'Math homework 1', assignmentType: 'homework', status: 'completed', estimateMin: 30, manualMin: 90 },
      { id: 'done2', title: 'Math homework 2', assignmentType: 'homework', status: 'completed', estimateMin: 30, manualMin: 110 }
    ]);
    const r = AI.estimate({ assignmentType: 'homework', title: 'Math homework 3' }, state);
    expect(r.fromHistory).toBe(true);
    expect(r.anchor).toBeGreaterThan(30);
  });
});

describe('study kit generator', () => {
  it('builds flashcards, concepts, quiz and summary from real text', async () => {
    const kit = await AI.studyKit({
      title: 'Water cycle',
      description: 'Evaporation is when the sun heats water and it turns into vapor. Condensation is when vapor cools into clouds. Precipitation is rain, snow or hail falling from clouds.'
    });
    expect(kit).toBeTruthy();
    expect(kit.flashcards.length).toBeGreaterThanOrEqual(2);
    expect(kit.concepts.length).toBeGreaterThan(0);
    expect(kit.summary.length).toBeGreaterThan(10);
    expect(kit.quiz.length).toBeGreaterThanOrEqual(1);
    for (const q of kit.quiz) {
      expect(q.choices.length).toBeGreaterThanOrEqual(3);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.choices.length);
      expect(q.choices[q.answer]).toBe(q.choices[q.answer]);
    }
  });

  it('rejects with a helpful message when there is no material', async () => {
    await expect(AI.studyKit({ title: 'Empty task' })).rejects.toThrow(/description or notes/i);
  });
});

describe('writing feedback', () => {
  it('catches repeated words, long sentences and informal wording', () => {
    const r = AI.writingFeedback('the the experiment was fun. I gonna do a lot of stuff and then we did many many many parts and it kept going and going and going and it was really really long and had so much in it that nobody could read it in one breath at all.');
    expect(r.issues.some(i => i.title === 'Repeated word')).toBe(true);
    expect(r.issues.some(i => i.title === 'Informal wording')).toBe(true);
    expect(r.issues.some(i => i.title === 'Vague phrase')).toBe(true);
    expect(r.wordCount).toBeGreaterThan(10);
  });

  it('passes clean text and flags empty text as ok', () => {
    expect(AI.writingFeedback('').ok).toBe(true);
    const clean = AI.writingFeedback('Plants need sunlight to grow. We measured each plant every day. The results showed steady growth.');
    expect(clean.issues.filter(i => i.title === 'Repeated word').length).toBe(0);
  });
});

describe('weekly insights (real data only)', () => {
  it('counts completions, overdue and due-soon from actual tasks', async () => {
    const today = globalThis.Utils.todayStr();
    const state = makeState([
      { id: 'a', title: 'Done today', status: 'completed', completedAt: new Date().toISOString(), dueDate: today },
      { id: 'b', title: 'Overdue', dueDate: globalThis.Utils.addDays(today, -3) },
      { id: 'c', title: 'Due soon', dueDate: globalThis.Utils.addDays(today, 4) }
    ]);
    const ins = await AI.weeklyInsights(state, today);
    expect(ins.completed).toBe(1);
    expect(ins.overdue).toBe(1);
    expect(ins.dueSoon).toBe(1);
    expect(ins.wentWell.length).toBeGreaterThan(0);
    expect(ins.improve.length).toBeGreaterThan(0);
    expect(ins.suggestion.length).toBeGreaterThan(0);
    expect(ins.source).toBe('built-in');
  });

  it('computes an on-time rate from completed dated tasks', async () => {
    const today = globalThis.Utils.todayStr();
    const state = makeState([
      { id: 'a', title: 'On time', status: 'completed', completedAt: new Date().toISOString(), dueDate: today },
      { id: 'b', title: 'Late', status: 'completed', completedAt: new Date(Date.now() + 3 * 86400000).toISOString(), dueDate: today }
    ]);
    const ins = await AI.weeklyInsights(state, today);
    expect(ins.onTimeRate).toBe(50);
  });
});

describe('smart schedule suggestions', () => {
  it('suggests sessions for upcoming deadlines and respects the daily limit', () => {
    const today = globalThis.Utils.todayStr();
    const state = makeState([
      { id: 't1', title: 'Essay draft', dueDate: globalThis.Utils.addDays(today, 4), estimateMin: 120, priority: 'high' },
      { id: 't2', title: 'Small homework', dueDate: globalThis.Utils.addDays(today, 2), estimateMin: 30 }
    ]);
    state.settings.dailyLoadLimit = 120;
    const plans = AI.suggestPlan(state, today);
    expect(plans.length).toBeGreaterThan(0);
    for (const pl of plans) {
      expect(pl.durationMin).toBeLessThanOrEqual(45);
      expect(pl.date < state.tasks.find(t => t.id === pl.taskId).dueDate).toBe(true);
      expect(pl.time).toBeTruthy();
    }
    const perDay = {};
    plans.forEach(pl => { perDay[pl.date] = (perDay[pl.date] || 0) + pl.durationMin; });
    for (const d of Object.keys(perDay)) expect(perDay[d]).toBeLessThanOrEqual(120);
  });

  it('skips break days and already-finished work', () => {
    const today = globalThis.Utils.todayStr();
    const state = makeState([
      { id: 't1', title: 'During break', dueDate: globalThis.Utils.addDays(today, 4), estimateMin: 60 },
      { id: 't2', title: 'Already done', dueDate: globalThis.Utils.addDays(today, 4), estimateMin: 60, status: 'completed' }
    ], { breaks: [S.normalizeBreak({ id: 'b1', name: 'Break', start: today, end: globalThis.Utils.addDays(today, 2) })] });
    const plans = AI.suggestPlan(state, today);
    for (const pl of plans) {
      expect(pl.taskId).toBe('t1');
      expect(pl.date).not.toBe(today);
      expect(pl.date).not.toBe(globalThis.Utils.addDays(today, 1));
      expect(pl.date).not.toBe(globalThis.Utils.addDays(today, 2));
    }
    expect(plans.length).toBeGreaterThan(0);
  });
});

describe('remote AI is opt-in and fails safely', () => {
  it('is off by default and the built-in engine is used instead', () => {
    expect(AI.isRemote()).toBe(false);
    const state = makeState([]);
    Store.replaceState(state);
    return AI.breakdown({ title: 'Worksheet', assignmentType: 'homework' }).then(r => {
      expect(r.source).toBe('built-in');
    });
  });

  it('falls back to the built-in engine when the remote model fails', () => {
    Store.replaceState(S.emptyState());
    Store.updateSettings({ ai: { enabled: true, baseUrl: 'http://localhost:9/v1', model: 'test', apiKey: 'k' } });
    expect(AI.isRemote()).toBe(true);
    return AI.breakdown({ title: 'Essay', assignmentType: 'essay', description: 'write about history' }).then(r => {
      expect(r.source).toBe('built-in');
      expect(r.steps.length).toBeGreaterThanOrEqual(4);
    });
  });
});
