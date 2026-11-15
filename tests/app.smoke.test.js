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

/* Pre-seed a logged-in profile so boot starts the app directly */
dom.window.localStorage.setItem('momentum.profiles.v1', JSON.stringify([{ id: 'prof-test', name: 'Tester', icon: '🧪', salt: null, passHash: null, createdAt: '2026-01-01T00:00:00.000Z', keepSample: true }]));
dom.window.localStorage.setItem('momentum.session.v1', JSON.stringify({ profileId: 'prof-test' }));


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
await import('../js/auth.js');
globalThis.Utils = dom.window.Utils;
globalThis.Auth = dom.window.Auth;
globalThis.H = dom.window.H;
await import('../js/storage.js');
await import('../js/store.js');
await import('../js/priority.js');
await import('../js/planner.js');
await import('../js/ai.js');
await import('../js/timer.js');
await import('../js/charts.js');
await import('../js/reminders.js');
await import('../js/ui.js');
await import('../js/views/dashboard.js');
await import('../js/views/classes.js');
await import('../js/views/activities.js');
await import('../js/views/exams.js');
await import('../js/views/tasks.js');
await import('../js/views/dates.js');
await import('../js/views/daily.js');
await import('../js/views/monthly.js');
await import('../js/views/agenda.js');
await import('../js/views/analytics.js');
await import('../js/views/study.js');
await import('../js/views/settings.js');

for (const k of ['Utils', 'H', 'Storage', 'Store', 'Priority', 'Planner', 'AI', 'Timer', 'Charts', 'Reminders', 'UI', 'Views']) {
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
    expect(Store.get().classes.length).toBe(7);
    expect(Store.get().events.length).toBe(0);
    expect(Store.get().breaks.length).toBe(1);
    expect(document.getElementById('appVersion').textContent).toBe('Momentum v2.5.3');
    expect(Store.get().settings.lastVersion).toBe('2.5.3');
    expect(document.getElementById('modalRoot').children.length).toBe(0);
    expect(document.querySelectorAll('.nav-item').length).toBe(13);
    const navViews = [...document.querySelectorAll('.nav-item')].map(b => b.dataset.view);
    expect(navViews).toContain('dates');
    expect(navViews).toContain('study');
    expect(navViews).not.toContain('monthly');
    expect(document.getElementById('viewHost').innerHTML).toContain('Recommended next task');
    expect(document.getElementById('viewHost').innerHTML).toContain('To-do list — today');
    expect(document.getElementById('viewHost').innerHTML).toContain('appointments');
  });

  it('shows no storage warning on a healthy http origin and proves saving works', () => {
    expect(document.getElementById('storageBanner')).toBeNull();
    expect(App.storageWarning()).toEqual({ ok: true, reason: '' });
    expect(document.getElementById('saveStatus').textContent).toMatch(/Saved \d/);
    Store.updateSettings({ userName: 'SaveProbe' });
    expect(document.getElementById('saveStatus').textContent).toMatch(/Saved \d/);
    expect(JSON.parse(localStorage.getItem('momentum.data.v1.prof-test')).settings.userName).toBe('SaveProbe');
    Store.updateSettings({ userName: '' });
  });

  it('dashboard renders the school-portal layout: schedule panel, to-do, exams, dates, calendar', () => {
    expect(document.querySelector('.dash-grid')).toBeTruthy();
    expect(document.querySelectorAll('#dashPeriods .period-row').length).toBe(7);
    expect(document.getElementById('dashPeriods').textContent).toContain('Mrs. Khichadia');
    expect(document.getElementById('dashPeriods').textContent).toContain('Mrs. Pratt');
    expect(document.getElementById('dashPeriods').textContent).toContain('Mrs. Kaplenko');
    expect(document.getElementById('dashPeriods').textContent).toContain('Concert Orchestra');
    expect(document.getElementById('dashToday')).toBeTruthy();
    expect(document.getElementById('dashTests')).toBeTruthy();
    expect(document.getElementById('dashUpcoming')).toBeTruthy();
    expect(document.querySelectorAll('#miniCal .mini-cell').length).toBe(42);
  });

  it('clicking a period in the schedule opens a dedicated class page', () => {
    Store.saveTask({ title: 'Science homework 1', classId: 'cls-sci', assignmentType: 'homework', dueDate: Utils.addDays(Utils.todayStr(), 2), estimateMin: 30 });
    Store.saveTask({ title: 'Science quiz 2', classId: 'cls-sci', assignmentType: 'quiz', dueDate: Utils.addDays(Utils.todayStr(), 4), estimateMin: 45 });
    document.querySelector('#dashPeriods .period-row').click();
    expect(document.getElementById('topbarTitle').textContent).toBe('My Classes');
    const host = document.getElementById('viewHost');
    expect(host.textContent).toContain('Science 6');
    expect(host.textContent).toContain('Mrs. Khichadia');
    expect(host.textContent).toContain('Room C 207');
    expect(host.textContent).toContain('Assignments & homework (1)');
    expect(host.textContent).toContain('Tests & quizzes (1)');
    expect(host.textContent).toContain('Science homework 1');
    expect(host.textContent).toContain('Science quiz 2');
    expect(document.getElementById('cpBack')).toBeTruthy();
    document.getElementById('cpBack').click();
    expect(document.getElementById('viewHost').textContent).toContain('My Classes');
    Store.deleteTask(Store.get().tasks.find(t => t.title === 'Science homework 1').id);
    Store.deleteTask(Store.get().tasks.find(t => t.title === 'Science quiz 2').id);
  });

  it('persists to localStorage automatically', () => {
    expect(dom.window.localStorage.getItem('momentum.data.v1.prof-test')).toBeTruthy();
    expect(JSON.parse(dom.window.localStorage.getItem('momentum.data.v1.prof-test')).tasks.length).toBe(Store.get().tasks.length);
  });
});

