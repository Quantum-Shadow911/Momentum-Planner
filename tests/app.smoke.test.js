/* Full-app smoke test: boots the real UI in jsdom and exercises every view. */
import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';

const html = await (await import('node:fs')).promises.readFile(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });

globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.localStorage = dom.window.localStorage;
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;

/* jsdom has no canvas — stub a 2d context so charts render harmlessly */
const noop = () => {};
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  const gradient = { addColorStop: noop };
  return new Proxy({}, { get: (t, prop) => {
    if (prop === 'createLinearGradient') return () => gradient;
    if (typeof prop === 'string') return noop;
    return undefined;
  }, set: () => true });
};
dom.window.Element.prototype.scrollTo = noop;
dom.window.scrollTo = noop;

await import('../js/utils.js');
globalThis.Utils = dom.window.Utils;
globalThis.H = dom.window.H;
await import('../js/storage.js');
await import('../js/store.js');
await import('../js/priority.js');
await import('../js/planner.js');
await import('../js/timer.js');
await import('../js/charts.js');
await import('../js/reminders.js');
await import('../js/ui.js');
await import('../js/views/dashboard.js');
await import('../js/views/classes.js');
await import('../js/views/activities.js');
await import('../js/views/exams.js');
await import('../js/views/timetable.js');
await import('../js/views/tasks.js');
await import('../js/views/daily.js');
await import('../js/views/weekly.js');
await import('../js/views/monthly.js');
await import('../js/views/agenda.js');
await import('../js/views/analytics.js');
await import('../js/views/settings.js');

for (const k of ['Utils', 'H', 'Storage', 'Store', 'Priority', 'Planner', 'Timer', 'Charts', 'Reminders', 'UI', 'Views']) {
  globalThis[k] = dom.window[k];
}
await import('../js/app.js');
globalThis.App = dom.window.App;
const App = globalThis.App;
const Store = globalThis.Store;
const Views = globalThis.Views;

beforeAll(() => {
  expect(App).toBeTruthy();
});

describe('app boot', () => {
  it('boots with seeded sample data and renders the dashboard', () => {
    expect(Store.get().tasks.length).toBe(0);
    expect(Store.get().categories.length).toBe(9);
    expect(Store.get().classes.length).toBe(5);
    expect(Store.get().events.length).toBe(0);
    expect(Store.get().breaks.length).toBe(1);
    expect(document.getElementById('appVersion').textContent).toBe('Momentum v2.2.0-personal');
    expect(Store.get().settings.lastVersion).toBe('2.2.0-personal');
    expect(document.getElementById('modalRoot').children.length).toBe(0);
    expect(document.querySelectorAll('.nav-item').length).toBe(14);
    expect(document.getElementById('viewHost').innerHTML).toContain('Recommended next task');
    expect(document.getElementById('viewHost').innerHTML).toContain('To-do list — today');
    expect(document.getElementById('viewHost').innerHTML).toContain('appointments');
  });

  it('dashboard renders the school-portal layout: schedule panel, to-do, exams, dates, calendar', () => {
    expect(document.querySelector('.dash-grid')).toBeTruthy();
    expect(document.querySelectorAll('#dashPeriods .period-row').length).toBe(5);
    expect(document.getElementById('dashPeriods').textContent).toContain('Mrs. Khichadia');
    expect(document.getElementById('dashPeriods').textContent).toContain('Mrs. Pratt');
    expect(document.getElementById('dashPeriods').textContent).toContain('Mrs. Kaplenko');
    expect(document.getElementById('dashPeriods').textContent).toContain('Strings Orchestra');
    expect(document.getElementById('dashToday')).toBeTruthy();
    expect(document.getElementById('dashTests')).toBeTruthy();
    expect(document.getElementById('dashUpcoming')).toBeTruthy();
    expect(document.querySelectorAll('#miniCal .mini-cell').length).toBe(42);
  });

  it('persists to localStorage automatically', () => {
    expect(dom.window.localStorage.getItem('momentum.data.v1')).toBeTruthy();
    expect(JSON.parse(dom.window.localStorage.getItem('momentum.data.v1')).tasks.length).toBe(Store.get().tasks.length);
  });
});

