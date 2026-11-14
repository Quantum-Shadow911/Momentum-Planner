/* Momentum — study timer: track actual time spent per assignment (refresh-safe) */
(function (global) {
  'use strict';

  const KEY = 'momentum.timer.v1';
  let current = null;
  let tickListeners = new Set();
  let tickInterval = null;

  function load() {
    try {
      const raw = global.localStorage.getItem(KEY);
      if (!raw) return null;
      const t = JSON.parse(raw);
      if (!t || !t.taskId) return null;
      return t;
    } catch (e) { return null; }
  }

  function persist() {
    try {
      if (current) global.localStorage.setItem(KEY, JSON.stringify(current));
      else global.localStorage.removeItem(KEY);
    } catch (e) { /* best effort */ }
  }

  function elapsedSec() {
    if (!current) return 0;
    let ms = current.accumulatedMs || 0;
    if (current.running && current.startedAt) ms += Date.now() - current.startedAt;
    return Math.floor(ms / 1000);
  }

  function emitTick() {
    tickListeners.forEach(fn => {
      try { fn(status()); } catch (e) { /* listener error */ }
    });
  }

  function startTicker() {
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(emitTick, 1000);
  }

  function stopTicker() {
    if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
  }

  function start(taskId) {
    const t = Store.getTask(taskId);
    if (!t) return null;
    current = { taskId, startedAt: Date.now(), accumulatedMs: 0, running: true, title: t.title };
    persist();
    startTicker();
    emitTick();
    return status();
  }

  function pause() {
    if (!current || !current.running) return status();
    current.accumulatedMs = (current.accumulatedMs || 0) + (Date.now() - current.startedAt);
    current.running = false;
    current.startedAt = null;
    persist();
    emitTick();
    return status();
  }

  function resume() {
    if (!current || current.running) return status();
    current.running = true;
    current.startedAt = Date.now();
    persist();
    startTicker();
    emitTick();
    return status();
  }

  function toggle() {
    if (!current) return null;
    return current.running ? pause() : resume();
  }

  function cancel() {
    current = null;
    persist();
    stopTicker();
    emitTick();
  }

  /* Commit tracked minutes to the task's actual time spent. */
  function finish() {
    if (!current) return null;
    const mins = Math.max(1, Math.round(elapsedSec() / 60));
    const taskId = current.taskId;
    const title = current.title;
    const exists = !!Store.getTask(taskId);
    cancel();
    if (exists) Store.addSpentTime(taskId, mins);
    return { taskId, title, minutes: mins, committed: exists };
  }

  function status() {
    if (!current) return { active: false };
    return {
      active: true,
      taskId: current.taskId,
      title: current.title,
      running: !!current.running,
      elapsedSec: elapsedSec()
    };
  }

  function onTick(fn) {
    tickListeners.add(fn);
    return () => tickListeners.delete(fn);
  }

  /* Restore a timer that survived a page refresh. */
  function init() {
    current = load();
    if (current && current.running) startTicker();
    return status();
  }

  const Timer = { init, start, pause, resume, toggle, cancel, finish, status, onTick, elapsedSec };

  global.Timer = Timer;
  if (typeof module !== 'undefined' && module.exports) module.exports = Timer;
})(typeof window !== 'undefined' ? window : globalThis);
