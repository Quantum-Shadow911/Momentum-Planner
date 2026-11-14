/* Momentum — intelligent prioritization: scoring, recommended next task, selectors */
(function (global) {
  'use strict';

  const PRIO_WEIGHT = { urgent: 40, high: 26, medium: 14, low: 6 };

  function isBlocked(task, state) {
    if (!task.dependsOn || !task.dependsOn.length) return false;
    return task.dependsOn.some(id => {
      const dep = state.tasks.find(t => t.id === id);
      return dep && dep.status !== 'completed';
    });
  }

  function blockingNames(task, state) {
    return (task.dependsOn || [])
      .map(id => state.tasks.find(t => t.id === id))
      .filter(dep => dep && dep.status !== 'completed')
      .map(dep => dep.title);
  }

  /*
   * Score = priority weight + deadline urgency + overdue boost + status boost
   *        - duration drag for far-out tasks + small category/project nudge.
   * Lower estimate slightly reduces score for non-urgent work so quick wins
   * surface when the schedule is loose, but never beats a real deadline.
   */
  function score(task, state, today) {
    today = today || Utils.todayStr();
    if (task.status === 'completed') return -Infinity;
    if (isBlocked(task, state)) return -Infinity;

    let s = PRIO_WEIGHT[task.priority] || 14;

    const due = task.dueDate;
    if (due) {
      const n = Utils.daysUntil(due, today);
      if (n < 0) s += 60 + Math.min(20, Math.abs(n) * 2);          // overdue: always top
      else if (n === 0) s += 42;                                    // due today
      else if (n === 1) s += 30;
      else if (n <= 3) s += 22 - n * 2;
      else if (n <= 7) s += 14 - (n - 3);
      else s += Math.max(2, 8 - (n - 7) * 0.3);
    } else {
      s += 2; // no deadline: gently deprioritized vs dated work
    }

    if (task.status === 'in-progress') s += 10;                     // finish what you started
    if (task.status === 'waiting') s -= 12;                         // waiting on someone else

    const est = task.estimateMin || task.durationMin || 0;
    if (est > 0) {
      if (est <= 15) s += 4;                                        // quick wins
      else if (est >= 180 && (!due || Utils.daysUntil(due, today) > 4)) s -= 6;
    }

    if (task.subtasks && task.subtasks.length) {
      const done = task.subtasks.filter(st => st.done).length;
      if (done > 0 && done < task.subtasks.length) s += 5;          // momentum: almost done
    }
    return Math.round(s * 10) / 10;
  }

  function reason(task, state) {
    const parts = [];
    const n = task.dueDate ? Utils.daysUntil(task.dueDate) : null;
    if (n != null && n < 0) parts.push(`overdue by ${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'}`);
    else if (n === 0) parts.push('due today');
    else if (n === 1) parts.push('due tomorrow');
    else if (n != null) parts.push(`due in ${n} days`);
    if (task.priority === 'urgent') parts.push('marked urgent');
    else if (task.priority === 'high') parts.push('high priority');
    if (task.status === 'in-progress') parts.push('already in progress');
    const blockedBy = (task.dependsOn || []).length;
    const openDeps = blockingNames(task, state).length;
    if (blockedBy && !openDeps) parts.push('all dependencies done');
    const openSubs = (task.subtasks || []).filter(st => !st.done).length;
    if (openSubs) parts.push(`${openSubs} step${openSubs === 1 ? '' : 's'} left`);
    if (task.estimateMin) parts.push(`~${Utils.fmtDuration(task.estimateMin)}`);
    return parts.length ? parts.join(' · ') : 'fits your schedule';
  }

  function recommended(state, options) {
    const opts = options || {};
    const today = Utils.todayStr();
    const candidates = state.tasks.filter(t => {
      if (t.status === 'completed') return false;
      if (isBlocked(t, state)) return false;
      if (opts.categoryId && t.categoryId !== opts.categoryId) return false;
      if (opts.projectId && t.projectId !== opts.projectId) return false;
      if (opts.todayOnly) {
        const n = t.dueDate ? Utils.daysUntil(t.dueDate, today) : null;
        if (n == null || n > 0) return false;
      }
      return true;
    });
    if (!candidates.length) return null;
    let best = null, bestScore = -Infinity;
    candidates.forEach(t => {
      const sc = score(t, state, today);
      if (sc > bestScore) { bestScore = sc; best = t; }
    });
    return best ? { task: best, score: bestScore, why: reason(best, state) } : null;
  }

  /* ---- Shared selectors used by every view ---- */
  function isOverdue(task, today) {
    if (task.status === 'completed' || !task.dueDate) return false;
    return Utils.daysUntil(task.dueDate, today || Utils.todayStr()) < 0;
  }

  function isDueToday(task, today) {
    return task.status !== 'completed' && task.dueDate === (today || Utils.todayStr());
  }

  function overdueTasks(state, today) {
    today = today || Utils.todayStr();
    return state.tasks.filter(t => isOverdue(t, today)).sort(byDue);
  }

  function dueOn(state, dateStr) {
    return state.tasks.filter(t => t.dueDate === dateStr && t.status !== 'completed').sort(byTimeThenPrio);
  }

  function allOn(state, dateStr) {
    return state.tasks.filter(t => t.dueDate === dateStr).sort(byTimeThenPrio);
  }

  function upcoming(state, days, today) {
    today = today || Utils.todayStr();
    const end = Utils.addDays(today, days == null ? 7 : days);
    return state.tasks
      .filter(t => t.status !== 'completed' && t.dueDate && t.dueDate >= today && t.dueDate <= end)
      .sort(byDue);
  }

  function byDue(a, b) {
    const ad = a.dueDate || '9999-12-31', bd = b.dueDate || '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return byTimeThenPrio(a, b);
  }

  function byTimeThenPrio(a, b) {
    const at = a.time ? Utils.minutesOf(a.time) : 9999;
    const bt = b.time ? Utils.minutesOf(b.time) : 9999;
    if (at !== bt) return at - bt;
    return (PRIO_WEIGHT[b.priority] || 0) - (PRIO_WEIGHT[a.priority] || 0);
  }

  /* ---- School-aware selectors ---- */

  const ASSESSMENT_TYPES = ['quiz', 'test', 'test-prep'];

  function isAssessment(task) {
    return ASSESSMENT_TYPES.includes(task.assignmentType);
  }

  function sessionsOn(state, dateStr) {
    const out = [];
    state.tasks.forEach(t => {
      (t.sessions || []).forEach(s => {
        if (s.date === dateStr && t.status !== 'completed') out.push({ session: s, task: t });
      });
    });
    return out.sort((a, b) => {
      const at = a.session.time ? Utils.minutesOf(a.session.time) : 9999;
      const bt = b.session.time ? Utils.minutesOf(b.session.time) : 9999;
      return at - bt;
    });
  }

  function eventsOn(state, dateStr) {
    return state.events.filter(e => e.date === dateStr)
      .sort((a, b) => (Utils.minutesOf(a.time) || 9999) - (Utils.minutesOf(b.time) || 9999));
  }

  function upcomingEvents(state, days, today) {
    today = today || Utils.todayStr();
    const end = Utils.addDays(today, days == null ? 7 : days);
    return state.events.filter(e => e.date >= today && e.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  }

  function upcomingAssessments(state, days, today) {
    today = today || Utils.todayStr();
    const end = Utils.addDays(today, days == null ? 14 : days);
    return state.tasks
      .filter(t => t.status !== 'completed' && isAssessment(t) && t.dueDate && t.dueDate >= today && t.dueDate <= end)
      .sort(byDue);
  }

  /* Estimated workload in minutes scheduled ON a given date:
     open tasks due that day (crunch risk) + planned work sessions that day. */
  function workloadOn(state, dateStr) {
    const taskLoad = state.tasks
      .filter(t => t.status !== 'completed' && t.dueDate === dateStr)
      .reduce((sum, t) => {
        const est = t.estimateMin || t.durationMin || 0;
        const scheduled = (t.sessions || []).reduce((s2, x) => s2 + x.durationMin, 0);
        return sum + Math.max(0, est - scheduled);
      }, 0);
    const sessionLoad = sessionsOn(state, dateStr)
      .reduce((sum, e) => sum + e.session.durationMin, 0);
    return { taskLoad, sessionLoad, total: taskLoad + sessionLoad };
  }

  function schoolStats(state, todayArg) {
    const today = todayArg || Utils.todayStr();
    const soon = upcoming(state, 7, today);
    const sessionsToday = sessionsOn(state, today);
    return {
      dueSoon: soon.length,
      assessments: upcomingAssessments(state, 14, today).length,
      sessionsTodayTotal: sessionsToday.length,
      sessionsTodayDone: sessionsToday.filter(e => e.session.done).length,
      eventsThisWeek: upcomingEvents(state, 7, today).length,
      submittedOpen: state.tasks.filter(t => t.status !== 'completed' && t.submission === 'submitted').length
    };
  }

  function stats(state, todayArg) {
    const today = todayArg || Utils.todayStr();
    const weekStart = Utils.startOfWeek(today, state.settings.weekStartsOn);
    const open = state.tasks.filter(t => t.status !== 'completed');
    const done = state.tasks.filter(t => t.status === 'completed');
    const doneToday = done.filter(t => t.completedAt && t.completedAt.slice(0, 10) === today);
    const doneWeek = done.filter(t => t.completedAt && t.completedAt.slice(0, 10) >= weekStart && t.completedAt.slice(0, 10) <= today);
    const overdue = open.filter(t => isOverdue(t, today));
    const total = state.tasks.length;
    return {
      total,
      open: open.length,
      completed: done.length,
      completedToday: doneToday.length,
      completedWeek: doneWeek.length,
      overdue: overdue.length,
      dueToday: open.filter(t => t.dueDate === today).length,
      completionPct: total ? Math.round((done.length / total) * 100) : 0,
      todayPct: (doneToday.length + open.filter(t => t.dueDate === today).length)
        ? Math.round((doneToday.length / (doneToday.length + open.filter(t => t.dueDate === today).length)) * 100) : 0,
      remainingMin: open.reduce((sum, t) => sum + (t.estimateMin || t.durationMin || 0), 0)
    };
  }

  const Priority = {
    PRIO_WEIGHT, score, reason, recommended, isBlocked, blockingNames,
    isOverdue, isDueToday, overdueTasks, dueOn, allOn, upcoming, byDue, byTimeThenPrio, stats,
    isAssessment, ASSESSMENT_TYPES, sessionsOn, eventsOn, upcomingEvents, upcomingAssessments,
    workloadOn, schoolStats
  };

  global.Priority = Priority;
  if (typeof module !== 'undefined' && module.exports) module.exports = Priority;
})(typeof window !== 'undefined' ? window : globalThis);
