/* Reliability: backup restore, save-first state replacement, per-account timer. */
import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';

const S = globalThis.Storage;
const Store = globalThis.Store;
const Timer = globalThis.Timer;

const realSetItem = globalThis.localStorage.setItem.bind(globalThis.localStorage);
const realRemoveItem = globalThis.localStorage.removeItem.bind(globalThis.localStorage);

function blockWrites() {
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  globalThis.localStorage.removeItem = () => { throw new Error('QuotaExceededError'); };
}
function unblockWrites() {
  globalThis.localStorage.setItem = realSetItem;
  globalThis.localStorage.removeItem = realRemoveItem;
}

beforeEach(() => {
  unblockWrites();
  globalThis.localStorage.clear();
});

describe('backup restoration', () => {
  it('restoreBackup returns false (not fake success) when saving the restored data fails', () => {
    S.setProfile('prof-restore');
    const state = S.emptyState();
    state.tasks.push(S.normalizeTask({ id: 't1', title: 'Real work' }));
    S.save(state);
    S.snapshot(state);
    expect(S.listBackups().length).toBe(1);

    blockWrites();
    const result = S.restoreBackup(S.listBackups()[0].ts);
    unblockWrites();
    expect(result).toBe(false);
  });

  it('restoreBackup returns the parsed state when saving succeeds', () => {
    S.setProfile('prof-restore2');
    const state = S.emptyState();
    state.tasks.push(S.normalizeTask({ id: 't1', title: 'Real work' }));
    S.save(state);
    S.snapshot(state);
    const result = S.restoreBackup(S.listBackups()[0].ts);
    expect(result).not.toBe(false);
    expect(result.tasks.map(t => t.title)).toContain('Real work');
  });
});

describe('replaceState is save-first', () => {
  it('a failed save leaves the in-memory state completely untouched', () => {
    S.setProfile('prof-replace');
    Store.replaceState(S.emptyState());
    Store.saveTask({ id: 'keep-me', title: 'Existing task' });
    const before = Store.get();

    blockWrites();
    const next = S.emptyState();
    next.tasks.push(S.normalizeTask({ id: 'intruder', title: 'Should not appear' }));
    const ok = Store.replaceState(next);
    unblockWrites();

    expect(ok).toBe(false);
    expect(Store.get()).toBe(before);
    expect(Store.get().tasks.some(t => t.title === 'Should not appear')).toBe(false);
    expect(Store.get().tasks.some(t => t.title === 'Existing task')).toBe(true);
  });

  it('a successful save commits the new state and returns true', () => {
    S.setProfile('prof-replace2');
    const next = S.emptyState();
    next.tasks.push(S.normalizeTask({ id: 'n1', title: 'New reality' }));
    expect(Store.replaceState(next)).toBe(true);
    expect(Store.get().tasks.map(t => t.title)).toContain('New reality');
  });
});

describe('per-account study timer', () => {
  it('a running timer belongs to one account and never leaks into another', () => {
    S.setProfile('prof-a');
    Store.replaceState(S.emptyState());
    Store.saveTask({ id: 'task-a', title: 'A work' });
    Timer.init();
    Timer.start('task-a');
    expect(Timer.status().active).toBe(true);
    expect(Timer.status().taskId).toBe('task-a');

    S.setProfile('prof-b');
    Store.replaceState(S.emptyState());
    Store.saveTask({ id: 'task-b', title: 'B work' });
    Timer.init();
    expect(Timer.status().active).toBe(false);

    S.setProfile('prof-a');
    Timer.init();
    expect(Timer.status().active).toBe(true);
    expect(Timer.status().taskId).toBe('task-a');
    Timer.cancel();
  });

  it('timer storage uses an account-specific key', () => {
    S.setProfile('prof-a');
    Store.replaceState(S.emptyState());
    Store.saveTask({ id: 'task-a', title: 'A work' });
    Timer.init();
    Timer.start('task-a');
    expect(globalThis.localStorage.getItem('momentum.timer.v1.prof-a')).toBeTruthy();
    expect(globalThis.localStorage.getItem('momentum.timer.v1.prof-b')).toBeNull();
    Timer.cancel();
  });
});
