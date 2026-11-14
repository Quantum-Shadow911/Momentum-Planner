import { describe, it, expect } from 'vitest';
import './setup.js';

const P = globalThis.Priority;
const S = globalThis.Storage;

function makeState(tasks) {
  const base = S.emptyState();
  base.categories.push({ id: 'c1', name: 'School', color: '#3b82f6', icon: '📚' });
  base.tasks = tasks.map(t => S.normalizeTask(t));
  return base;
}

describe('priority scoring', () => {
  it('overdue tasks outrank everything else', () => {
    const state = makeState([
      { id: 'a', title: 'Overdue urgent', dueDate: '2025-01-01', priority: 'low' },
      { id: 'b', title: 'Future urgent', dueDate: '2099-01-01', priority: 'urgent' }
    ]);
    expect(P.score(state.tasks[0], state, '2025-06-01')).toBeGreaterThan(P.score(state.tasks[1], state, '2025-06-01'));
  });

  it('completed and blocked tasks are never recommended', () => {
    const state = makeState([
      { id: 'done', title: 'Done', status: 'completed', dueDate: '2025-01-01' },
      { id: 'blocker', title: 'Blocker', status: 'not-started' },
      { id: 'blocked', title: 'Blocked', dependsOn: ['blocker'] }
    ]);
    expect(P.score(state.tasks[0], state, '2025-06-01')).toBe(-Infinity);
    expect(P.score(state.tasks[2], state, '2025-06-01')).toBe(-Infinity);
    expect(P.isBlocked(state.tasks[2], state)).toBe(true);
  });

  it('recommended picks the overdue task and explains why', () => {
    const state = makeState([
      { id: 'x', title: 'Chill someday task', priority: 'low' },
      { id: 'y', title: 'Overdue essay', dueDate: '2025-05-30', priority: 'medium' }
    ]);
    const reco = P.recommended(state, {});
    expect(reco.task.id).toBe('y');
    expect(reco.why).toContain('overdue');
  });

  it('blocked tasks are skipped by recommended()', () => {
    const state = makeState([
      { id: 'dep', title: 'Dependency', dueDate: '2099-01-01' },
      { id: 'real', title: 'Real work', dueDate: '2099-01-02', dependsOn: ['dep'] }
    ]);
    const reco = P.recommended(state, {});
    expect(reco.task.id).toBe('dep');
  });

  it('in-progress gets a boost over identical not-started work', () => {
    const state = makeState([
      { id: 'a', title: 'A', dueDate: '2099-01-01' },
      { id: 'b', title: 'B', dueDate: '2099-01-01', status: 'in-progress' }
    ]);
    expect(P.score(state.tasks[1], state, '2025-06-01')).toBeGreaterThan(P.score(state.tasks[0], state, '2025-06-01'));
  });
});

describe('selectors & stats', () => {
  const state = makeState([
    { id: '1', title: 'Overdue', dueDate: '2025-06-01', priority: 'high' },
    { id: '2', title: 'Today', dueDate: '2025-06-05', time: '09:00' },
    { id: '3', title: 'Today later', dueDate: '2025-06-05', time: '10:00' },
    { id: '4', title: 'Future', dueDate: '2025-06-20' },
    { id: '5', title: 'Done', status: 'completed', dueDate: '2025-06-04', completedAt: '2025-06-04T10:00:00.000Z' },
    { id: '6', title: 'Undated' }
  ]);

  it('overdueTasks finds only open overdue work', () => {
    const od = P.overdueTasks(state, '2025-06-05');
    expect(od.map(t => t.id)).toEqual(['1']);
  });

  it('allOn returns tasks for a date sorted by time', () => {
    const items = P.allOn(state, '2025-06-05');
    expect(items.map(t => t.id)).toEqual(['2', '3']);
  });

  it('upcoming includes today and later, excluding completed tasks', () => {
    const up = P.upcoming(state, 7, '2025-06-05');
    expect(up.map(t => t.id)).toEqual(['2', '3']);
  });

  it('stats computes counts from real data', () => {
    const st = P.stats(state, '2025-06-05');
    expect(st.total).toBe(6);
    expect(st.open).toBe(5);
    expect(st.completed).toBe(1);
    expect(st.overdue).toBe(1);
    expect(st.dueToday).toBe(2);
    expect(st.completionPct).toBe(17);
  });
});
