/* Persistence hardening: blocked storage must show a warning banner, not fail silently. */
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

/* Simulate a browser that blocks WRITES to script storage (Safari private mode:
   previously saved data can still be read, but nothing new can be written) */
const blockedCalls = [];
const backingStore = new Map();
const blockedStorage = {
  getItem(k) { return backingStore.has(k) ? backingStore.get(k) : null; },
  setItem(k) { blockedCalls.push(k); throw new Error('SecurityError: storage is blocked'); },
  removeItem(k) { backingStore.delete(k); },
  key(i) { return Array.from(backingStore.keys())[i] ?? null; },
  clear() { backingStore.clear(); },
  get length() { return backingStore.size; }
};
Object.defineProperty(dom.window, 'localStorage', { value: blockedStorage, configurable: true });
globalThis.localStorage = blockedStorage;

/* A profile was logged in before storage got blocked */
backingStore.set('momentum.profiles.v1', JSON.stringify([{ id: 'prof-test', name: 'Tester', icon: '🧪', salt: null, passHash: null, createdAt: '2026-01-01T00:00:00.000Z' }]));
backingStore.set('momentum.session.v1', JSON.stringify({ profileId: 'prof-test' }));

await import('../js/utils.js');
await import('../js/auth.js');
globalThis.Utils = dom.window.Utils;
globalThis.Auth = dom.window.Auth;
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
await import('../js/views/tasks.js');
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
const Store = dom.window.Store;
const Storage = dom.window.Storage;

describe('blocked storage', () => {
  it('probe reports storage as unavailable', () => {
    const probe = Storage.probe();
    expect(probe.ok).toBe(false);
    expect(probe.reason).toBe('blocked');
    expect(App.storageWarning().ok).toBe(false);
  });

  it('boot shows a red warning banner explaining saving is blocked', () => {
    const banner = document.getElementById('storageBanner');
    expect(banner).toBeTruthy();
    expect(banner.className).not.toContain('storage-banner-info');
    expect(banner.textContent).toContain('blocking saving');
    expect(banner.textContent).toContain('Private');
  });

  it('sidebar shows a Not saving indicator', () => {
    expect(document.getElementById('saveStatus').textContent).toContain('Not saving');
  });

  it('the app still works (no crash) when saving fails, and keeps warning', () => {
    expect(() => Store.updateSettings({ userName: 'Blocked' })).not.toThrow();
    expect(document.getElementById('saveStatus').textContent).toContain('Not saving');
    const banner = document.getElementById('storageBanner');
    expect(banner).toBeTruthy();
  });

  it('save() records the failure for the settings meter', () => {
    const ok = Storage.save(Store.get());
    expect(ok).toBe(false);
    const ls = Storage.lastSave();
    expect(ls.ok).toBe(false);
    expect(ls.at).toBeTruthy();
  });
});
