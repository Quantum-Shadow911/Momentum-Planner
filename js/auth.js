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

  function createProfile(name, icon, password) {
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean) return { error: 'Please enter a name.' };
    if (password && String(password).length < 4) return { error: 'Password must be at least 4 characters — or leave it empty for no password.' };
    const list = loadProfiles();
    if (list.some(p => p.name.toLowerCase() === clean.toLowerCase())) return { error: 'A person with that name already exists.' };
    const salt = Utils.uid('s');
    const p = {
      id: Utils.uid('prof'),
      name: clean,
      icon: icon || '🙂',
      salt: password ? salt : null,
      passHash: password ? hash(String(password), salt) : null,
      createdAt: new Date().toISOString()
    };
    list.push(p);
    if (!saveProfiles(list)) return { error: 'Could not save the profile — your browser is blocking storage.' };
    return { profile: p };
  }

  function login(id, password) {
    const p = loadProfiles().find(x => x.id === id);
    if (!p) return false;
    if (p.passHash && hash(String(password || ''), p.salt) !== p.passHash) return false;
    try { global.localStorage.setItem(SESSION_KEY, JSON.stringify({ profileId: p.id, at: Date.now() })); }
    catch (e) { return false; }
    return true;
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

  function deleteProfile(id, confirmName) {
    const list = loadProfiles();
    const p = list.find(x => x.id === id);
    if (!p) return { error: 'Profile not found.' };
    if ((confirmName || '').trim().toLowerCase() !== p.name.toLowerCase()) return { error: 'Type the name exactly to confirm.' };
    try {
      global.localStorage.removeItem(DATA_BASE + '.' + id);
      global.localStorage.removeItem(BACKUP_BASE + '.' + id);
    } catch (e) { /* ignore */ }
    saveProfiles(list.filter(x => x.id !== id));
    return { ok: true };
  }

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
    hash, profiles, sessionProfile, createProfile, login, logout,
    setPassword, deleteProfile, migrateLegacy, hasLegacy
  };

  global.Auth = Auth;
  if (typeof module !== 'undefined' && module.exports) module.exports = Auth;
})(typeof window !== 'undefined' ? window : globalThis);
