/* Momentum — smart scheduling: workload distribution, rescheduling, assignment templates */
(function (global) {
  'use strict';

  function isBreakDay(state, dateStr) {
    return (state.breaks || []).some(b => dateStr >= b.start && dateStr <= b.end);
  }

  function breakOn(state, dateStr) {
    return (state.breaks || []).find(b => dateStr >= b.start && dateStr <= b.end) || null;
  }

  function limitOf(state) {
    return state.settings.dailyLoadLimit || 180;
  }

  /* Workload per day for a range, as a mutable map for simulation. */
  function loadMap(state, from, days) {
    const map = {};
    for (let i = 0; i < days; i++) {
      const d = global.Utils ? Utils.addDays(from, i) : null;
      if (d) map[d] = Priority.workloadOn(state, d).total;
    }
    return map;
  }

  /*
   * Suggest moves for overloaded days: undone study sessions are relocated to
   * the lightest feasible day — after today, not a break day, still before the
   * parent assignment's due date, and not itself overloaded. Suggestions are
   * simulated sequentially so several moves never pile onto the same day.
   */
  function suggestDistribution(state, todayArg) {
    const today = todayArg || Utils.todayStr();
    const limit = limitOf(state);
    const horizon = 14;
    const loads = loadMap(state, today, horizon + 7);
    const suggestions = [];

    const heavyDays = Object.keys(loads)
      .filter(d => d >= today && loads[d] > limit)
      .sort((a, b) => loads[b] - loads[a]);

    heavyDays.forEach(day => {
      const entries = Priority.sessionsOn(state, day)
        .filter(e => !e.session.done && (!e.task.dueDate || e.task.dueDate >= day))
        .sort((a, b) => b.session.durationMin - a.session.durationMin);

      entries.forEach(({ session: s, task: t }) => {
        if (loads[day] <= limit) return;
        if (suggestions.some(g => g.sessionId === s.id)) return;
        const due = t.dueDate;
        const latest = due && due > day ? Utils.diffDays(due, day) - 1 : 7;
        if (latest < 1) return;
        let best = null;
        for (let i = 1; i <= Math.min(latest, horizon + 6); i++) {
          const cand = Utils.addDays(day, i);
          if (cand >= today && isBreakDay(state, cand)) continue;
          const candLoad = loads[cand] != null ? loads[cand] : limit;
          if (candLoad + s.durationMin > limit && !(best && loads[best] > candLoad)) continue;
          if (!best || candLoad < loads[best]) best = cand;
        }
        if (!best || loads[best] + s.durationMin > limit) return;
        suggestions.push({
          taskId: t.id, sessionId: s.id,
          taskTitle: t.title, objective: s.objective,
          durationMin: s.durationMin,
          fromDate: day, toDate: best,
          fromLoad: loads[day], toLoad: loads[best] + s.durationMin
        });
        loads[day] -= s.durationMin;
        loads[best] += s.durationMin;
      });
    });

    return suggestions.slice(0, 12);
  }

  /*
   * Smart rescheduling: overdue open tasks get a realistic new due date
   * (the lightest of today + next 3 non-break days); missed undone sessions
   * move to the lightest day before the assignment's due date.
   */
  function suggestReschedule(state, todayArg) {
    const today = todayArg || Utils.todayStr();
    const limit = limitOf(state);
    const loads = loadMap(state, today, 7);
    const suggestions = [];

    const lightestDay = (fromOffset, untilDate) => {
      let best = null;
      for (let i = fromOffset; i <= fromOffset + 3; i++) {
        const cand = Utils.addDays(today, i);
        if (untilDate && cand > untilDate) break;
        if (isBreakDay(state, cand)) continue;
        if (!best || loads[cand] < loads[best]) best = cand;
      }
      return best;
    };

    Priority.overdueTasks(state, today).forEach(t => {
      const target = lightestDay(0, null);
      if (!target) return;
      suggestions.push({
        kind: 'task', taskId: t.id, title: t.title,
        fromDate: t.dueDate, toDate: target,
        fromLoad: null, toLoad: (loads[target] || 0) + (t.estimateMin || 0)
      });
      loads[target] = (loads[target] || 0) + (t.estimateMin || t.durationMin || 0);
    });

    const seenTasks = new Set(suggestions.map(s => s.taskId));
    state.tasks.forEach(t => {
      if (t.status === 'completed') return;
      (t.sessions || []).forEach(s => {
        if (s.done || s.date >= today || seenTasks.has(t.id)) return;
        const latest = t.dueDate && t.dueDate > today ? Utils.diffDays(t.dueDate, today) : 3;
        const target = lightestDay(0, Utils.addDays(today, Math.max(0, Math.min(latest, 6))));
        if (!target) return;
        suggestions.push({
          kind: 'session', taskId: t.id, sessionId: s.id,
          title: t.title, objective: s.objective, durationMin: s.durationMin,
          fromDate: s.date, toDate: target,
          fromLoad: null, toLoad: (loads[target] || 0) + s.durationMin
        });
        loads[target] = (loads[target] || 0) + s.durationMin;
      });
    });

    return suggestions.slice(0, 12);
  }

  function applySuggestion(sug) {
    if (sug.kind === 'task') {
      const t = Store.getTask(sug.taskId);
      if (t) Store.saveTask({ ...t, dueDate: sug.toDate });
    } else {
      Store.moveSession(sug.taskId, sug.sessionId, sug.toDate);
    }
  }

  /* ---- Assignment templates ---- */

  const TEMPLATES = [
    {
      id: 'homework', name: 'Homework set', icon: '📝', type: 'homework', estimateMin: 45,
      subtasks: ['Read the instructions', 'Complete the problems', 'Check answers & corrections'],
      sessions: [{ offset: -1, share: 1, objective: 'Work through the set' }]
    },
    {
      id: 'essay', name: 'Essay', icon: '✍️', type: 'essay', estimateMin: 240,
      subtasks: ['Thesis & outline', 'Research & sources', 'First draft', 'Revise & proofread'],
      sessions: [
        { offset: -6, share: 0.2, objective: 'Thesis + outline' },
        { offset: -4, share: 0.25, objective: 'Research & gather quotes' },
        { offset: -2, share: 0.35, objective: 'Write first draft' },
        { offset: -1, share: 0.2, objective: 'Revise & proofread' }
      ]
    },
    {
      id: 'lab', name: 'Lab report', icon: '🧪', type: 'lab', estimateMin: 120,
      subtasks: ['Method & setup notes', 'Results & graphs', 'Error analysis', 'Conclusion'],
      sessions: [
        { offset: -3, share: 0.4, objective: 'Results + graphs' },
        { offset: -1, share: 0.6, objective: 'Analysis + conclusion' }
      ]
    },
    {
      id: 'project', name: 'Project', icon: '📊', type: 'project', estimateMin: 300,
      subtasks: ['Define scope', 'Research', 'Build / create', 'Review & polish', 'Prepare submission'],
      sessions: [
        { offset: -7, share: 0.2, objective: 'Scope + research' },
        { offset: -4, share: 0.35, objective: 'Main build / writing' },
        { offset: -2, share: 0.3, objective: 'Finish & polish' },
        { offset: -1, share: 0.15, objective: 'Final review + submit' }
      ]
    },
    {
      id: 'test-prep', name: 'Test / exam prep', icon: '🧠', type: 'test', estimateMin: 180,
      subtasks: ['Collect topics & materials', 'Practice problems', 'Flashcards / summary', 'Past paper under time'],
      sessions: [
        { offset: -5, share: 0.3, objective: 'Topics + weak areas' },
        { offset: -3, share: 0.3, objective: 'Practice problems' },
        { offset: -1, share: 0.4, objective: 'Past paper + review' }
      ]
    },
    {
      id: 'reading', name: 'Reading assignment', icon: '📖', type: 'reading', estimateMin: 60,
      subtasks: ['Read the material', 'Take notes / annotate'],
      sessions: [{ offset: -1, share: 1, objective: 'Read + notes' }]
    }
  ];

  /* Build task fields from a template. Sessions are spread relative to the due
     date (offset in days before it), skipping break days by shifting earlier. */
  function buildFromTemplate(tplId, opts) {
    const tpl = TEMPLATES.find(t => t.id === tplId);
    if (!tpl) return null;
    const o = opts || {};
    const due = o.dueDate;
    const today = o.today || Utils.todayStr();
    const sessions = [];
    tpl.sessions.forEach(sp => {
      let date = due ? Utils.addDays(due, sp.offset) : null;
      if (date) {
        let guard = 0;
        while (date && date <= today && guard++ < 14) date = Utils.addDays(date, 1);
        while (date && isBreakDay(o.state || Store.get(), date) && guard++ < 28) date = Utils.addDays(date, -1);
        if (date && date <= today) date = null;
      }
      if (date) {
        sessions.push({
          date,
          time: null,
          durationMin: Math.max(15, Math.round((tpl.estimateMin * sp.share) / 5) * 5),
          objective: sp.objective,
          done: false
        });
      }
    });
    return {
      title: o.title || tpl.name,
      assignmentType: tpl.type,
      estimateMin: tpl.estimateMin,
      dueDate: due || null,
      classId: o.classId || null,
      priority: o.priority || 'medium',
      subtasks: tpl.subtasks.map(title => ({ title, done: false })),
      sessions
    };
  }

  const Planner = {
    isBreakDay, breakOn, limitOf, loadMap,
    suggestDistribution, suggestReschedule, applySuggestion,
    TEMPLATES, buildFromTemplate
  };

  global.Planner = Planner;
  if (typeof module !== 'undefined' && module.exports) module.exports = Planner;
})(typeof window !== 'undefined' ? window : globalThis);
