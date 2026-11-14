/* Momentum — storage: persistence, validation, backups, export/import, trash */
(function (global) {
  'use strict';

  const KEY = 'momentum.data.v1';
  const BACKUP_KEY = 'momentum.backups.v1';
  const MAX_BACKUPS = 5;
  const MAX_TRASH = 100;

  const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
  const STATUSES = ['not-started', 'in-progress', 'waiting', 'completed'];
  const RECURRENCE_TYPES = ['none', 'daily', 'weekdays', 'weekly', 'biweekly', 'monthly'];

  function emptyState() {
    return {
      version: 1,
      tasks: [],
      categories: [],
      projects: [],
      goals: [],
      notes: [],
      trash: [],
      activity: [],
      settings: {
        theme: 'light',
        userName: '',
        weekStartsOn: 1,
        browserNotifications: false,
        reminderDefault: 30,
        hideCompleted: false,
        seeded: false
      }
    };
  }

  function str(v, fallback) { return typeof v === 'string' ? v : (fallback != null ? fallback : ''); }
  function num(v, fallback) { const n = Number(v); return isFinite(n) ? n : (fallback != null ? fallback : 0); }
  function bool(v, fallback) { return typeof v === 'boolean' ? v : (fallback != null ? fallback : false); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function dateOrNull(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }
  function timeOrNull(v) { return typeof v === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v) ? v : null; }

  function normalizeTask(t) {
    if (!t || typeof t !== 'object') return null;
    const title = str(t.title).trim();
    if (!title) return null;
    const now = new Date().toISOString();
    return {
      id: str(t.id) || Utils.uid('task'),
      title: title.slice(0, 300),
      description: str(t.description).slice(0, 5000),
      startDate: dateOrNull(t.startDate),
      dueDate: dateOrNull(t.dueDate),
      time: timeOrNull(t.time),
      durationMin: num(t.durationMin, 0),
      priority: PRIORITIES.includes(t.priority) ? t.priority : 'medium',
      categoryId: str(t.categoryId) || null,
      tags: arr(t.tags).filter(x => typeof x === 'string').map(x => x.trim().slice(0, 30)).filter(Boolean).slice(0, 12),
      estimateMin: num(t.estimateMin, 0),
      actualMin: num(t.actualMin, 0),
      subtasks: arr(t.subtasks).map(s => ({
        id: str(s.id) || Utils.uid('sub'),
        title: str(s.title).trim().slice(0, 300) || 'Untitled step',
        done: bool(s.done)
      })).slice(0, 50),
      recurrence: normalizeRecurrence(t.recurrence),
      reminders: arr(t.reminders).map(n => num(n, null)).filter(n => n != null && n >= 0 && n <= 10080).slice(0, 5),
      links: arr(t.links).map(l => ({ label: str(l.label).slice(0, 120), url: str(l.url).slice(0, 1000) })).filter(l => l.url).slice(0, 10),
      notes: str(t.notes).slice(0, 5000),
      status: STATUSES.includes(t.status) ? t.status : 'not-started',
      dependsOn: Array.from(new Set(arr(t.dependsOn).filter(x => typeof x === 'string'))).slice(0, 20),
      projectId: str(t.projectId) || null,
      completedAt: t.completedAt ? str(t.completedAt) : null,
      createdAt: t.createdAt ? str(t.createdAt) : now,
      updatedAt: now,
      notified: arr(t.notified).map(String).slice(0, 20)
    };
  }

  function normalizeRecurrence(r) {
    if (!r || typeof r !== 'object') return { type: 'none', interval: 1 };
    const type = RECURRENCE_TYPES.includes(r.type) ? r.type : 'none';
    return { type, interval: Utils.clamp(num(r.interval, 1), 1, 52) };
  }

  function normalizeCategory(c) {
    if (!c || typeof c !== 'object') return null;
    const name = str(c.name).trim();
    if (!name) return null;
    return {
      id: str(c.id) || Utils.uid('cat'),
      name: name.slice(0, 60),
      color: /^#[0-9a-fA-F]{6}$/.test(c.color || '') ? c.color : '#6366f1',
      icon: str(c.icon).slice(0, 8) || '🏷️'
    };
  }

  function normalizeMilestone(m) {
    if (!m || typeof m !== 'object') return null;
    const title = str(m.title).trim() || 'Milestone';
    return {
      id: str(m.id) || Utils.uid('ms'),
      title: title.slice(0, 200),
      done: bool(m.done),
      dueDate: dateOrNull(m.dueDate)
    };
  }

  function normalizeProject(p) {
    if (!p || typeof p !== 'object') return null;
    const name = str(p.name).trim();
    if (!name) return null;
    return {
      id: str(p.id) || Utils.uid('proj'),
      name: name.slice(0, 120),
      description: str(p.description).slice(0, 3000),
      startDate: dateOrNull(p.startDate),
      dueDate: dateOrNull(p.dueDate),
      milestones: arr(p.milestones).map(normalizeMilestone).filter(Boolean).slice(0, 50),
      priority: PRIORITIES.includes(p.priority) ? p.priority : 'medium',
      status: STATUSES.includes(p.status) ? p.status : 'not-started',
      notes: str(p.notes).slice(0, 5000),
      links: arr(p.links).map(l => ({ label: str(l.label).slice(0, 120), url: str(l.url).slice(0, 1000) })).filter(l => l.url).slice(0, 10),
      color: /^#[0-9a-fA-F]{6}$/.test(p.color || '') ? p.color : '#6366f1',
      icon: str(p.icon).slice(0, 8) || '📁',
      categoryId: str(p.categoryId) || null,
      createdAt: p.createdAt ? str(p.createdAt) : new Date().toISOString()
    };
  }

  function normalizeGoal(g) {
    if (!g || typeof g !== 'object') return null;
    const name = str(g.name).trim();
    if (!name) return null;
    return {
      id: str(g.id) || Utils.uid('goal'),
      name: name.slice(0, 120),
      description: str(g.description).slice(0, 3000),
      targetDate: dateOrNull(g.targetDate),
      milestones: arr(g.milestones).map(normalizeMilestone).filter(Boolean).slice(0, 50),
      color: /^#[0-9a-fA-F]{6}$/.test(g.color || '') ? g.color : '#8b5cf6',
      icon: str(g.icon).slice(0, 8) || '🎯',
      notes: str(g.notes).slice(0, 5000),
      createdAt: g.createdAt ? str(g.createdAt) : new Date().toISOString()
    };
  }

  function normalizeNote(n) {
    if (!n || typeof n !== 'object') return null;
    const title = str(n.title).trim();
    const body = str(n.body);
    if (!title && !body.trim()) return null;
    return {
      id: str(n.id) || Utils.uid('note'),
      title: (title || 'Untitled note').slice(0, 200),
      body: body.slice(0, 20000),
      color: /^#[0-9a-fA-F]{6}$/.test(n.color || '') ? n.color : '#f59e0b',
      pinned: bool(n.pinned),
      taskIds: arr(n.taskIds).filter(x => typeof x === 'string').slice(0, 20),
      projectIds: arr(n.projectIds).filter(x => typeof x === 'string').slice(0, 20),
      createdAt: n.createdAt ? str(n.createdAt) : new Date().toISOString(),
      updatedAt: n.updatedAt ? str(n.updatedAt) : new Date().toISOString()
    };
  }

  function normalizeSettings(s, prev) {
    const out = Object.assign({}, (prev || emptyState().settings));
    if (!s || typeof s !== 'object') return out;
    if (s.theme === 'light' || s.theme === 'dark') out.theme = s.theme;
    if (typeof s.userName === 'string') out.userName = s.userName.slice(0, 60);
    out.weekStartsOn = s.weekStartsOn === 0 ? 0 : 1;
    out.browserNotifications = bool(s.browserNotifications);
    out.reminderDefault = Utils.clamp(num(s.reminderDefault, 30), 0, 10080);
    out.hideCompleted = bool(s.hideCompleted);
    out.seeded = bool(s.seeded);
    return out;
  }

  function normalize(data, prev) {
    const base = emptyState();
    if (!data || typeof data !== 'object') return prev ? Object.assign(base, { settings: prev.settings }) : base;
    const seen = new Set();
    const tasks = arr(data.tasks).map(normalizeTask).filter(Boolean).filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
    const catIds = new Set();
    const categories = arr(data.categories).map(normalizeCategory).filter(Boolean).filter(c => {
      if (catIds.has(c.id)) return false;
      catIds.add(c.id);
      return true;
    });
    const projIds = new Set(arr(data.projects).map(p => p && p.id).filter(Boolean));
    const taskIds = new Set(tasks.map(t => t.id));
    return {
      version: 1,
      tasks: tasks.map(t => Object.assign(t, {
        categoryId: t.categoryId && catIds.has(t.categoryId) ? t.categoryId : null,
        projectId: t.projectId && projIds.has(t.projectId) ? t.projectId : null,
        dependsOn: t.dependsOn.filter(id => taskIds.has(id) && id !== t.id)
      })),
      categories,
      projects: arr(data.projects).map(p => normalizeProject(p)).filter(Boolean).map(p => Object.assign(p, {
        categoryId: p.categoryId && catIds.has(p.categoryId) ? p.categoryId : null
      })),
      goals: arr(data.goals).map(normalizeGoal).filter(Boolean),
      notes: arr(data.notes).map(normalizeNote).filter(Boolean).map(n => Object.assign(n, {
        taskIds: n.taskIds.filter(id => taskIds.has(id)),
        projectIds: n.projectIds.filter(id => projIds.has(id))
      })),
      trash: arr(data.trash).slice(0, MAX_TRASH),
      activity: arr(data.activity).filter(a => a && typeof a === 'object' && a.ts).slice(-2000),
      settings: normalizeSettings(data.settings, prev && prev.settings)
    };
  }

  function load() {
    let raw = null;
    try {
      raw = global.localStorage.getItem(KEY);
    } catch (e) {
      console.warn('localStorage unavailable; data will not persist this session.', e);
      return emptyState();
    }
    if (!raw) return emptyState();
    try {
      return normalize(JSON.parse(raw));
    } catch (e) {
      console.error('Saved data was corrupted; attempting backup recovery.', e);
      const backups = listBackups();
      if (backups.length) {
        try {
          return normalize(JSON.parse(backups[0].data));
        } catch (e2) { /* fall through */ }
      }
      return emptyState();
    }
  }

  function save(state) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('Failed to save data.', e);
      if (global.UI && global.UI.toast) {
        global.UI.toast('warning', 'Save failed', 'Storage is full or unavailable. Export a backup from Settings.');
      }
      return false;
    }
  }

  /* ---- Automatic rolling backups (kept in localStorage, restore from Settings) ---- */
  function snapshot(state) {
    let backups = listBackups();
    const data = JSON.stringify(state);
    if (backups[0] && backups[0].data === data) return;
    backups.unshift({ ts: new Date().toISOString(), data });
    backups = backups.slice(0, MAX_BACKUPS);
    try {
      global.localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));
    } catch (e) { /* backups are best-effort */ }
  }

  function listBackups() {
    try {
      const raw = global.localStorage.getItem(BACKUP_KEY);
      const arrp = raw ? JSON.parse(raw) : [];
      return Array.isArray(arrp) ? arrp.filter(b => b && b.ts && b.data) : [];
    } catch (e) { return []; }
  }

  function restoreBackup(ts) {
    const b = listBackups().find(x => x.ts === ts);
    if (!b) return false;
    try {
      const parsed = normalize(JSON.parse(b.data));
      save(parsed);
      return parsed;
    } catch (e) { return false; }
  }

  /* ---- Trash (protection against accidental deletion) ---- */
  function pushTrash(state, type, item, label) {
    state.trash.unshift({
      id: item.id,
      type,
      label: label || item.title || item.name || 'Item',
      item: JSON.parse(JSON.stringify(item)),
      deletedAt: new Date().toISOString()
    });
    state.trash = state.trash.slice(0, MAX_TRASH);
  }

  function restoreFromTrash(state, trashId) {
    const idx = state.trash.findIndex(t => t.id === trashId);
    if (idx === -1) return null;
    const entry = state.trash[idx];
    state.trash.splice(idx, 1);
    const item = normalize(JSON.parse(JSON.stringify(entry.item)));
    switch (entry.type) {
      case 'task': state.tasks.push(item); break;
      case 'project': state.projects.push(item); break;
      case 'goal': state.goals.push(item); break;
      case 'note': state.notes.push(item); break;
      case 'category': state.categories.push(item); break;
      default: return null;
    }
    return { type: entry.type, item };
  }

  /* ---- Export / Import ---- */
  function exportJson(state) {
    const payload = { app: 'momentum-planner', exportedAt: new Date().toISOString(), data: state };
    return JSON.stringify(payload, null, 2);
  }

  function importJson(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { error: 'That file is not valid JSON.' };
    }
    const data = parsed && parsed.data ? parsed.data : parsed;
    if (!data || typeof data !== 'object' || !('tasks' in data)) {
      return { error: 'This does not look like a Momentum backup file.' };
    }
    return { data: normalize(data) };
  }

  const Storage = {
    KEY, PRIORITIES, STATUSES, RECURRENCE_TYPES,
    emptyState, normalize, normalizeTask, normalizeProject, normalizeGoal, normalizeNote, normalizeCategory,
    load, save, snapshot, listBackups, restoreBackup, pushTrash, restoreFromTrash, exportJson, importJson
  };

  global.Storage = Storage;
  if (typeof module !== 'undefined' && module.exports) module.exports = Storage;
})(typeof window !== 'undefined' ? window : globalThis);
