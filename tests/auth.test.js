/* Auth: local accounts (name + username + email + password), lock screen, per-account data isolation. */
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

const acct = (over) => Object.assign({ name: 'Alex', username: 'alex', email: 'alex@example.com', icon: '🙂', password: '1234' }, over);

describe('account data layer', () => {
  it('hash is stable and salt-dependent', () => {
    expect(Auth.hash('abc', 'salt1')).toBe(Auth.hash('abc', 'salt1'));
    expect(Auth.hash('abc', 'salt1')).not.toBe(Auth.hash('abc', 'salt2'));
    expect(Auth.hash('abc', 'salt1')).not.toBe(Auth.hash('abd', 'salt1'));
  });

  it('validates every sign-up field', () => {
    expect(Auth.createProfile(acct({ name: '' })).error).toContain('name');
    expect(Auth.createProfile(acct({ username: 'ab' })).error).toContain('Usernames');
    expect(Auth.createProfile(acct({ username: 'bad name!' })).error).toContain('Usernames');
    expect(Auth.createProfile(acct({ email: 'not-an-email' })).error).toContain('email');
    expect(Auth.createProfile(acct({ email: '' })).error).toContain('email');
    expect(Auth.createProfile(acct({ password: 'abc' })).error).toContain('at least 4');
  });

  it('creates an account and rejects duplicate usernames and emails', () => {
    const res = Auth.createProfile(acct());
    expect(res.profile).toBeTruthy();
    expect(res.profile.username).toBe('alex');
    expect(res.profile.email).toBe('alex@example.com');
    expect(res.profile.passHash).toBeTruthy();
    const list = JSON.parse(dom.window.localStorage.getItem(Auth.PROFILES_KEY));
    delete list.find(p => p.id === res.profile.id).fresh;
    list.find(p => p.id === res.profile.id).keepSample = true;
    dom.window.localStorage.setItem(Auth.PROFILES_KEY, JSON.stringify(list));
    expect(Auth.createProfile(acct({ name: 'Other', email: 'other@example.com' })).error).toContain('taken');
    expect(Auth.createProfile(acct({ name: 'Other', username: 'alex2' })).error).toContain('already used');
    expect(Auth.createProfile(acct({ name: 'Other', username: 'ALEX', email: 'o2@example.com' })).error).toContain('taken');
  });

  it('signs in with username, email or legacy display name; rejects wrong passwords', () => {
    expect(Auth.login('alex', 'wrong')).toBe(false);
    expect(Auth.sessionProfile()).toBeNull();
    expect(Auth.login('alex', '1234')).toBe(true);
    expect(Auth.sessionProfile().username).toBe('alex');
    Auth.logout();
    expect(Auth.login('alex@example.com', '1234')).toBe(true);
    Auth.logout();
    expect(Auth.login('Alex', '1234')).toBe(true);
    Auth.logout();
    expect(Auth.login('ghost', '1234')).toBe(false);
  });

  it('completes or edits account details with validation', () => {
    expect(Auth.login('alex', '1234')).toBe(true);
    const prof = Auth.sessionProfile();
    expect(Auth.completeProfile(prof.id, 'x', 'x@y.com').error).toContain('Usernames');
    expect(Auth.completeProfile(prof.id, 'alex.new', 'bad').error).toContain('email');
    expect(Auth.completeProfile(prof.id, 'alex.new', 'alex.new@example.com').ok).toBe(true);
    expect(Auth.findAccount('alex.new@example.com').id).toBe(prof.id);
    expect(Auth.completeProfile(prof.id, 'alex', 'alex@example.com').ok).toBe(true);
  });

  it('setPassword verifies the current password', () => {
    expect(Auth.login('alex', '1234')).toBe(true);
    const prof = Auth.sessionProfile();
    expect(Auth.setPassword(prof.id, 'nope', '5678').error).toContain('incorrect');
    expect(Auth.setPassword(prof.id, '1234', 'ab').error).toContain('at least 4');
    expect(Auth.setPassword(prof.id, '1234', '5678').ok).toBe(true);
    expect(Auth.login('alex', '1234')).toBe(false);
    expect(Auth.login('alex', '5678')).toBe(true);
  });

  it('deleteAccount requires typing the name and removes account data', () => {
    const prof = Auth.createProfile(acct({ name: 'Temp Person', username: 'temp', email: 'temp@example.com' })).profile;
    Storage.setProfile(prof.id);
    Storage.save(Storage.emptyState());
    expect(Auth.deleteProfile(prof.id, 'wrong').error).toBeTruthy();
    expect(Auth.deleteProfile(prof.id, 'temp person').ok).toBe(true);
    expect(Auth.profiles().some(p => p.id === prof.id)).toBe(false);
    expect(dom.window.localStorage.getItem('momentum.data.v1.' + prof.id)).toBeNull();
  });

  it('only accounts explicitly marked as the owner keep the sample classes', () => {
    const prof = Auth.createProfile(acct({ name: 'Advait Anand', username: 'advait', email: 'advait@example.com' })).profile;
    Auth.markKeepSample(prof.id);
    Storage.setProfile(prof.id);
    App.startApp(prof.id);
    expect(Store.get().classes.length).toBe(7);
    expect(Store.get().classes[0].teacher).toContain('Khichadia');
    Auth.logout();
    App.boot();
  });

  it('the name alone never grants sample data, even for the owner\'s name', () => {
    const prof = Auth.createProfile(acct({ name: 'Advait Anand', username: 'advait2', email: 'advait2@example.com' })).profile;
    Storage.setProfile(prof.id);
    App.startApp(prof.id);
    expect(Store.get().classes.length).toBe(0);
    expect(Store.get().tasks.length).toBe(0);
    Auth.logout();
    App.boot();
  });

  it('other accounts start completely fresh and sample data never comes back', () => {
    const prof = Auth.createProfile(acct({ name: 'Other Kid', username: 'otherkid', email: 'ok@example.com' })).profile;
    Storage.setProfile(prof.id);
    App.startApp(prof.id);
    expect(Store.get().classes.length).toBe(0);
    Store.saveTask({ title: 'My own task' });
    App.startApp(prof.id);
    expect(Store.get().classes.length).toBe(0);
    expect(Store.get().tasks.some(t => t.title === 'My own task')).toBe(true);
    Auth.logout();
    App.boot();
  });

  it('accounts created before fresh-mode lose the untouched sample data on login', () => {
    const prof = Auth.createProfile(acct({ name: 'Older Account', username: 'older', email: 'older@example.com' })).profile;
    const list = JSON.parse(dom.window.localStorage.getItem(Auth.PROFILES_KEY));
    delete list.find(p => p.id === prof.id).fresh;
    dom.window.localStorage.setItem(Auth.PROFILES_KEY, JSON.stringify(list));
    Storage.setProfile(prof.id);
    Store.replaceState(Storage.emptyState());
    App.loadSampleData();
    Store.persist();
    App.startApp(prof.id);
    expect(Store.get().classes.length).toBe(0);
    expect(Store.get().breaks.length).toBe(0);
    Auth.logout();
    App.boot();
  });

  it('new accounts start completely fresh (no sample classes or tasks)', () => {
    const prof = Auth.createProfile(acct({ name: 'Fresh Person', username: 'fresh', email: 'fresh@example.com' })).profile;
    expect(prof.fresh).toBe(true);
    Storage.setProfile(prof.id);
    App.startApp(prof.id);
    expect(Store.get().classes.length).toBe(0);
    expect(Store.get().tasks.length).toBe(0);
    expect(Store.get().events.length).toBe(0);
    expect(Store.get().breaks.length).toBe(0);
    Auth.logout();
    App.boot();
  });

  it('migrateLegacy moves pre-login data into the first account created', () => {
    dom.window.localStorage.setItem('momentum.data.v1', JSON.stringify({ tasks: [{ id: 't1', title: 'Old task' }] }));
    expect(Auth.hasLegacy()).toBe(true);
    const prof = Auth.createProfile(acct({ name: 'Migree', username: 'migree', email: 'm@example.com' })).profile;
    expect(Auth.migrateLegacy(prof.id)).toBe(true);
    expect(Auth.hasLegacy()).toBe(false);
    expect(JSON.parse(dom.window.localStorage.getItem('momentum.data.v1.' + prof.id)).tasks[0].title).toBe('Old task');
  });
});