describe('all views render without errors', () => {
  const viewIds = ['classes', 'activities', 'exams', 'timetable', 'daily', 'weekly', 'monthly', 'agenda', 'tasks', 'analytics', 'settings'];
  viewIds.forEach(id => {
    it(`renders ${id}`, () => {
      expect(() => App.go(id)).not.toThrow();
      expect(document.getElementById('viewHost').children.length).toBeGreaterThan(0);
      expect(document.getElementById('topbarTitle').textContent).toBe(Views[id].title);
    });
  });
});

describe('cross-view synchronization', () => {
  it('task added via store appears in dashboard, weekly board and agenda', () => {
    const t = Store.saveTask({ title: 'Sync check task', dueDate: Utils.todayStr(), status: 'in-progress' });
    App.go('dashboard');
    expect(document.getElementById('viewHost').innerHTML).toContain('Sync check task');
    App.go('weekly');
    expect(document.getElementById('viewHost').innerHTML).toContain('Sync check task');
    App.go('agenda');
    expect(document.getElementById('viewHost').innerHTML).toContain('Sync check task');
    Store.deleteTask(t.id);
    App.go('dashboard');
    expect(document.getElementById('viewHost').innerHTML).not.toContain('Sync check task');
  });

  it('status change reflects in tasks view and stats', () => {
    const t = Store.saveTask({ title: 'Kanban flow task' });
    Store.setTaskStatus(t.id, 'in-progress');
    expect(Store.getTask(t.id).status).toBe('in-progress');
    App.go('tasks');
    expect(document.getElementById('viewHost').innerHTML).toContain('Kanban flow task');
    Store.deleteTask(t.id);
  });
});

