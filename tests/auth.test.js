/* Auth: local profiles, lock screen, per-profile data isolation. */
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';

const fs = await import('node:fs');
const html = await fs.promises.readFile(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });

globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;

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
await import('../js/auth.js');
globalThis.Auth = dom.window.Auth;
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
await import('../js/views/tasks.js');
await import('../js/views/dates.js');
await import('../js/views/daily.js');
await import('../js/views/monthly.js');
await import('../js/views/agenda.js');
await import('../js/views/analytics.js');
await import('../js/views/settings.js');
for (const k of ['Utils', 'H', 'Storage', 'Store', 'Priority', 'Planner', 'Timer', 'Charts', 'Reminders', 'UI', 'Views']) {
  globalThis[k] = dom.window[k];
}
await import('../js/app.js');
const App = dom.window.App;
const Auth = dom.window.Auth;
const Storage = dom.window.Storage;
const Store = dom.window.Store;

describe('auth data layer', () => {
  it('hash is stable and salt-dependent', () => {
    expect(Auth.hash('abc', 'salt1')).toBe(Auth.hash('abc', 'salt1'));
    expect(Auth.hash('abc', 'salt1')).not.toBe(Auth.hash('abc', 'salt2'));
    expect(Auth.hash('abc', 'salt1')).not.toBe(Auth.hash('abd', 'salt1'));
  });

  it('creates profiles with validation and duplicate rejection', () => {
    expect(Auth.createProfile('', null, null).error).toBeTruthy();
    expect(Auth.createProfile('Advait', '🙂', 'abc').error).toContain('at least 4');
    const res = Auth.createProfile('Advait', '🙂', '1234');
    expect(res.profile).toBeTruthy();
    expect(res.profile.passHash).toBeTruthy();
    expect(Auth.createProfile('advait', null, null).error).toContain('already exists');
    const nopw = Auth.createProfile('Open Profile', '🐱', '');
    expect(nopw.profile.passHash).toBeNull();
  });

  it('login requires the correct password and records the session', () => {
    const prof = Auth.profiles().find(p => p.name === 'Advait');
    expect(Auth.login(prof.id, 'wrong')).toBe(false);
    expect(Auth.sessionProfile()).toBeNull();
    expect(Auth.login(prof.id, '1234')).toBe(true);
    expect(Auth.sessionProfile().id).toBe(prof.id);
    const open = Auth.profiles().find(p => p.name === 'Open Profile');
    expect(Auth.login(open.id, '')).toBe(true);
  });

  it('setPassword verifies the current password', () => {
    const prof = Auth.profiles().find(p => p.name === 'Advait');
    expect(Auth.setPassword(prof.id, 'nope', '5678').error).toContain('incorrect');
    expect(Auth.setPassword(prof.id, '1234', '5678').ok).toBe(true);
    expect(Auth.login(prof.id, '1234')).toBe(false);
    expect(Auth.login(prof.id, '5678')).toBe(true);
    expect(Auth.setPassword(prof.id, '5678', '').ok).toBe(true);
    expect(Auth.login(prof.id, '')).toBe(true);
  });

  it('deleteProfile requires typing the name and removes profile data', () => {
    const prof = Auth.createProfile('Temp Person', '🚀', '1234').profile;
    Storage.setProfile(prof.id);
    Storage.save(Store.get() ? Storage.emptyState() : null);
    expect(Auth.deleteProfile(prof.id, 'wrong').error).toBeTruthy();
    expect(Auth.deleteProfile(prof.id, 'temp person').ok).toBe(true);
    expect(Auth.profiles().some(p => p.id === prof.id)).toBe(false);
    expect(dom.window.localStorage.getItem('momentum.data.v1.' + prof.id)).toBeNull();
  });

  it('migrateLegacy moves pre-login data into the first profile', () => {
    dom.window.localStorage.setItem('momentum.data.v1', JSON.stringify({ tasks: [{ id: 't1', title: 'Old task' }] }));
    expect(Auth.hasLegacy()).toBe(true);
    const prof = Auth.createProfile('Migree', null, '').profile;
    expect(Auth.migrateLegacy(prof.id)).toBe(true);
    expect(Auth.hasLegacy()).toBe(false);
    expect(JSON.parse(dom.window.localStorage.getItem('momentum.data.v1.' + prof.id)).tasks[0].title).toBe('Old task');
  });
});

describe('lock screen and app start', () => {
  it('boots to the lock screen when nobody is logged in', () => {
    expect(document.getElementById('loginRoot')).toBeTruthy();
    expect(document.getElementById('app').style.display).toBe('none');
    expect(document.getElementById('loginProfiles').textContent).toContain('Add person');
  });

  it('startApp loads that profile\'s empty planner and seeds it; profiles are isolated', () => {
    const prof = Auth.profiles().find(p => p.name === 'Advait');
    App.startApp(prof.id);
    expect(document.getElementById('loginRoot')).toBeNull();
    expect(document.getElementById('app').style.display).toBe('');
    expect(Storage.key()).toBe('momentum.data.v1.' + prof.id);
    expect(Store.get().classes.length).toBe(7);
    expect(document.getElementById('profileChip').textContent).toContain('Advait');
    expect(document.getElementById('lockBtn').style.display).toBe('');

    Store.saveTask({ title: 'Advait private task', dueDate: Utils.todayStr() });

    const other = Auth.profiles().find(p => p.name === 'Open Profile');
    Auth.login(other.id, '');
    App.startApp(other.id);
    expect(Storage.key()).toBe('momentum.data.v1.' + other.id);
    expect(Store.get().tasks.some(t => t.title === 'Advait private task')).toBe(false);

    Auth.login(prof.id, '');
    App.startApp(prof.id);
    expect(Store.get().tasks.some(t => t.title === 'Advait private task')).toBe(true);
    Store.deleteTask(Store.get().tasks.find(t => t.title === 'Advait private task').id);
  });
});
