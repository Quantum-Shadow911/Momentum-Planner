/* Momentum — central store: state, actions, pub/sub. All views re-render from here. */
(function (global) {
  'use strict';

  const listeners = new Set();
  let state = null;
  let saveDebounced = null;

  function init() {
    state = Storage.load();
    saveDebounced = Utils.debounce(persist, 400);
    persist();
  }

  function get() { return state; }

  function emit(action) {
    listeners.forEach(fn => {
      try { fn(state, action); } catch (e) { console.error('Listener error', e); }
    });
  }

  function persist() {
    const ok = Storage.save(state);
    if (ok) Storage.snapshot(state);
    return ok;
  }

  function update(mutator, action) {
    mutator(state);
    persist();
    emit(action || {});
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function logActivity(type, text) {
    state.activity.push({ ts: new Date().toISOString(), type, text });
    if (state.activity.length > 2000) state.activity.splice(0, state.activity.length - 2000);
  }

  /* ================= Tasks ================= */

  function saveTask(fields) {
    const clean = Storage.normalizeTask(fields);
    if (!clean) return null;
    const existing = state.tasks.find(t => t.id === clean.id);
    if (existing) {
      if (existing.status === 'completed' && clean.status !== 'completed') existing.completedAt = null;
      if (existing.status !== 'completed' && clean.status === 'completed') clean.completedAt = new Date().toISOString();
      Object.assign(existing, clean, { updatedAt: new Date().toISOString() });
      update(s => s, { type: 'task-updated', id: existing.id });
      return existing;
    }
    state.tasks.push(clean);
    logActivity('created', `Added task “${clean.title}”`);
    update(s => s, { type: 'task-created', id: clean.id });
    return clean;
  }

  function getTask(id) { return state.tasks.find(t => t.id === id) || null; }

  function toggleTask(id) {
    const t = getTask(id);
    if (!t) return;
    if (t.status !== 'completed') {
      t.status = 'completed';
      t.completedAt = new Date().toISOString();
      logActivity('completed', `Completed “${t.title}”`);
      if (t.recurrence.type !== 'none') spawnRecurrence(t);
    } else {
      t.status = 'not-started';
      t.completedAt = null;
    }
    t.updatedAt = new Date().toISOString();
    update(s => s, { type: 'task-toggled', id });
  }

  function setTaskStatus(id, status) {
    const t = getTask(id);
    if (!t || !Storage.STATUSES.includes(status)) return;
    const wasCompleted = t.status === 'completed';
    t.status = status;
    if (status === 'completed' && !wasCompleted) {
      t.completedAt = new Date().toISOString();
      logActivity('completed', `Completed “${t.title}”`);
      if (t.recurrence.type !== 'none') spawnRecurrence(t);
    }
    if (status !== 'completed') t.completedAt = null;
    t.updatedAt = new Date().toISOString();
    update(s => s, { type: 'task-status', id });
  }

  function spawnRecurrence(t) {
    const r = t.recurrence;
    const base = t.dueDate || t.startDate || Utils.todayStr();
    let next = null;
    switch (r.type) {
      case 'daily': next = Utils.addDays(base, r.interval); break;
      case 'weekdays': {
        let d = Utils.addDays(base, 1);
        let found = 0;
        let guard = 0;
        while (guard++ < 400 && found < r.interval) {
          const dow = Utils.parseDate(d).getDay();
          if (dow !== 0 && dow !== 6) found++;
          if (found < r.interval) d = Utils.addDays(d, 1);
        }
        next = d;
        break;
      }
      case 'weekly': next = Utils.addDays(base, 7 * r.interval); break;
      case 'biweekly': next = Utils.addDays(base, 14 * r.interval); break;
      case 'monthly': next = Utils.addMonths(base, r.interval); break;
    }
    if (!next) return;
    const copy = JSON.parse(JSON.stringify(t));
    copy.id = Utils.uid('task');
    copy.dueDate = next;
    if (copy.startDate) copy.startDate = next;
    copy.status = 'not-started';
    copy.completedAt = null;
    copy.actualMin = 0;
    copy.subtasks.forEach(st => { st.done = false; });
    copy.notified = [];
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    state.tasks.push(copy);
    logActivity('created', `Recurring task “${t.title}” rescheduled to ${Utils.fmtDate(next)}`);
  }

  function duplicateTask(id) {
    const t = getTask(id);
    if (!t) return null;
    const copy = JSON.parse(JSON.stringify(t));
    copy.id = Utils.uid('task');
    copy.title = t.title + ' (copy)';
    copy.status = 'not-started';
    copy.completedAt = null;
    copy.actualMin = 0;
    copy.subtasks.forEach(st => { st.done = false; });
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    state.tasks.push(copy);
    update(s => s, { type: 'task-created', id: copy.id });
    return copy;
  }

  function deleteTask(id) {
    const t = getTask(id);
    if (!t) return;
    Storage.pushTrash(state, 'task', t);
    state.tasks = state.tasks.filter(x => x.id !== id);
    state.tasks.forEach(x => {
      x.dependsOn = x.dependsOn.filter(d => d !== id);
    });
    state.notes.forEach(n => { n.taskIds = n.taskIds.filter(x => x !== id); });
    logActivity('deleted', `Deleted task “${t.title}”`);
    update(s => s, { type: 'task-deleted', id });
  }

  function toggleSubtask(taskId, subId) {
    const t = getTask(taskId);
    if (!t) return;
    const st = t.subtasks.find(s => s.id === subId);
    if (!st) return;
    st.done = !st.done;
    t.updatedAt = new Date().toISOString();
    update(s => s, { type: 'subtask-toggled' });
  }

  /* ================= Categories ================= */

  function saveCategory(fields) {
    const clean = Storage.normalizeCategory(fields);
    if (!clean) return null;
    const existing = state.categories.find(c => c.id === clean.id);
    if (existing) Object.assign(existing, clean);
    else state.categories.push(clean);
    update(s => s, { type: 'category-saved', id: clean.id });
    return clean;
  }

  function deleteCategory(id) {
    const c = state.categories.find(x => x.id === id);
    if (!c) return;
    const used = state.tasks.filter(t => t.categoryId === id).length + state.projects.filter(p => p.categoryId === id).length;
    if (used > 0) {
      state.tasks.forEach(t => { if (t.categoryId === id) t.categoryId = null; });
      state.projects.forEach(p => { if (p.categoryId === id) p.categoryId = null; });
    }
    Storage.pushTrash(state, 'category', c);
    state.categories = state.categories.filter(x => x.id !== id);
    update(s => s, { type: 'category-deleted', id });
    return used;
  }

  /* ================= Projects ================= */

  function saveProject(fields) {
    const clean = Storage.normalizeProject(fields);
    if (!clean) return null;
    const existing = state.projects.find(p => p.id === clean.id);
    if (existing) Object.assign(existing, clean);
    else state.projects.push(clean);
    update(s => s, { type: 'project-saved', id: clean.id });
    return clean;
  }

  function getProject(id) { return state.projects.find(p => p.id === id) || null; }

  function deleteProject(id) {
    const p = getProject(id);
    if (!p) return;
    Storage.pushTrash(state, 'project', p);
    state.projects = state.projects.filter(x => x.id !== id);
    state.tasks.forEach(t => { if (t.projectId === id) t.projectId = null; });
    state.notes.forEach(n => { n.projectIds = n.projectIds.filter(x => x !== id); });
    update(s => s, { type: 'project-deleted', id });
  }

  function toggleMilestone(projectId, msId) {
    const p = getProject(projectId);
    if (!p) return;
    const m = p.milestones.find(x => x.id === msId);
    if (!m) return;
    m.done = !m.done;
    update(s => s, { type: 'milestone-toggled' });
  }

  function projectProgress(p) {
    const tasks = state.tasks.filter(t => t.projectId === p.id);
    let total = p.milestones.length, done = p.milestones.filter(m => m.done).length;
    total += tasks.length;
    done += tasks.filter(t => t.status === 'completed').length;
    return total ? Math.round((done / total) * 100) : (p.status === 'completed' ? 100 : 0);
  }

  function goalProgress(g) {
    if (!g.milestones.length) return 0;
    return Math.round((g.milestones.filter(m => m.done).length / g.milestones.length) * 100);
  }

  /* ================= Goals ================= */

  function saveGoal(fields) {
    const clean = Storage.normalizeGoal(fields);
    if (!clean) return null;
    const existing = state.goals.find(g => g.id === clean.id);
    if (existing) Object.assign(existing, clean);
    else state.goals.push(clean);
    update(s => s, { type: 'goal-saved', id: clean.id });
    return clean;
  }

  function getGoal(id) { return state.goals.find(g => g.id === id) || null; }

  function deleteGoal(id) {
    const g = getGoal(id);
    if (!g) return;
    Storage.pushTrash(state, 'goal', g);
    state.goals = state.goals.filter(x => x.id !== id);
    update(s => s, { type: 'goal-deleted', id });
  }

  function toggleGoalMilestone(goalId, msId) {
    const g = getGoal(goalId);
    if (!g) return;
    const m = g.milestones.find(x => x.id === msId);
    if (!m) return;
    m.done = !m.done;
    update(s => s, { type: 'milestone-toggled' });
  }

  /* ================= Classes ================= */

  function saveClass(fields) {
    const clean = Storage.normalizeClass(fields);
    if (!clean) return null;
    const existing = state.classes.find(c => c.id === clean.id);
    if (existing) Object.assign(existing, clean);
    else state.classes.push(clean);
    update(s => s, { type: 'class-saved', id: clean.id });
    return clean;
  }

  function getClass(id) { return state.classes.find(c => c.id === id) || null; }

  function deleteClass(id) {
    const c = getClass(id);
    if (!c) return;
    Storage.pushTrash(state, 'class', c);
    state.classes = state.classes.filter(x => x.id !== id);
    state.tasks.forEach(t => { if (t.classId === id) t.classId = null; });
    state.events.forEach(e => { if (e.classId === id) e.classId = null; });
    update(s => s, { type: 'class-deleted', id });
  }

  function classProgress(c) {
    const tasks = state.tasks.filter(t => t.classId === c.id);
    if (!tasks.length) return 0;
    return Math.round((tasks.filter(t => t.status === 'completed' || t.submission === 'submitted').length / tasks.length) * 100);
  }

  /* ================= Events ================= */

  function saveEvent(fields) {
    const clean = Storage.normalizeEvent(fields);
    if (!clean) return null;
    const existing = state.events.find(e => e.id === clean.id);
    if (existing) Object.assign(existing, clean);
    else state.events.push(clean);
    update(s => s, { type: 'event-saved', id: clean.id });
    return clean;
  }

  function getEvent(id) { return state.events.find(e => e.id === id) || null; }

  function deleteEvent(id) {
    const e = getEvent(id);
    if (!e) return;
    Storage.pushTrash(state, 'event', e);
    state.events = state.events.filter(x => x.id !== id);
    update(s => s, { type: 'event-deleted', id });
  }

  /* ================= Work sessions ================= */

  function toggleSession(taskId, sessionId) {
    const t = getTask(taskId);
    if (!t) return;
    const s = t.sessions.find(x => x.id === sessionId);
    if (!s) return;
    s.done = !s.done;
    if (s.done && !t.actualMin) t.actualMin = t.sessions.filter(x => x.done).reduce((sum, x) => sum + x.durationMin, 0);
    t.updatedAt = new Date().toISOString();
    update(s2 => s2, { type: 'session-toggled' });
  }

  function addSession(taskId, session) {
    const t = getTask(taskId);
    if (!t) return;
    const clean = Storage.normalizeSession(session);
    if (!clean) return;
    t.sessions.push(clean);
    t.updatedAt = new Date().toISOString();
    update(s2 => s2, { type: 'session-added' });
  }

  function removeSession(taskId, sessionId) {
    const t = getTask(taskId);
    if (!t) return;
    t.sessions = t.sessions.filter(x => x.id !== sessionId);
    t.updatedAt = new Date().toISOString();
    update(s2 => s2, { type: 'session-removed' });
  }

  /* ================= Notes ================= */

  function saveNote(fields) {
    const clean = Storage.normalizeNote(fields);
    if (!clean) return null;
    clean.updatedAt = new Date().toISOString();
    const existing = state.notes.find(n => n.id === clean.id);
    if (existing) Object.assign(existing, clean);
    else state.notes.push(clean);
    update(s => s, { type: 'note-saved', id: clean.id });
    return clean;
  }

  function deleteNote(id) {
    const n = state.notes.find(x => x.id === id);
    if (!n) return;
    Storage.pushTrash(state, 'note', n);
    state.notes = state.notes.filter(x => x.id !== id);
    update(s => s, { type: 'note-deleted', id });
  }

  /* ================= Settings & data ================= */

  function updateSettings(patch) {
    Object.assign(state.settings, patch);
    update(s => s, { type: 'settings' });
  }

  function replaceState(next) {
    state = next;
    persist();
    emit({ type: 'state-replaced' });
  }

  function restoreTrash(trashId) {
    const res = Storage.restoreFromTrash(state, trashId);
    if (res) {
      logActivity('restored', `Restored ${res.type} “${res.item.title || res.item.name}”`);
      update(s => s, { type: 'trash-restored' });
    }
    return res;
  }

  function emptyTrash() {
    state.trash = [];
    update(s => s, { type: 'trash-emptied' });
  }

  const Store = {
    init, get, subscribe, update, persist, logActivity,
    saveTask, getTask, toggleTask, setTaskStatus, deleteTask, duplicateTask, toggleSubtask,
    saveCategory, deleteCategory,
    saveClass, getClass, deleteClass, classProgress,
    saveEvent, getEvent, deleteEvent,
    toggleSession, addSession, removeSession,
    saveProject, getProject, deleteProject, toggleMilestone, projectProgress,
    saveGoal, getGoal, deleteGoal, toggleGoalMilestone, goalProgress,
    saveNote, deleteNote,
    updateSettings, replaceState, restoreTrash, emptyTrash
  };

  global.Store = Store;
  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
})(typeof window !== 'undefined' ? window : globalThis);
