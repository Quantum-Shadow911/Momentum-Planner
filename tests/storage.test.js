import { describe, it, expect } from 'vitest';
import './setup.js';

const S = globalThis.Storage;
const Store = globalThis.Store;
const U = globalThis.Utils;

describe('storage validation', () => {
  it('drops tasks without a title and fixes bad enums', () => {
    const state = S.normalize({
      tasks: [
        { title: 'Valid task', priority: 'mega', status: 'nope' },
        { description: 'no title' },
        null,
        { title: '  Spaced  ', tags: ['ok', 42, '  trimmed  '] }
      ]
    });
    expect(state.tasks.length).toBe(2);
    expect(state.tasks[0].priority).toBe('medium');
    expect(state.tasks[0].status).toBe('not-started');
    expect(state.tasks[1].title).toBe('Spaced');
    expect(state.tasks[1].tags).toEqual(['ok', 'trimmed']);
  });

  it('strips dangling references (category, project, dependencies)', () => {
    const state = S.normalize({
      categories: [{ id: 'c1', name: 'School' }],
      projects: [{ id: 'p1', name: 'Paper' }],
      tasks: [
        { id: 'a', title: 'A', categoryId: 'c1', projectId: 'p1', dependsOn: ['b'] },
        { id: 'b', title: 'B', categoryId: 'ghost', projectId: 'ghost', dependsOn: ['a', 'a'] }
      ]
    });
    expect(state.tasks[0].categoryId).toBe('c1');
    expect(state.tasks[0].projectId).toBe('p1');
    expect(state.tasks[1].categoryId).toBe(null);
    expect(state.tasks[1].projectId).toBe(null);
    expect(state.tasks[0].dependsOn).toEqual(['b']);
    expect(state.tasks[1].dependsOn).toEqual(['a']);
  });

  it('export → import round-trip preserves data', () => {
    const state = S.normalize({ tasks: [{ title: 'Round trip', dueDate: '2025-01-15', tags: ['x'] }], categories: [{ id: 'c1', name: 'Test' }] });
    const json = S.exportJson(state);
    const res = S.importJson(json);
    expect(res.error).toBeUndefined();
    expect(res.data.tasks[0].title).toBe('Round trip');
    expect(res.data.tasks[0].dueDate).toBe('2025-01-15');
  });

  it('rejects impossible calendar dates on import', () => {
    const state = S.normalize({
      tasks: [
        { title: 'Bad day', dueDate: '2025-02-30' },
        { title: 'Bad month', dueDate: '2025-13-05' },
        { title: 'Good day', dueDate: '2025-02-28' }
      ]
    });
    expect(state.tasks[0].dueDate).toBe(null);
    expect(state.tasks[1].dueDate).toBe(null);
    expect(state.tasks[2].dueDate).toBe('2025-02-28');
  });

  it('importJson rejects garbage with a friendly error', () => {
    expect(S.importJson('not json{').error).toBeTruthy();
    expect(S.importJson('{"foo": 1}').error).toBeTruthy();
  });
});

