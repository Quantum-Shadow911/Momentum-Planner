import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';

const P = globalThis.Priority;
const PL = globalThis.Planner;
const S = globalThis.Storage;
const Store = globalThis.Store;
const Timer = globalThis.Timer;

function makeState(tasks, extra) {
  const base = S.emptyState();
  base.tasks = tasks.map(t => S.normalizeTask(t));
  Object.assign(base, extra || {});
  return base;
}

describe('school breaks', () => {
  const state = makeState([], { breaks: [S.normalizeBreak({ id: 'b1', name: 'Winter break', start: '2025-12-20', end: '2026-01-02' })] });

  it('identifies days inside a break range', () => {
    expect(PL.isBreakDay(state, '2025-12-25')).toBe(true);
    expect(PL.isBreakDay(state, '2025-12-20')).toBe(true);
    expect(PL.isBreakDay(state, '2026-01-02')).toBe(true);
  });

  it('identifies days outside a break range', () => {
    expect(PL.isBreakDay(state, '2025-12-19')).toBe(false);
    expect(PL.isBreakDay(state, '2026-01-03')).toBe(false);
  });

  it('normalizeBreak rejects inverted or incomplete ranges', () => {
    expect(S.normalizeBreak({ name: 'Bad', start: '2025-12-20', end: '2025-12-19' })).toBeNull();
    expect(S.normalizeBreak({ name: '', start: '2025-12-20', end: '2025-12-22' })).toBeNull();
    expect(S.normalizeBreak({ name: 'Bad date', start: '2025-02-30', end: '2025-12-22' })).toBeNull();
  });
});

describe('workload distribution', () => {
  it('suggests moving sessions off an overloaded day to a lighter day before the due date', () => {
    const state = makeState([
      {
        id: 't1', title: 'Big project', dueDate: '2025-06-10', estimateMin: 300, assignmentType: 'project',
        sessions: [
          { date: '2025-06-05', durationMin: 120, objective: 'build' },
          { date: '2025-06-05', durationMin: 90, objective: 'polish' }
        ]
      }
    ]);
    state.settings.dailyLoadLimit = 150;
    const sug = PL.suggestDistribution(state, '2025-06-05');
    expect(sug.length).toBeGreaterThan(0);
    expect(sug[0].fromDate).toBe('2025-06-05');
    expect(sug[0].toDate).not.toBe('2025-06-05');
    expect(sug[0].toDate < '2025-06-10').toBe(true);
    for (const s of sug) expect(s.durationMin).toBeGreaterThan(0);
  });

  it('never suggests moving a session onto a break day', () => {
    const state = makeState([
      {
        id: 't1', title: 'Project', dueDate: '2025-06-20', estimateMin: 300,
        sessions: [{ date: '2025-06-05', durationMin: 200, objective: 'build' }]
      }
    ], { breaks: [S.normalizeBreak({ name: 'Break', start: '2025-06-06', end: '2025-06-09' })] });
    state.settings.dailyLoadLimit = 60;
    const sug = PL.suggestDistribution(state, '2025-06-05');
    sug.forEach(s => {
      expect(PL.isBreakDay(state, s.toDate)).toBe(false);
    });
  });

  it('returns no suggestions when every day is under the limit', () => {
    const state = makeState([
      { id: 't1', title: 'Light', dueDate: '2025-06-06', sessions: [{ date: '2025-06-05', durationMin: 30 }] }
    ]);
    const sug = PL.suggestDistribution(state, '2025-06-05');
    expect(sug).toEqual([]);
  });
});

describe('smart rescheduling', () => {
  it('proposes a new due date for overdue tasks and new dates for missed sessions', () => {
    const state = makeState([
      { id: 'late', title: 'Late homework', dueDate: '2025-06-01', estimateMin: 30 },
      { id: 't2', title: 'Project', dueDate: '2025-06-20', sessions: [{ date: '2025-06-02', durationMin: 45, objective: 'draft' }] }
    ]);
    const sug = PL.suggestReschedule(state, '2025-06-05');
    const taskSug = sug.find(s => s.kind === 'task');
    const sesSug = sug.find(s => s.kind === 'session');
    expect(taskSug).toBeTruthy();
    expect(taskSug.taskId).toBe('late');
    expect(taskSug.toDate >= '2025-06-05').toBe(true);
    expect(sesSug).toBeTruthy();
    expect(sesSug.taskId).toBe('t2');
    expect(sesSug.toDate >= '2025-06-05').toBe(true);
    expect(sesSug.toDate <= '2025-06-20').toBe(true);
  });

  it('returns nothing when there is no overdue work or missed sessions', () => {
    const state = makeState([
      { id: 'ok', title: 'Fine', dueDate: '2025-06-10', sessions: [{ date: '2025-06-08', durationMin: 30 }] }
    ]);
    expect(PL.suggestReschedule(state, '2025-06-05')).toEqual([]);
  });
});