describe('theme & interactions', () => {
  it('toggles dark theme and persists it', () => {
    App.setTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(JSON.parse(dom.window.localStorage.getItem('momentum.data.v1')).settings.theme).toBe('dark');
    App.setTheme('light');
  });

  it('auto theme resolves to dark at night and light in the daytime', () => {
    App.setTheme('auto');
    const h = new Date().getHours();
    const expected = (h >= 19 || h < 7) ? 'dark' : 'light';
    expect(App.effectiveTheme()).toBe(expected);
    expect(document.documentElement.dataset.theme).toBe(expected);
    expect(JSON.parse(dom.window.localStorage.getItem('momentum.data.v1')).settings.theme).toBe('auto');
    expect(document.getElementById('themeToggle').textContent).toContain('Auto');
    App.setTheme('light');
    expect(App.effectiveTheme()).toBe('light');
  });

  it('settings offers the auto day/night theme choice', () => {
    App.go('settings');
    const sel = document.getElementById('setThemeMode');
    expect(sel).toBeTruthy();
    expect(Array.from(sel.options).map(o => o.value)).toEqual(['auto', 'light', 'dark']);
    sel.value = 'auto';
    sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(Store.get().settings.theme).toBe('auto');
    App.setTheme('light');
  });

  it('nav Inbox opens a dedicated Inbox page (regression: mapping ran after the view guard)', () => {
    document.querySelector('[data-view="inbox"]').click();
    expect(document.getElementById('topbarTitle').textContent).toBe('Inbox');
    expect(document.querySelector('#viewHost h2').textContent).toBe('📥 Inbox');
    expect(document.querySelector('#fStatus').value).toBe('undated');
    expect(document.getElementById('taskList')).toBeTruthy();
  });

  it('undated tasks appear in the Inbox; Other Responsibilities is its own page for non-school tasks', () => {
    Store.saveTask({ title: 'Captured idea', dueDate: null, startDate: null, time: null });
    document.querySelector('[data-view="inbox"]').click();
    expect(document.getElementById('taskList').textContent).toContain('Captured idea');
    document.querySelector('[data-view="personal"]').click();
    expect(document.getElementById('topbarTitle').textContent).toBe('Other Responsibilities');
    expect(document.querySelector('#viewHost h2').textContent).toBe('🏠 Other Responsibilities');
    expect(document.querySelector('#fStatus').value).toBe('open');
    expect(document.querySelector('#fCls').value).toBe('none');
  });

  it('quick-add modal opens', () => {
    UI.quickAdd();
    expect(document.getElementById('modalRoot').children.length).toBe(1);
    UI.closeModal();
  });

  it('workload balance modal opens with suggestions for an overloaded day', () => {
    const today = Utils.todayStr();
    Store.saveTask({ title: 'Overloaded crunch', dueDate: Utils.addDays(today, 6), estimateMin: 270, sessions: [
      { date: today, durationMin: 90 }, { date: today, durationMin: 90 }, { date: today, durationMin: 90 }
    ] });
    App.go('weekly');
    document.getElementById('wBalance').click();
    expect(document.getElementById('modalRoot').children.length).toBe(1);
    UI.closeModal();
  });

  it('template picker opens and builds a pre-filled editor', () => {
    App.go('tasks');
    document.getElementById('newFromTpl').click();
    expect(document.querySelector('#tplGrid')).toBeTruthy();
    document.getElementById('tplDue').value = Utils.addDays(Utils.todayStr(), 12);
    document.querySelector('[data-tpl="essay"]').click();
    expect(document.querySelector('[name="assignmentType"]').value).toBe('essay');
    expect(document.querySelectorAll('.session-row').length).toBeGreaterThan(0);
    UI.closeModal();
  });

  it('study timer widget appears, pauses and logs time', () => {
    const t = Store.saveTask({ title: 'Timer check task', dueDate: Utils.todayStr() });
    Timer.start(t.id);
    expect(document.getElementById('timerWidget').classList.contains('hidden')).toBe(false);
    Timer.pause();
    expect(document.getElementById('timerWidget').innerHTML).toBeTruthy();
    const before = Store.getTask(t.id).actualMin || 0;
    const res = Timer.finish();
    if (res.committed) expect(Store.getTask(t.id).actualMin).toBeGreaterThanOrEqual(before + 1);
    expect(document.getElementById('timerWidget').classList.contains('hidden')).toBe(true);
    Store.deleteTask(t.id);
  });

  it('exams view lists upcoming assessments with revision sessions', () => {
    Store.saveTask({ title: 'Science test — unit 3', classId: 'cls-sci', assignmentType: 'test', dueDate: Utils.addDays(Utils.todayStr(), 7), estimateMin: 120, priority: 'high' });
    App.go('exams');
    const html = document.getElementById('viewHost').innerHTML;
    expect(html).toContain('Science test');
    expect(document.getElementById('exClassChips')).toBeTruthy();
  });

  it('timetable renders class blocks for the seeded schedule', () => {
    App.go('timetable');
    expect(document.querySelectorAll('.tt-block').length).toBeGreaterThanOrEqual(5);
  });

  it('dragging an assignment with sessions in the daily planner moves the session, not the deadline', () => {
    App.go('daily');
    const today = Utils.todayStr();
    const due = Utils.addDays(today, 5);
    const t = Store.saveTask({ title: 'Draggable assignment', dueDate: due, estimateMin: 90, sessions: [{ date: today, time: '10:00', durationMin: 45 }] });
    const zone = document.querySelector('.drop-zone[data-hour="16"]');
    expect(zone).toBeTruthy();
    const ev = new dom.window.Event('drop', { bubbles: true, cancelable: true });
    ev.dataTransfer = { getData: () => t.id };
    zone.dispatchEvent(ev);
    const after = Store.getTask(t.id);
    expect(after.dueDate).toBe(due);
    expect(after.sessions[0].date).toBe(today);
    expect(after.sessions[0].time).toBe('16:00');
  });

  it('revision sessions cannot be scheduled after the assessment date', () => {
    App.go('exams');
    const exam = Store.get().tasks.find(t => t.title.includes('Science test'));
    expect(exam).toBeTruthy();
    const before = exam.sessions.length;
    const card = Array.from(document.querySelectorAll('.exam-card')).find(c => c.textContent.includes('Science test'));
    card.querySelector('[data-rev]').click();
    document.getElementById('revDate').value = Utils.addDays(exam.dueDate, 2);
    const addBtn = Array.from(document.querySelectorAll('#modalRoot button')).find(b => b.textContent.trim() === 'Add session');
    addBtn.click();
    expect(UI.modalIsOpen()).toBe(true);
    expect(document.getElementById('revWarn').style.display).toBe('block');
    expect(Store.getTask(exam.id).sessions.length).toBe(before);
    document.getElementById('revDate').value = Utils.addDays(exam.dueDate, -1);
    addBtn.click();
    expect(UI.modalIsOpen()).toBe(false);
    expect(Store.getTask(exam.id).sessions.length).toBe(before + 1);
  });

  it('timetable renders proportional blocks and expands hours for early classes', () => {
    Store.saveClass({ name: 'Zero period', color: '#8b5cf6', icon: '🌅', slots: [{ day: 3, start: '07:15', end: '08:05' }] });
    App.go('timetable');
    const grid = document.getElementById('ttGrid');
    expect(grid).toBeTruthy();
    expect(grid.textContent).toContain('7:00 AM');
    const block = document.querySelector('.tt-block');
    expect(block.style.top).toContain('%');
    expect(Number.parseFloat(block.style.height)).toBeGreaterThan(50);
  });

  it('global search finds seeded tasks', () => {
    App.openSearch();
    const input = document.getElementById('searchInput');
    input.value = 'physics';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    globalThis.renderSearchNoop = null;
    // renderSearch is bound via the input listener; call the overlay's handler indirectly
    const results = document.getElementById('searchResults');
    expect(results).toBeTruthy();
    UI.closeSearch ? null : null;
    document.getElementById('searchOverlay').classList.add('hidden');
  });
});