describe('store actions & recurrence', () => {
  function freshStore() {
    globalThis.localStorage.clear();
    Store.init();
    Store.replaceState(S.emptyState());
  }

  it('toggleTask completes and un-completes with timestamps', () => {
    freshStore();
    const t = Store.saveTask({ title: 'Toggle me' });
    expect(t.status).toBe('not-started');
    Store.toggleTask(t.id);
    expect(Store.getTask(t.id).status).toBe('completed');
    expect(Store.getTask(t.id).completedAt).toBeTruthy();
    Store.toggleTask(t.id);
    expect(Store.getTask(t.id).status).toBe('not-started');
    expect(Store.getTask(t.id).completedAt).toBe(null);
  });

  it('daily recurrence spawns the next instance on completion', () => {
    freshStore();
    const today = U.todayStr();
    const t = Store.saveTask({ title: 'Daily chore', dueDate: today, recurrence: { type: 'daily', interval: 1 } });
    Store.toggleTask(t.id);
    const tasks = Store.get().tasks;
    expect(tasks.length).toBe(2);
    const next = tasks.find(x => x.id !== t.id);
    expect(next.dueDate).toBe(U.addDays(today, 1));
    expect(next.status).toBe('not-started');
    expect(next.subtasks.every(st => !st.done)).toBe(true);
  });

  it('weekly recurrence advances by a week; monthly clamps month ends', () => {
    freshStore();
    const t1 = Store.saveTask({ title: 'Weekly', dueDate: '2025-06-10', recurrence: { type: 'weekly', interval: 1 } });
    Store.toggleTask(t1.id);
    expect(Store.get().tasks.find(x => x.id !== t1.id).dueDate).toBe('2025-06-17');

    Store.replaceState(S.emptyState());
    const t2 = Store.saveTask({ title: 'Monthly', dueDate: '2025-01-31', recurrence: { type: 'monthly', interval: 1 } });
    Store.toggleTask(t2.id);
    expect(Store.get().tasks.find(x => x.id !== t2.id).dueDate).toBe('2025-02-28');
  });

  it('weekday recurrence skips weekends', () => {
    freshStore();
    const t = Store.saveTask({ title: 'Weekday task', dueDate: '2025-06-06', recurrence: { type: 'weekdays', interval: 1 } });
    Store.toggleTask(t.id);
    expect(Store.get().tasks.find(x => x.id !== t.id).dueDate).toBe('2025-06-09');
  });

  it('weekday recurrence respects its interval (regression)', () => {
    freshStore();
    const t = Store.saveTask({ title: 'Every 2 weekdays', dueDate: '2025-06-06', recurrence: { type: 'weekdays', interval: 2 } });
    Store.toggleTask(t.id);
    expect(Store.get().tasks.find(x => x.id !== t.id).dueDate).toBe('2025-06-10');
  });

  it('biweekly recurrence respects its interval (regression)', () => {
    freshStore();
    const t = Store.saveTask({ title: 'Every 4 weeks', dueDate: '2025-06-06', recurrence: { type: 'biweekly', interval: 2 } });
    Store.toggleTask(t.id);
    expect(Store.get().tasks.find(x => x.id !== t.id).dueDate).toBe('2025-07-04');
  });

  it('deleteTask moves to trash and cleans dependencies; trash restores', () => {
    freshStore();
    const a = Store.saveTask({ title: 'First' });
    const b = Store.saveTask({ title: 'Second', dependsOn: [a.id] });
    Store.deleteTask(a.id);
    expect(Store.get().tasks.length).toBe(1);
    expect(Store.getTask(b.id).dependsOn).toEqual([]);
    expect(Store.get().trash.length).toBe(1);
    Store.restoreTrash(Store.get().trash[0].id);
    expect(Store.get().tasks.length).toBe(2);
    expect(Store.get().trash.length).toBe(0);
  });

  it('trash restoration preserves the original item content (regression)', () => {
    freshStore();
    const t = Store.saveTask({
      title: 'Precious assignment',
      description: 'Detailed instructions',
      dueDate: '2025-06-10',
      time: '14:00',
      priority: 'high',
      tags: ['important'],
      classId: null,
      assignmentType: 'homework',
      subtasks: [{ title: 'Step one', done: true }],
      sessions: [{ date: '2025-06-09', time: '16:00', durationMin: 45, objective: 'Draft it' }]
    });
    Store.deleteTask(t.id);
    const res = Store.restoreTrash(Store.get().trash[0].id);
    expect(res).toBeTruthy();
    expect(res.type).toBe('task');
    const restored = Store.getTask(t.id);
    expect(restored).toBeTruthy();
    expect(restored.title).toBe('Precious assignment');
    expect(restored.description).toBe('Detailed instructions');
    expect(restored.dueDate).toBe('2025-06-10');
    expect(restored.time).toBe('14:00');
    expect(restored.priority).toBe('high');
    expect(restored.tags).toEqual(['important']);
    expect(restored.assignmentType).toBe('homework');
    expect(restored.subtasks.length).toBe(1);
    expect(restored.subtasks[0].done).toBe(true);
    expect(restored.sessions.length).toBe(1);
    expect(restored.sessions[0].objective).toBe('Draft it');
  });

  it('trash restoration works for projects, goals, notes, categories, classes and events', () => {
    freshStore();
    const p = Store.saveProject({ name: 'Proj', milestones: [{ title: 'M1', done: true }] });
    const g = Store.saveGoal({ name: 'Goal' });
    const n = Store.saveNote({ title: 'Note', body: 'text' });
    const c = Store.saveCategory({ name: 'Cat' });
    const cls = Store.saveClass({ name: 'Math', teacher: 'X', slots: [{ day: 1, start: '08:30', end: '09:30' }] });
    const e = Store.saveEvent({ title: 'Practice', date: '2025-06-10', time: '18:00' });
    [p, g, n, c, cls, e].forEach((item, i) => {
      const type = ['project', 'goal', 'note', 'category', 'class', 'event'][i];
      if (type === 'project') Store.deleteProject(item.id);
      else if (type === 'goal') Store.deleteGoal(item.id);
      else if (type === 'note') Store.deleteNote(item.id);
      else if (type === 'category') Store.deleteCategory(item.id);
      else if (type === 'class') Store.deleteClass(item.id);
      else Store.deleteEvent(item.id);
    });
    expect(Store.get().trash.length).toBe(6);
    while (Store.get().trash.length) Store.restoreTrash(Store.get().trash[0].id);
    expect(Store.getProject(p.id).name).toBe('Proj');
    expect(Store.getProject(p.id).milestones[0].done).toBe(true);
    expect(Store.getGoal(g.id).name).toBe('Goal');
    expect(Store.get().notes.find(x => x.id === n.id).body).toBe('text');
    expect(Store.get().categories.find(x => x.id === c.id).name).toBe('Cat');
    expect(Store.getClass(cls.id).slots.length).toBe(1);
    expect(Store.getEvent(e.id).date).toBe('2025-06-10');
  });

  it('setTaskStatus drives kanban transitions and completion logging', () => {
    freshStore();
    const t = Store.saveTask({ title: 'Flow' });
    Store.setTaskStatus(t.id, 'in-progress');
    expect(Store.getTask(t.id).status).toBe('in-progress');
    Store.setTaskStatus(t.id, 'completed');
    expect(Store.getTask(t.id).completedAt).toBeTruthy();
    expect(Store.get().activity.some(a => a.type === 'completed')).toBe(true);
  });

  it('project progress blends milestones and linked tasks', () => {
    freshStore();
    const p = Store.saveProject({ name: 'P', milestones: [{ title: 'M1', done: true }, { title: 'M2', done: false }] });
    const t1 = Store.saveTask({ title: 'T1', projectId: p.id });
    Store.saveTask({ title: 'T2', projectId: p.id, status: 'completed' });
    Store.toggleTask(t1.id);
    expect(Store.projectProgress(Store.getProject(p.id))).toBe(75);
  });
});