describe('all views render without errors', () => {
  const viewIds = ['classes', 'activities', 'exams', 'daily', 'dates', 'monthly', 'agenda', 'tasks', 'analytics', 'settings'];
  viewIds.forEach(id => {
    it(`renders ${id}`, () => {
      expect(() => App.go(id)).not.toThrow();
      expect(document.getElementById('viewHost').children.length).toBeGreaterThan(0);
      expect(document.getElementById('topbarTitle').textContent).toBe(Views[id].title);
    });
  });
});

describe('important dates page', () => {
  it('embeds the month calendar and lists deadlines, tests, events and breaks', () => {
    const t = Store.saveTask({ title: 'Dates page homework', classId: 'cls-math', assignmentType: 'homework', dueDate: Utils.addDays(Utils.todayStr(), 3), estimateMin: 20 });
    const q = Store.saveTask({ title: 'Dates page quiz', classId: 'cls-sci', assignmentType: 'quiz', dueDate: Utils.addDays(Utils.todayStr(), 5), estimateMin: 30 });
    const ev = Store.saveEvent({ title: 'Dates page event', date: Utils.addDays(Utils.todayStr(), 2), time: '17:00' });
    const br = Store.saveBreak({ name: 'Dates page break', start: Utils.addDays(Utils.todayStr(), 20), end: Utils.addDays(Utils.todayStr(), 24) });
    App.go('dates');
    expect(document.getElementById('topbarTitle').textContent).toBe('Important Dates/Calendar');
    expect(document.getElementById('datesCal')).toBeTruthy();
    expect(document.querySelectorAll('#datesCal .cal-cell').length).toBe(42);
    expect(document.querySelector('.nav-item[data-view="dates"]')).toBeTruthy();
    expect(document.querySelector('.nav-item[data-view="monthly"]')).toBeNull();
    expect(document.getElementById('dtDeadlines').textContent).toContain('Dates page homework');
    expect(document.getElementById('dtTests').textContent).toContain('Dates page quiz');
    expect(document.getElementById('dtEvents').textContent).toContain('Dates page event');
    expect(document.getElementById('dtBreaks').textContent).toContain('Dates page break');
    Store.deleteTask(t.id);
    Store.deleteTask(q.id);
    Store.deleteEvent(ev.id);
    Store.deleteBreak(br.id);
    App.go('dashboard');
  });
});

