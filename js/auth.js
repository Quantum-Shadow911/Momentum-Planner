/* Momentum — auth: local per-person profiles + lock screen.
   Data never leaves this browser; each profile gets its own storage key. */
(function (global) {
  'use strict';

  const PROFILES_KEY = 'momentum.profiles.v1';
  const SESSION_KEY = 'momentum.session.v1';
  const DATA_BASE = 'momentum.data.v1';
  const BACKUP_BASE = 'momentum.backups.v1';

  /* Salted iterated hash — casual lock-screen protection, not bank-grade security. */
  function hash(pw, salt) {
    let h1 = 0xdeadbeef ^ salt.length;
    let h2 = 0x41c6ce57 ^ String(pw).length;
    const s = salt + '::' + pw + '::' + salt;
    for (let r = 0; r < 250; r++) {
      for (let i = 0; i < s.length; i++) {
        const ch = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      const t = (h1 ^ (h1 >>> 15)) >>> 0;
      h1 = (h2 ^ (h2 >>> 13)) >>> 0;
      h2 = t;
    }
    return (h1 >>> 0).toString(36) + '.' + (h2 >>> 0).toString(36);
  }

  function loadProfiles() {
    try {
      const raw = global.localStorage.getItem(PROFILES_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function saveProfiles(list) {
    try { global.localStorage.setItem(PROFILES_KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }

  function profiles() { return loadProfiles(); }

  function sessionProfile() {
    let sid = null;
    try {
      const s = JSON.parse(global.localStorage.getItem(SESSION_KEY) || 'null');
      sid = s && s.profileId;
    } catch (e) { sid = null; }
    if (!sid) return null;
    return loadProfiles().find(p => p.id === sid) || null;
  }

  const USERNAME_RE = /^[a-zA-Z0-9._-]{3,20}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validateUsername(username, list, exceptId) {
    const u = String(username || '').trim();
    if (!u) return { error: 'Please choose a username.' };
    if (!USERNAME_RE.test(u)) return { error: 'Usernames are 3–20 characters: letters, numbers, dots, dashes or underscores.' };
    if (list.some(p => p.id !== exceptId && (p.username || '').toLowerCase() === u.toLowerCase())) return { error: 'That username is already taken.' };
    return { value: u };
  }

  function validateEmail(email, list, exceptId) {
    const e = String(email || '').trim();
    if (!e) return { error: 'Please enter an email.' };
    if (!EMAIL_RE.test(e)) return { error: 'That email doesn\u2019t look right — check for typos.' };
    if (list.some(p => p.id !== exceptId && (p.email || '').toLowerCase() === e.toLowerCase())) return { error: 'That email is already used by another account.' };
    return { value: e };
  }

  function createProfile(fields) {
    fields = fields || {};
    const clean = String(fields.name || '').trim().slice(0, 40);
    if (!clean) return { error: 'Please enter your name.' };
    const list = loadProfiles();
    const u = validateUsername(fields.username, list);
    if (u.error) return u;
    const e = validateEmail(fields.email, list);
    if (e.error) return e;
    const password = fields.password;
    if (!password || String(password).length < 4) return { error: 'Password must be at least 4 characters.' };
    const salt = Utils.uid('s');
    const p = {
      id: Utils.uid('prof'),
      name: clean,
      username: u.value,
      email: e.value,
      icon: fields.icon || '🙂',
      salt,
      passHash: hash(String(password), salt),
      fresh: true,
      createdAt: new Date().toISOString()
    };
    list.push(p);
    if (!saveProfiles(list)) return { error: 'Could not save the account — your browser is blocking storage.' };
    return { profile: p };
  }

  /* Older profiles (created before usernames) can sign in with their display name. */
  function findAccount(idOr) {
    const q = String(idOr || '').trim().toLowerCase();
    if (!q) return null;
    return loadProfiles().find(p =>
      (p.username || '').toLowerCase() === q ||
      (p.email || '').toLowerCase() === q ||
      (p.name || '').toLowerCase() === q) || null;
  }

  function login(idOr, password) {
    const p = findAccount(idOr);
    if (!p) return false;
    if (p.passHash && hash(String(password || ''), p.salt) !== p.passHash) return false;
    try { global.localStorage.setItem(SESSION_KEY, JSON.stringify({ profileId: p.id, at: Date.now() })); }
    catch (e) { return false; }
    return true;
  }

  function completeProfile(id, username, email) {
    const list = loadProfiles();
    const p = list.find(x => x.id === id);
    if (!p) return { error: 'Account not found.' };
    const u = validateUsername(username, list, id);
    if (u.error) return u;
    const e = validateEmail(email, list, id);
    if (e.error) return e;
    p.username = u.value;
    p.email = e.value;
    if (!saveProfiles(list)) return { error: 'Could not save — your browser is blocking storage.' };
    return { ok: true };
  }

  function logout() {
    try { global.localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  function setPassword(id, currentPw, newPw) {
    const list = loadProfiles();
    const p = list.find(x => x.id === id);
    if (!p) return { error: 'Profile not found.' };
    if (p.passHash && hash(String(currentPw || ''), p.salt) !== p.passHash) return { error: 'Current password is incorrect.' };
    if (newPw && String(newPw).length < 4) return { error: 'New password must be at least 4 characters — or leave empty for no password.' };
    if (newPw) {
      p.salt = Utils.uid('s');
      p.passHash = hash(String(newPw), p.salt);
    } else {
      p.salt = null;
      p.passHash = null;
    }
    saveProfiles(list);
    return { ok: true };
  }

  /* Accounts are permanent: there is intentionally no way to delete one. */

  /* Move pre-login data (momentum.data.v1) into the first profile created. */
  function migrateLegacy(profileId) {
    try {
      const legacy = global.localStorage.getItem(DATA_BASE);
      if (!legacy) return false;
      const target = DATA_BASE + '.' + profileId;
      if (!global.localStorage.getItem(target)) global.localStorage.setItem(target, legacy);
      global.localStorage.removeItem(DATA_BASE);
      return true;
    } catch (e) { return false; }
  }

  function hasLegacy() {
    try { return !!global.localStorage.getItem(DATA_BASE); } catch (e) { return false; }
  }

  const Auth = {
    PROFILES_KEY, SESSION_KEY, DATA_BASE, BACKUP_BASE,
    hash, profiles, sessionProfile, createProfile, findAccount, completeProfile, login, logout,
    setPassword, migrateLegacy, hasLegacy, USERNAME_RE, EMAIL_RE
  };

  global.Auth = Auth;
  if (typeof module !== 'undefined' && module.exports) module.exports = Auth;
})(typeof window !== 'undefined' ? window : globalThis);