describe('settings persistence and legacy time migration', () => {
  it('preserves dailyLoadLimit when loading saved settings', () => {
    const st = S.normalize({ settings: { dailyLoadLimit: 240 } });
    expect(st.settings.dailyLoadLimit).toBe(240);
  });

  it('clamps dailyLoadLimit to a sane range and defaults to 180', () => {
    expect(S.normalize({ settings: { dailyLoadLimit: 9999 } }).settings.dailyLoadLimit).toBe(720);
    expect(S.normalize({ settings: { dailyLoadLimit: 1 } }).settings.dailyLoadLimit).toBe(15);
    expect(S.normalize({}).settings.dailyLoadLimit).toBe(180);
  });

  it('migrates legacy actualMin into manualMin without double-counting done sessions', () => {
    const t = S.normalizeTask({ title: 'Legacy', actualMin: 100, sessions: [{ date: '2025-06-05', durationMin: 40, done: true }] });
    expect(t.manualMin).toBe(60);
    expect(t.actualMin).toBe(100);
  });
});

describe('auto theme setting', () => {
  it('persists the auto theme choice and rejects garbage values', () => {
    expect(S.normalize({ settings: { theme: 'auto' } }).settings.theme).toBe('auto');
    expect(S.normalize({ settings: { theme: 'blue' } }).settings.theme).toBe('auto');
    expect(S.normalize({ settings: { theme: 'blue' } }, { settings: { theme: 'dark' } }).settings.theme).toBe('dark');
  });
});