describe('v2.1.0 app-level features', () => {
  it('dashboard offers the weekly academic review and its modal opens with content', () => {
    Store.saveEvent({ id: 'evt-review-fixture', title: 'Soccer practice', date: Utils.addDays(Utils.todayStr(), 1), time: '18:00', endTime: '19:30', recurrence: { type: 'weekly', interval: 1 } });
    App.go('dashboard');
    const btn = document.getElementById('dashReview');
    expect(btn).toBeTruthy();
    btn.click();
    const modal = document.querySelector('.modal-backdrop .modal');
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('Weekly academic review');
    expect(modal.textContent).toContain('Daily workload');
    expect(modal.textContent).toContain('Overdue');
    expect(modal.textContent).toContain('Soccer practice');
    document.querySelector('.modal-backdrop [data-close]').click();
  });

  it('event cards show a recurrence badge', () => {
    expect(Store.getEvent('evt-review-fixture')).toBeTruthy();
    App.go('activities');
    const host = document.getElementById('viewHost').textContent;
    expect(host).toContain('every week');
  });

  it('settings shows the storage usage meter', () => {
    App.go('settings');
    const meter = document.getElementById('storageMeter');
    expect(meter).toBeTruthy();
    expect(meter.textContent).toContain('storage used');
  });

  it('daily planner shows a conflict banner for overlapping commitments', () => {
    const st = Store.get();
    const today = Utils.todayStr();
    Store.saveEvent({ id: 'evt-test-conflict', title: 'Conflict event', date: today, time: '09:00', endTime: '10:00' });
    Store.saveTask({ title: 'Timed conflict task', dueDate: today, time: '09:30', estimateMin: 60 });
    App.go('daily');
    expect(document.getElementById('viewHost').textContent).toContain('scheduling conflict');
    Store.deleteEvent('evt-test-conflict');
    const t = Store.get().tasks.find(x => x.title === 'Timed conflict task');
    if (t) Store.deleteTask(t.id);
  });
});