describe('lock screen and app start', () => {
  it('boots to a real sign-in form when nobody is logged in', () => {
    expect(document.getElementById('loginRoot')).toBeTruthy();
    expect(document.getElementById('app').style.display).toBe('none');
    expect(document.getElementById('loginRoot').textContent).toContain('Sign in');
    expect(document.getElementById('liUser')).toBeTruthy();
    expect(document.getElementById('liPw')).toBeTruthy();
    expect(document.getElementById('toSignUp')).toBeTruthy();
  });

  it('rejects bad credentials inline, then signs in through the form', () => {
    document.getElementById('liUser').value = 'alex';
    document.getElementById('liPw').value = 'wrong';
    document.getElementById('liGo').click();
    expect(document.getElementById('loginErr').textContent).toContain('Wrong');
    document.getElementById('liPw').value = '5678';
    document.getElementById('liGo').click();
    expect(document.getElementById('loginRoot')).toBeNull();
    expect(document.getElementById('app').style.display).toBe('');
    expect(Storage.key()).toBe('momentum.data.v1.' + Auth.sessionProfile().id);
    expect(Store.get().classes.length).toBe(7);
    expect(document.getElementById('profileChip').textContent).toContain('Alex');
    expect(document.getElementById('lockBtn').style.display).toBe('');
  });

  it('creates an account through the sign-up form and isolates per-account data', () => {
    Store.saveTask({ title: 'Alex private task', dueDate: Utils.todayStr() });
    document.getElementById('lockBtn').click();
    expect(document.getElementById('loginRoot')).toBeTruthy();
    document.getElementById('toSignUp').click();
    document.getElementById('suName').value = 'Sam';
    document.getElementById('suUser').value = 'sam';
    document.getElementById('suEmail').value = 'sam@example.com';
    document.getElementById('suPw').value = '9999';
    document.getElementById('suPw2').value = '9999';
    document.getElementById('suGo').click();
    expect(document.getElementById('loginRoot')).toBeNull();
    expect(Storage.key()).toBe('momentum.data.v1.' + Auth.sessionProfile().id);
    expect(Store.get().tasks.some(t => t.title === 'Alex private task')).toBe(false);

    Auth.logout();
    Auth.login('alex', '5678');
    App.startApp(Auth.sessionProfile().id);
    expect(Store.get().tasks.some(t => t.title === 'Alex private task')).toBe(true);
    Store.deleteTask(Store.get().tasks.find(t => t.title === 'Alex private task').id);
  });

  it('signing in with no accounts on the device explains how to create one', () => {
    dom.window.localStorage.removeItem('momentum.profiles.v1');
    dom.window.localStorage.removeItem('momentum.session.v1');
    App.boot();
    document.getElementById('liUser').value = 'advait';
    document.getElementById('liPw').value = '1234';
    document.getElementById('liGo').click();
    expect(document.getElementById('loginErr').textContent).toContain('No accounts exist on this device yet');
    expect(document.getElementById('toSignUp')).toBeTruthy();
  });
});