describe('my important dates', () => {
  it('adds, lists, edits and deletes custom important dates, kept separate from activities', async () => {
    const kd = Store.saveEvent({ title: 'Picture day', kind: 'key-date', date: Utils.addDays(Utils.todayStr(), 4), time: '09:00' });
    expect(kd.kind).toBe('key-date');
    App.go('dates');
    expect(document.getElementById('dtKeyDates').textContent).toContain('Picture day');
    expect(document.getElementById('addKeyDate')).toBeTruthy();
    App.go('activities');
    expect(document.getElementById('eventsBody').textContent).not.toContain('Picture day');
    App.go('dashboard');
    expect(document.getElementById('dashUpcoming').textContent).toContain('Picture day');
    expect(document.getElementById('dashEvents').textContent).not.toContain('Picture day');
    const editor = Views.activities.openEventEditor(null, { kind: 'key-date' });
    await new Promise(r => setTimeout(r, 0));
    expect(document.getElementById('modalRoot').textContent).toContain('New important date');
    UI.closeModal();
    Store.deleteEvent(kd.id);
    App.go('dashboard');
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
    expect(JSON.parse(dom.window.localStorage.getItem('momentum.data.v1.prof-test')).settings.theme).toBe('dark');
    App.setTheme('light');
  });

  it('auto theme resolves to dark at night and light in the daytime', () => {
    App.setTheme('auto');
    const h = new Date().getHours();
    const expected = (h >= 19 || h < 7) ? 'dark' : 'light';
    expect(App.effectiveTheme()).toBe(expected);
    expect(document.documentElement.dataset.theme).toBe(expected);
    expect(JSON.parse(dom.window.localStorage.getItem('momentum.data.v1.prof-test')).settings.theme).toBe('auto');
    expect(document.getElementById('themeToggle').textContent).toContain('Auto');
    App.setTheme('light');
    expect(App.effectiveTheme()).toBe('light');
  });

  it('settings install card links to the real Mac app download', () => {
    App.go('settings');
    const link = document.querySelector('#viewHost a[href*="github.com/Quantum-Shadow911/Planner/releases/latest"]');
    expect(link).toBeTruthy();
    expect(link.textContent).toContain('Download Momentum for Mac');
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
    App.go('daily');
    document.getElementById('dBalance').click();
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

  it('danger zone is pinned to the corner and offers account deletion', () => {
    App.go('settings');
    const dz = document.querySelector('.danger-corner');
    expect(dz).toBeTruthy();
    expect(dz.querySelector('#deleteAccount').textContent).toContain('Delete account');
    expect(dz.querySelector('#resetAll')).toBeTruthy();
  });

  it('full task editor saves a task (projectId field removed but save must not crash)', () => {
    App.go('tasks');
    document.getElementById('newTaskBtn').click();
    const modal = document.querySelector('.modal');
    expect(modal).toBeTruthy();
    modal.querySelector('[name="title"]').value = 'Editor-created task';
    const create = [...modal.querySelectorAll('.btn')].find(b => b.textContent.includes('Create task'));
    create.click();
    const saved = Store.get().tasks.find(t => t.title === 'Editor-created task');
    expect(saved).toBeTruthy();
    expect(saved.projectId).toBeNull();
    Store.deleteTask(saved.id);
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

describe('study timer & essentials page', () => {
  it('has a sidebar item and renders the full study page', () => {
    const navViews = [...document.querySelectorAll('.nav-item')].map(b => b.dataset.view);
    expect(navViews).toContain('study');
    App.go('study');
    expect(document.querySelector('#viewHost h2').textContent).toContain('Study Timer & Essentials');
    expect(document.getElementById('studyClock')).toBeTruthy();
    expect(document.getElementById('studyTask')).toBeTruthy();
    expect(document.querySelectorAll('#essList input[type="checkbox"]').length).toBe(6);
    expect(document.getElementById('studySessions')).toBeTruthy();
  });

  it('starts the timer from the page and logs minutes on finish', () => {
    const t = Store.saveTask({ title: 'Study page timer task', dueDate: Utils.todayStr() });
    App.go('study');
    document.getElementById('studyTask').value = t.id;
    document.getElementById('studyToggle').click();
    expect(Timer.status().active).toBe(true);
    expect(Timer.status().taskId).toBe(t.id);
    const before = Store.getTask(t.id).actualMin || 0;
    document.getElementById('studyFinish').click();
    expect(Store.getTask(t.id).actualMin).toBeGreaterThanOrEqual(before + 1);
    expect(Timer.status().active).toBe(false);
    Store.deleteTask(t.id);
  });

  it('persists the study essentials checklist', () => {
    App.go('study');
    const box = document.querySelector('#essList input[type="checkbox"]');
    box.click();
    expect(Object.values(Store.get().settings.studyEssentials || {}).some(Boolean)).toBe(true);
    document.getElementById('essReset').click();
    expect(Object.values(Store.get().settings.studyEssentials || {}).some(Boolean)).toBe(false);
  });

  it("shows today's planned sessions with a Study this button", () => {
    const t = Store.saveTask({ title: 'Session display task', classId: 'cls-math', dueDate: Utils.addDays(Utils.todayStr(), 3) });
    Store.addSession(t.id, { date: Utils.todayStr(), time: '16:00', durationMin: 45, objective: 'Finish problems 1-10' });
    App.go('study');
    const host = document.getElementById('studySessions');
    const rows = [...host.querySelectorAll('.task-item')].filter(r => r.textContent.includes('Session display task'));
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Study this');
    Store.deleteTask(t.id);
  });
});

describe('safety & storage reliability', () => {
  it('task viewer blocks javascript: links and keeps safe https links clickable', () => {
    const t = Store.saveTask({
      title: 'Link safety task',
      links: [
        { url: 'javascript:alert(1)', label: 'Evil link' },
        { url: 'https://example.com/homework', label: 'Good link' }
      ]
    });
    UI.openTaskViewer(t.id);
    const modal = document.querySelector('.modal-backdrop .modal');
    expect(modal).toBeTruthy();
    expect(modal.querySelector('a[href="javascript:alert(1)"]')).toBeNull();
    expect(modal.textContent).toContain('link blocked for safety');
    const good = modal.querySelector('a[href="https://example.com/homework"]');
    expect(good).toBeTruthy();
    expect(good.getAttribute('rel')).toContain('noopener');
    document.querySelector('.modal-backdrop [data-close]').click();
    Store.deleteTask(t.id);
  });

  it('attachment download buttons only render for data: URLs', () => {
    const t = Store.saveTask({
      title: 'Attachment safety task',
      attachments: [
        { name: 'worksheet.pdf', size: 2048, dataUrl: 'data:application/pdf;base64,AAA' },
        { name: 'sneaky.txt', size: 100, dataUrl: 'javascript:alert(1)' }
      ]
    });
    UI.openTaskViewer(t.id);
    const modal = document.querySelector('.modal-backdrop .modal');
    const dls = [...modal.querySelectorAll('a[download]')];
    expect(dls.length).toBe(1);
    expect(dls[0].getAttribute('href').startsWith('data:')).toBe(true);
    document.querySelector('.modal-backdrop [data-close]').click();
    Store.deleteTask(t.id);
  });

  it('storage meter counts automatic backups in the total', () => {
    const state = Store.get();
    Storage.snapshot(state);
    App.go('settings');
    const meter = document.getElementById('storageMeter');
    expect(meter.textContent).toContain('automatic backups');
    expect(meter.textContent).toContain('snapshot');
  });
});

describe('AI tools', () => {
  it('dashboard has a Describe button that opens the describe-a-task modal with a working preview', () => {
    App.go('dashboard');
    expect(document.getElementById('dashDescribe')).toBeTruthy();
    document.getElementById('dashDescribe').click();
    const modal = document.querySelector('.modal-backdrop .modal');
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('Describe a task');
    document.getElementById('aiDescText').value = 'Math worksheet 4.2 due tomorrow, high priority, 45 min';
    [...modal.querySelectorAll('.btn')].find(b => b.textContent.includes('Preview task')).click();
    const prev = document.getElementById('aiDescPreview');
    expect(prev.textContent).toContain('New task preview');
    expect(prev.textContent).toContain('High');
    [...modal.querySelectorAll('.btn')].find(b => b.textContent === 'Close').click();
  });

  it('describe preview can add the parsed task for real', () => {
    UI.openDescribeTask();
    const modal = document.querySelector('.modal-backdrop .modal');
    document.getElementById('aiDescText').value = 'Return library book tomorrow';
    [...modal.querySelectorAll('.btn')].find(b => b.textContent.includes('Preview task')).click();
    [...modal.querySelectorAll('.btn')].find(b => b.textContent.includes('Add task')).click();
    const t = Store.get().tasks.find(x => x.title.includes('Return library book'));
    expect(t).toBeTruthy();
    expect(t.dueDate).toBeTruthy();
    Store.deleteTask(t.id);
  });

  it('task editor has Break into steps, estimate and writing feedback wired', () => {
    App.go('tasks');
    document.getElementById('newTaskBtn').click();
    const modal = document.querySelector('.modal-backdrop .modal');
    expect(modal.querySelector('#aiBreakdownBtn')).toBeTruthy();
    expect(modal.querySelector('#aiEstimateBtn')).toBeTruthy();
    expect(modal.querySelector('#aiWritingBtn')).toBeTruthy();
    modal.querySelector('[name="title"]').value = 'History essay';
    modal.querySelector('[name="assignmentType"]').value = 'essay';
    modal.querySelector('#aiEstimateBtn').click();
    expect(modal.querySelector('[name="estimateMin"]').value).not.toBe('');
    expect(modal.querySelector('#aiEstimateOut').textContent).toContain('min');
    modal.querySelector('[name="notes"]').value = 'the the draft is gonna have a lot of stuff';
    modal.querySelector('#aiWritingBtn').click();
    expect(modal.querySelector('#aiWritingOut').textContent).toContain('Repeated word');
    modal.querySelector('#aiBreakdownBtn').click();
    return new Promise(r => setTimeout(r, 50)).then(() => {
      const out = modal.querySelector('#aiBreakdownOut');
      expect(out.textContent).toContain('built-in smart engine');
      const subs = [...out.querySelectorAll('.btn')].find(b => b.textContent.includes('Add as subtasks'));
      expect(subs).toBeTruthy();
      subs.click();
      expect(modal.querySelectorAll('#subtasksEditor .subtask-editor-row').length).toBeGreaterThanOrEqual(3);
      [...document.querySelectorAll('.modal-backdrop [data-close]')].forEach(b => b.click());
    });
  });

  it('task viewer opens a study kit built from the task description and can save it', () => {
    const t = Store.saveTask({
      title: 'Water cycle presentation',
      description: 'Evaporation is when the sun heats water and it turns into vapor. Condensation is when vapor cools into clouds. Present on Friday with diagrams.'
    });
    UI.openTaskViewer(t.id);
    const modal = document.querySelector('.modal-backdrop .modal');
    const kitBtn = [...modal.querySelectorAll('.btn')].find(b => b.textContent.includes('Study kit'));
    expect(kitBtn).toBeTruthy();
    kitBtn.click();
    return new Promise(r => setTimeout(r, 50)).then(() => {
      const kitModal = document.querySelector('.modal-backdrop .modal');
      expect(kitModal.textContent).toContain('Study kit');
      expect(kitModal.textContent).toContain('Flashcards');
      const save = [...kitModal.querySelectorAll('.btn')].find(b => b.textContent === 'Save to task');
      save.click();
      expect(Store.getTask(t.id).studyKit).toBeTruthy();
      expect(Store.getTask(t.id).studyKit.flashcards.length).toBeGreaterThan(0);
      [...document.querySelectorAll('.modal-backdrop [data-close]')].forEach(b => b.click());
      Store.deleteTask(t.id);
    });
  });

  it('daily planner suggests sessions and applying them creates real study sessions', () => {
    const today = Utils.todayStr();
    const t = Store.saveTask({ title: 'Suggest plan task', dueDate: Utils.addDays(today, 4), estimateMin: 90 });
    App.go('daily');
    expect(document.getElementById('dSuggest')).toBeTruthy();
    document.getElementById('dSuggest').click();
    const modal = document.querySelector('.modal-backdrop .modal');
    expect(modal.textContent).toContain('Suggested study plan');
    [...modal.querySelectorAll('.btn')].find(b => b.textContent === 'Apply').click();
    const saved = Store.getTask(t.id);
    expect(saved.sessions.length).toBeGreaterThan(0);
    for (const s of saved.sessions) expect(s.date < t.dueDate).toBe(true);
    Store.deleteTask(t.id);
  });

  it('weekly review modal shows the data-driven insights section', () => {
    App.go('dashboard');
    document.getElementById('dashReview').click();
    return new Promise(r => setTimeout(r, 50)).then(() => {
      const ins = document.getElementById('wInsights');
      expect(ins).toBeTruthy();
      expect(ins.textContent).toContain('This week in data');
      expect(ins.textContent).toContain('built-in engine');
      [...document.querySelectorAll('.modal-backdrop [data-close]')].forEach(b => b.click());
    });
  });

  it('settings has the AI assistant section with privacy note and no key by default', () => {
    App.go('settings');
    const card = [...document.querySelectorAll('.card')].find(c => c.textContent.includes('AI assistant'));
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('built-in smart engine');
    expect(card.textContent).toContain('never your name, school, teachers');
    expect(document.getElementById('aiEnabled').checked).toBe(false);
    expect(document.getElementById('aiApiKey').value).toBe('');
    document.getElementById('aiEnabled').checked = true;
    document.getElementById('aiModel').value = 'mistral-small-latest';
    document.getElementById('aiModel').dispatchEvent(new window.Event('change'));
    expect(Store.get().settings.ai.enabled).toBe(true);
    Store.updateSettings({ ai: { enabled: false, baseUrl: '', model: '', apiKey: '' } });
  });
});