describe('assignment templates', () => {
  it('builds an essay with subtasks and sessions spread before the due date', () => {
    const fields = PL.buildFromTemplate('essay', { title: 'History essay', dueDate: '2025-06-20', today: '2025-06-05', state: makeState([]) });
    expect(fields.title).toBe('History essay');
    expect(fields.assignmentType).toBe('essay');
    expect(fields.estimateMin).toBe(240);
    expect(fields.subtasks.length).toBe(4);
    expect(fields.sessions.length).toBe(4);
    fields.sessions.forEach(s => {
      expect(s.date > '2025-06-05').toBe(true);
      expect(s.date < '2025-06-20').toBe(true);
    });
    const dates = fields.sessions.map(s => s.date);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('skips break days when placing sessions', () => {
    const state = makeState([], { breaks: [S.normalizeBreak({ name: 'Break', start: '2025-06-15', end: '2025-06-17' })] });
    const fields = PL.buildFromTemplate('lab', { dueDate: '2025-06-18', today: '2025-06-05', state });
    fields.sessions.forEach(s => {
      expect(PL.isBreakDay(state, s.date)).toBe(false);
    });
  });

  it('falls back to no sessions when there is no due date', () => {
    const fields = PL.buildFromTemplate('homework', { title: 'Untitled homework', today: '2025-06-05', state: makeState([]) });
    expect(fields.dueDate).toBeNull();
    expect(fields.sessions).toEqual([]);
    expect(fields.subtasks.length).toBeGreaterThan(0);
  });

  it('returns null for unknown templates', () => {
    expect(PL.buildFromTemplate('nope', {})).toBeNull();
  });
});

describe('store: session moves, spent time and breaks', () => {
  beforeEach(() => {
    localStorage.clear();
    Store.init();
  });

  it('moveSession relocates a session and keeps duration', () => {
    const t = Store.saveTask({ title: 'Study', sessions: [{ date: '2025-06-05', durationMin: 40, objective: 'read' }] });
    const ses = t.sessions[0];
    Store.moveSession(t.id, ses.id, '2025-06-07');
    const after = Store.getTask(t.id);
    expect(after.sessions[0].date).toBe('2025-06-07');
    expect(after.sessions[0].durationMin).toBe(40);
  });

  it('addSpentTime accumulates actual minutes', () => {
    const t = Store.saveTask({ title: 'Chores' });
    Store.addSpentTime(t.id, 25);
    Store.addSpentTime(t.id, 10);
    expect(Store.getTask(t.id).actualMin).toBe(35);
  });

  it('toggleSession recalculates actualMin in both directions', () => {
    const t = Store.saveTask({ title: 'Study', sessions: [{ date: '2025-06-05', durationMin: 30 }, { date: '2025-06-06', durationMin: 40 }] });
    Store.toggleSession(t.id, t.sessions[0].id);
    expect(Store.getTask(t.id).actualMin).toBe(30);
    Store.toggleSession(t.id, t.sessions[1].id);
    expect(Store.getTask(t.id).actualMin).toBe(70);
    Store.toggleSession(t.id, t.sessions[0].id);
    expect(Store.getTask(t.id).actualMin).toBe(40);
  });

  it('timer-logged time is not double-counted when sessions complete', () => {
    const t = Store.saveTask({ title: 'Study', sessions: [{ date: '2025-06-05', durationMin: 30 }] });
    Store.addSpentTime(t.id, 25);
    expect(Store.getTask(t.id).actualMin).toBe(25);
    Store.toggleSession(t.id, t.sessions[0].id);
    expect(Store.getTask(t.id).actualMin).toBe(55);
  });

  it('saveBreak and deleteBreak manage the break list', () => {
    const b = Store.saveBreak({ name: 'Half term', start: '2025-10-27', end: '2025-10-31' });
    expect(b).toBeTruthy();
    expect(Store.get().breaks.length).toBe(1);
    Store.deleteBreak(b.id);
    expect(Store.get().breaks.length).toBe(0);
    expect(Store.saveBreak({ name: 'Bad', start: '2025-10-30', end: '2025-10-29' })).toBeNull();
  });
});

describe('attachments and note-class links', () => {
  it('normalizeTask keeps valid attachments and drops invalid ones', () => {
    const good = { name: 'worksheet.pdf', size: 1234, dataUrl: 'data:application/pdf;base64,AAA' };
    const t = S.normalizeTask({ title: 'With files', attachments: [good, { name: 'no url' }, { name: 'too big', size: 9, dataUrl: 'http://example.com/x' }] });
    expect(t.attachments.length).toBe(1);
    expect(t.attachments[0].name).toBe('worksheet.pdf');
  });

  it('normalizeNote keeps a class link and normalize validates it', () => {
    const n = S.normalizeNote({ title: 'Chem formulas', classId: 'cls-x' });
    expect(n.classId).toBe('cls-x');
    const state = S.normalize({ notes: [n], classes: [{ id: 'cls-x', name: 'Chemistry' }] });
    expect(state.notes[0].classId).toBe('cls-x');
    const dropped = S.normalize({ notes: [n], classes: [] });
    expect(dropped.notes[0].classId).toBeNull();
  });
});

describe('study timer', () => {
  beforeEach(() => {
    localStorage.clear();
    Store.init();
    Timer.cancel();
  });

  it('tracks start, pause, resume and finish against a task', () => {
    const t = Store.saveTask({ title: 'Timed work' });
    Timer.start(t.id);
    expect(Timer.status().active).toBe(true);
    expect(Timer.status().running).toBe(true);
    Timer.pause();
    expect(Timer.status().running).toBe(false);
    Timer.resume();
    expect(Timer.status().running).toBe(true);
    const res = Timer.finish();
    expect(res.taskId).toBe(t.id);
    expect(res.committed).toBe(true);
    expect(res.minutes).toBeGreaterThanOrEqual(1);
    expect(Store.getTask(t.id).actualMin).toBe(res.minutes);
    expect(Timer.status().active).toBe(false);
  });

  it('survives a refresh by restoring from localStorage', () => {
    const t = Store.saveTask({ title: 'Refresh work' });
    Timer.start(t.id);
    const restored = Timer.init();
    expect(restored.active).toBe(true);
    expect(restored.taskId).toBe(t.id);
    Timer.cancel();
  });

  it('refuses to start for a missing task', () => {
    expect(Timer.start('nope')).toBeNull();
    expect(Timer.status().active).toBe(false);
  });
});