describe('password recovery (forgot password)', () => {
  it('stores the recovery question with a hashed answer at sign-up', () => {
    const res = Auth.createProfile(acct({ name: 'Recy', username: 'recy', email: 'recy@example.com', password: 'pass1', recoveryQ: "What is your pet's name?", recoveryA: '  Rex  ' }));
    expect(res.error).toBeUndefined();
    const p = Auth.profiles().find(x => x.username === 'recy');
    expect(p.recoveryQ).toBe("What is your pet's name?");
    expect(p.recoveryAHash).toBeTruthy();
    expect(p.recoverySalt).toBeTruthy();
    expect(JSON.stringify(p)).not.toContain('Rex');
  });

  it('recoveryInfo reports account + question state', () => {
    const info = Auth.recoveryInfo('recy');
    expect(info.found).toBe(true);
    expect(info.hasPassword).toBe(true);
    expect(info.hasQuestion).toBe(true);
    expect(info.question).toContain('pet');
    expect(Auth.recoveryInfo('nobody-here').found).toBe(false);
  });

  it('resetPassword: wrong answer rejected, right answer (any case/spacing) resets and logs in', () => {
    expect(Auth.resetPassword('recy', 'cat', 'newpass').error).toContain('not correct');
    expect(Auth.resetPassword('recy', '   REX  ', 'newpass').ok).toBe(true);
    expect(Auth.login('recy', 'newpass')).toBe(true);
    expect(Auth.login('recy', 'pass1')).toBe(false);
    Auth.logout();
  });

  it('recovery still works after the password was reset (independent salt)', () => {
    expect(Auth.resetPassword('recy', 'rex', 'newpass2').ok).toBe(true);
    expect(Auth.login('recy', 'newpass2')).toBe(true);
    Auth.logout();
  });

  it('email-confirmation fallback works for accounts without a question', () => {
    const res = Auth.createProfile(acct({ name: 'Norec', username: 'norec', email: 'norec@example.com', password: 'pass1' }));
    expect(res.error).toBeUndefined();
    expect(Auth.recoveryInfo('norec').hasQuestion).toBe(false);
    expect(Auth.resetPassword('norec', '', 'brandnew', 'wrong@example.com').error).toContain('email');
    expect(Auth.resetPassword('norec', '', 'brandnew', ' NOREC@example.com ').ok).toBe(true);
    expect(Auth.login('norec', 'brandnew')).toBe(true);
    Auth.logout();
  });

  it('setRecovery adds or updates a question (used by Settings)', () => {
    const p = Auth.profiles().find(x => x.username === 'norec');
    expect(Auth.setRecovery(p.id, 'What is my locker number?', '  4 2  ').ok).toBe(true);
    expect(Auth.recoveryInfo('norec').question).toBe('What is my locker number?');
    expect(Auth.resetPassword('norec', '4 2', 'another1').ok).toBe(true);
    expect(Auth.login('norec', 'another1')).toBe(true);
    Auth.logout();
  });

  it('forgot-password UI flow: unknown account error, then question, then reset signs you in', () => {
    Auth.logout();
    App.boot();
    expect(document.getElementById('toRecovery')).toBeTruthy();
    document.getElementById('toRecovery').click();
    document.getElementById('rcId').value = 'ghost';
    document.getElementById('rcGo').click();
    expect(document.getElementById('rcErr').textContent).toContain('No account found');
    document.getElementById('rcId').value = 'recy';
    document.getElementById('rcGo').click();
    expect(document.getElementById('rcAns')).toBeTruthy();
    expect(document.getElementById('rcNew')).toBeTruthy();
    expect(document.getElementById('rcReset').textContent).toContain('Reset password');
    document.getElementById('rcAns').value = 'rex';
    document.getElementById('rcNew').value = 'final123';
    document.getElementById('rcNew2').value = 'final123';
    document.getElementById('rcReset').click();
    expect(document.getElementById('loginRoot')).toBeNull();
    expect(document.getElementById('app').style.display).not.toBe('none');
    Auth.logout();
    App.boot();
    expect(document.getElementById('loginRoot')).toBeTruthy();
    expect(document.getElementById('liGo')).toBeTruthy();
  });
});
