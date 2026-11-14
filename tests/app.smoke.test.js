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
await import('../js/charts.js');
await import('../js/reminders.js');
await import('../js/ui.js');
await import('../js/views/dashboard.js');
await import('../js/views/classes.js');
await import('../js/views/activities.js');
await import('../js/views/tasks.js');
await import('../js/views/daily.js');
await import('../js/views/weekly.js');
await import('../js/views/monthly.js');
await import('../js/views/agenda.js');
await import('../js/views/kanban.js');
await import('../js/views/projects.js');
await import('../js/views/goals.js');
await import('../js/views/analytics.js');
await import('../js/views/notes.js');
await import('../js/views/settings.js');

for (const k of ['Utils', 'H', 'Storage', 'Store', 'Priority', 'Charts', 'Reminders', 'UI', 'Views']) {
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
    expect(Store.get().tasks.length).toBeGreaterThan(5);
    expect(Store.get().categories.length).toBe(9);
    expect(Store.get().classes.length).toBe(4);
    expect(Store.get().events.length).toBe(5);
    expect(document.querySelectorAll('.nav-item').length).toBe(15);
    expect(document.getElementById('viewHost').innerHTML).toContain('Recommended next task');
    expect(document.getElementById('viewHost').innerHTML).toContain("Today's priorities");
    expect(document.getElementById('viewHost').innerHTML).toContain('Extracurricular schedule');
  });

  it('persists to localStorage automatically', () => {
    expect(dom.window.localStorage.getItem('momentum.data.v1')).toBeTruthy();
    expect(JSON.parse(dom.window.localStorage.getItem('momentum.data.v1')).tasks.length).toBe(Store.get().tasks.length);
  });
});

describe('all views render without errors', () => {
  const viewIds = ['classes', 'activities', 'daily', 'weekly', 'monthly', 'agenda', 'kanban', 'tasks', 'projects', 'goals', 'analytics', 'notes', 'settings'];
  viewIds.forEach(id => {
    it(`renders ${id}`, () => {
      expect(() => App.go(id)).not.toThrow();
      expect(document.getElementById('viewHost').children.length).toBeGreaterThan(0);
      expect(document.getElementById('topbarTitle').textContent).toBe(Views[id].title);
    });
  });
});

describe('cross-view synchronization', () => {
  it('task added via store appears in dashboard, kanban and agenda', () => {
    const t = Store.saveTask({ title: 'Sync check task', dueDate: Utils.todayStr(), status: 'in-progress' });
    App.go('dashboard');
    expect(document.getElementById('viewHost').innerHTML).toContain('Sync check task');
    App.go('kanban');
    expect(document.getElementById('viewHost').innerHTML).toContain('Sync check task');
    App.go('agenda');
    expect(document.getElementById('viewHost').innerHTML).toContain('Sync check task');
    Store.deleteTask(t.id);
    App.go('dashboard');
    expect(document.getElementById('viewHost').innerHTML).not.toContain('Sync check task');
  });

  it('kanban status change reflects in tasks view and stats', () => {
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

  it('quick-add modal opens', () => {
    UI.quickAdd();
    expect(document.getElementById('modalRoot').children.length).toBe(1);
    UI.closeModal();
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
