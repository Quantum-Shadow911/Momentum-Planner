/* Momentum — AI tools: quiet helpers built into the planner, not a chatbot.
   Two layers:
   1. Built-in smart engine (always available, offline, deterministic, uses real planner data)
   2. Optional remote AI (bring your own key in Settings) that enhances the same tools
   AI output is always a preview — the user confirms before anything is saved. */
(function (global) {
  'use strict';

  /* ================= Configuration ================= */

  const DEFAULT_AI = { enabled: false, baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', apiKey: '' };

  function config() {
    let s = null;
    try { s = global.Store && Store.get() && Store.get().settings; } catch (e) { s = null; }
    const ai = (s && s.ai) || {};
    return {
      enabled: !!ai.enabled,
      baseUrl: (typeof ai.baseUrl === 'string' && ai.baseUrl.trim()) || DEFAULT_AI.baseUrl,
      model: (typeof ai.model === 'string' && ai.model.trim()) || DEFAULT_AI.model,
      apiKey: (typeof ai.apiKey === 'string' && ai.apiKey.trim()) || ''
    };
  }

  function isRemote() {
    const c = config();
    return !!(c.enabled && c.apiKey && c.baseUrl && typeof global.fetch === 'function');
  }

  function testConnection() {
    const c = config();
    if (!c.enabled) return Promise.reject(new Error('AI is turned off in Settings.'));
    if (!c.apiKey) return Promise.reject(new Error('Add your API key first.'));
    return remoteChat([{ role: 'user', content: 'Reply with exactly: ok' }], { maxTokens: 10 })
      .then(() => true);
  }

  function remoteChat(messages, opts) {
    const c = config();
    opts = opts || {};
    if (typeof global.fetch !== 'function') return Promise.reject(new Error('This browser cannot make network requests.'));
    return fetch(c.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.apiKey },
      body: JSON.stringify({ model: c.model, messages, temperature: 0.2, max_tokens: opts.maxTokens || 800 })
    }).then(r => {
      if (!r.ok) throw new Error('AI request failed (HTTP ' + r.status + ')');
      return r.json();
    }).then(d => {
      const txt = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
      if (!txt) throw new Error('Empty AI response');
      return txt;
    });
  }

  function extractJson(text) {
    const s = String(text || '');
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
  }

  /* ================= Natural-language task parsing (local, deterministic) ================= */

  const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function nextWeekday(from, target, forceNext) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    let diff = (target - d.getDay() + 7) % 7;
    if (diff === 0 && forceNext) diff = 7;
    d.setDate(d.getDate() + diff);
    return ymd(d);
  }

  function parseTaskText(text, state) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    const now = new Date();
    const today = ymd(now);
    const matched = [];
    let dueDate = null;
    let time = null;
    let priority = 'medium';
    let estimateMin = 0;
    let classId = null;
    let title = raw;

    /* due date */
    const consume = (re, fn) => {
      const m = re.exec(lower);
      if (m) { fn(m); matched.push(m[0]); title = title.replace(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ''); }
      return !!m;
    };
    const dateRe = '(?:due|by|on|before)?\\s*';
    consume(new RegExp(dateRe + 'today|tonight'), () => { dueDate = today; });
    if (!dueDate) consume(new RegExp(dateRe + 'tomorrow'), () => { dueDate = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)); });
    if (!dueDate) consume(new RegExp(dateRe + 'next week\\b'), () => { dueDate = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)); });
    if (!dueDate) consume(new RegExp(dateRe + 'in (\\d{1,2}) days?'), m => { dueDate = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + Number(m[1]))); });
    if (!dueDate) consume(new RegExp(dateRe + 'next (sunday|monday|tuesday|wednesday|thursday|friday|saturday)'), m => { dueDate = nextWeekday(now, WD.indexOf(m[1]), true); });
    if (!dueDate) consume(new RegExp(dateRe + '\\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\\b'), m => { dueDate = nextWeekday(now, WD.indexOf(m[1]), false); });
    if (!dueDate) {
      const monRe = new RegExp(dateRe + '\\b(' + MONTHS.join('|') + '|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.? (\\d{1,2})(?:st|nd|rd|th)?\\b');
      const m = monRe.exec(lower);
      if (m) {
        const monFull = MONTHS.find(mo => mo.startsWith(m[1].slice(0, 3)));
        let mo = MONTHS.indexOf(monFull);
        let yr = now.getFullYear();
        const day = Number(m[2]);
        if (new Date(yr, mo, day) < new Date(now.getFullYear(), now.getMonth(), now.getDate())) yr += 1;
        dueDate = yr + '-' + pad(mo + 1) + '-' + pad(day);
        matched.push(m[0]);
        title = title.replace(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '');
      }
    }

    /* time */
    consume(/\b(?:at|@) (\d{1,2})(?::(\d{2}))? ?(am|pm)\b/, m => {
      let h = Number(m[1]) % 12;
      if (m[3] === 'pm') h += 12;
      time = pad(h) + ':' + (m[2] || '00');
    });
    if (!time) consume(/\b(?:at|@) (\d{1,2}):(\d{2})\b/, m => { time = pad(Number(m[1]) % 24) + ':' + m[2]; });

    /* priority */
    if (/\burgent|asap\b/.test(lower)) { priority = 'urgent'; title = title.replace(/\b(urgent|asap)\b/i, ''); }
    else if (/\bhigh priority\b/.test(lower)) { priority = 'high'; title = title.replace(/\bhigh priority\b/i, ''); }
    else if (/\blow priority\b/.test(lower)) { priority = 'low'; title = title.replace(/\blow priority\b/i, ''); }

    /* duration */
    consume(/\bhalf an hour\b/, () => { estimateMin = 30; });
    if (!estimateMin) consume(/\b(\d{1,3}) ?\+? ?(?:hours?|hrs?|h)\b/, m => { estimateMin = Math.min(600, Number(m[1]) * 60); });
    if (!estimateMin) consume(/\b(\d{1,3}) ?(?:minutes?|mins?|m)\b/, m => { estimateMin = Math.min(600, Number(m[1])); });
    if (!estimateMin && /\ban hour\b/.test(lower)) { estimateMin = 60; title = title.replace(/\ban hour\b/i, ''); }

    /* class guess: a class whose name words appear in the text */
    try {
      const classes = (state && state.classes) || [];
      let best = null;
      classes.forEach(c => {
        const words = String(c.name || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
        if (!words.length) return;
        const hits = words.filter(w => lower.includes(w)).length;
        if (hits && (!best || hits > best.hits)) best = { c, hits };
      });
      if (best) classId = best.c.id;
    } catch (e) { classId = null; }

    title = title
      .replace(/\s*\b(due|by|on|before|at)\b\s*$/i, '')
      .replace(/\s*,\s*(?=\s*$)/, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.!?])/g, '$1')
      .trim();

    return {
      title: title || raw,
      dueDate,
      time,
      priority,
      estimateMin,
      classId,
      matched: matched.filter(Boolean)
    };
  }

  /* ================= Assignment breakdown (local templates + description clues) ================= */

  const BREAKDOWN_TEMPLATES = {
    homework: ['Read the instructions carefully', 'Do the problems / questions', 'Check your answers', 'Fix mistakes and finish up'],
    essay: ['Choose your topic and gather ideas', 'Research and take notes', 'Make an outline', 'Write the first draft', 'Revise and edit', 'Final read-through'],
    project: ['Plan the project and gather materials', 'Research and collect information', 'Build / create the main work', 'Assemble or practice the final version', 'Final check and submit'],
    lab: ['Review the lab procedure', 'Do the experiment and record data', 'Write up the results', 'Answer the analysis questions', 'Proofread and submit'],
    reading: ['Read the assigned pages or chapters', 'Take notes on key points', 'Summarize what you read'],
    revision: ['List the topics that will be covered', 'Review your notes and materials', 'Practice with example questions', 'Re-review the weakest topics'],
    'test-prep': ['List the topics that will be covered', 'Review your notes and materials', 'Practice with example questions', 'Re-review the weakest topics'],
    quiz: ['Review the relevant notes', 'Practice a few example questions', 'Quick final review'],
    test: ['List the topics that will be covered', 'Review your notes and materials', 'Practice with example questions', 'Re-review the weakest topics'],
    general: ['Understand exactly what is required', 'Gather materials and information', 'Do the main work', 'Review and finish']
  };

  function breakdown(task) {
    const t = task || {};
    const type = BREAKDOWN_TEMPLATES[t.assignmentType] ? t.assignmentType : 'general';
    const steps = BREAKDOWN_TEMPLATES[type].slice();
    const text = ((t.description || '') + ' ' + (t.notes || '')).toLowerCase();
    if (/present|presentation|speech/.test(text) && !steps.some(s => /present/i.test(s))) steps.push('Practice presenting');
    if (/diagram|drawing|illustrat/.test(text) && !steps.some(s => /diagram/i.test(s))) steps.splice(Math.min(2, steps.length), 0, 'Create or find diagrams');
    if (/worksheet/.test(text) && !steps.some(s => /worksheet/i.test(s))) steps.splice(1, 0, 'Complete the worksheet');

    const total = Number(t.estimateMin) || 0;
    const withMin = steps.map((title, i) => {
      const minutes = total ? Math.max(5, Math.round((total / steps.length) / 5) * 5) : (i === 0 ? 10 : 20);
      return { title, minutes };
    });

    /* spread into study sessions between today and the due date */
    const sessions = [];
    try {
      const state = global.Store && Store.get();
      const today = Utils.todayStr();
      const due = t.dueDate || null;
      if (state && due && due >= today) {
        const days = [];
        for (let d = today; d <= due; d = Utils.addDays(d, 1)) {
          if (!global.Planner || !Planner.isBreakDay(state, d)) days.push(d);
        }
        const usable = days.slice(0, Math.max(1, days.length - (due === today ? 0 : 1)));
        withMin.forEach((s, i) => {
          const date = usable.length ? usable[Math.min(usable.length - 1, Math.floor(i * usable.length / withMin.length))] : due;
          sessions.push({ date, durationMin: Math.min(45, Math.max(15, s.minutes)), objective: s.title });
        });
      }
    } catch (e) { /* sessions are optional */ }

    return { steps: withMin, sessions, source: 'built-in' };
  }

  function breakdownRemote(task) {
    const prompt = 'Break this school assignment into 3-6 short, concrete steps for a student. ' +
      'Respond ONLY with JSON: {"steps":[{"title":"...","minutes":15}]}. Minutes are integers (5-60). ' +
      'Assignment type: ' + (task.assignmentType || 'general') + '. Title: ' + (task.title || '') + '. Description: ' + (task.description || 'none');
    return remoteChat([{ role: 'user', content: prompt }]).then(txt => {
      const data = extractJson(txt);
      const steps = data && Array.isArray(data.steps)
        ? data.steps.map(s => ({ title: String(s && s.title || '').trim().slice(0, 200), minutes: Math.max(5, Math.min(120, Math.round(Number(s && s.minutes) || 20))) })).filter(s => s.title).slice(0, 8)
        : null;
      if (!steps || steps.length < 2) throw new Error('Unusable AI breakdown');
      return { steps, sessions: [], source: 'ai' };
    });
  }

  /* ================= Time estimation (local: type + description + history) ================= */

  const TYPE_BASE_MIN = { homework: 30, essay: 90, project: 120, lab: 60, reading: 45, revision: 45, 'test-prep': 60, quiz: 20, test: 60, general: 30 };

  function estimate(task, state) {
    const t = task || {};
    const type = TYPE_BASE_MIN[t.assignmentType] !== undefined ? t.assignmentType : 'general';
    let base = TYPE_BASE_MIN[type];
    const desc = String(t.description || '');
    if (desc.length > 200) base += 10;
    if (desc.length > 600) base += 20;

    /* history: average of actually-spent time on similar completed tasks */
    let historyBase = null;
    try {
      const done = ((state && state.tasks) || []).filter(x =>
        x.status === 'completed' && (x.manualMin || 0) + (x.sessions || []).filter(s => s.done).reduce((n, s) => n + s.durationMin, 0) > 0 &&
        (x.assignmentType === t.assignmentType || (t.classId && x.classId === t.classId)));
      const mins = done.map(x => x.actualMin || x.manualMin || 0).filter(n => n > 0);
      if (mins.length) historyBase = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
    } catch (e) { historyBase = null; }

    const anchor = historyBase && historyBase >= 5 ? Math.round((historyBase + base) / 2) : base;
    const lo = Math.max(5, Math.round(anchor * 0.8 / 5) * 5);
    const hi = Math.max(lo + 5, Math.round(anchor * 1.25 / 5) * 5);
    const split = type === 'essay'
      ? [{ label: 'Research', minutes: Math.round(anchor * 0.3) }, { label: 'Writing', minutes: Math.round(anchor * 0.5) }, { label: 'Reviewing', minutes: Math.round(anchor * 0.2) }]
      : [{ label: 'Setup', minutes: Math.round(anchor * 0.2) }, { label: 'Main work', minutes: Math.round(anchor * 0.6) }, { label: 'Review', minutes: Math.round(anchor * 0.2) }];
    return { lo, hi, anchor, split, fromHistory: !!historyBase, historyCount: historyBase ? 1 : 0, source: 'built-in' };
  }

  /* ================= Study kit generator (local extraction from description/notes) ================= */

  const STOPWORDS = new Set(('the a an and or but if then of to in on for with is are was were be been being it its this that these those as at by from not you your i we they he she them his her their our my me will would can could should about into over under more most some any each which who whom what when where how why all also than very just so no nor only own same too then once here there do does did doing have has had having'.split(' ')));

  function sentences(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  function studyKit(task) {
    const t = task || {};
    const source = String(t.description || '') + ' ' + String(t.notes || '');
    const sents = sentences(source);
    if (!sents.length) return null;

    /* definitions: "X is/are/means Y", "X: Y", "X — Y" */
    const flashcards = [];
    sents.forEach(s => {
      let m = /^([A-Z][\w\s'()-]{2,60}?)\s+(?:is|are|means|refers to)\s+(.{10,240})$/.exec(s);
      if (!m) m = /^([\w\s'()-]{2,60}?)\s*[:—–-]\s*(.{10,240})$/.exec(s);
      if (m) {
        const front = m[1].trim().replace(/^(the|a|an)\s+/i, '');
        const back = m[2].trim().replace(/[.]$/, '');
        if (front && back && front.split(' ').length <= 8) flashcards.push({ front, back });
      }
    });

    /* key concepts: most frequent meaningful words */
    const freq = new Map();
    String(source).toLowerCase().split(/[^a-z0-9']+/).forEach(w => {
      if (w.length < 4 || STOPWORDS.has(w)) return;
      freq.set(w, (freq.get(w) || 0) + 1);
    });
    const concepts = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);

    /* cloze flashcards for concepts without definitions */
    concepts.forEach(c => {
      if (flashcards.length >= 10) return;
      const s = sents.find(x => x.toLowerCase().includes(c) && x.length > 25 && x.length < 220);
      if (s && !flashcards.some(f => f.back === s)) {
        const re = new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        flashcards.push({ front: s.replace(re, '_____'), back: c });
      }
    });

    /* quiz: multiple choice from definitions + cloze */
    const quiz = [];
    flashcards.slice(0, 6).forEach((fc, i) => {
      const others = flashcards.filter((_, j) => j !== i).map(f => f.back).filter(b => b !== fc.back);
      const choices = [fc.back];
      others.forEach(o => { if (choices.length < 4 && !choices.includes(o)) choices.push(o); });
      let n = 1;
      while (choices.length < 4 && concepts[choices.length - 1 + n]) { const c = concepts[(choices.length + n) % Math.max(1, concepts.length)]; if (c && !choices.includes(c)) choices.push(c); n++; }
      if (choices.length >= 3) {
        const answerIdx = 0;
        for (let k = choices.length - 1; k > 0; k--) { const j = (i * 7 + k * 3) % (k + 1); const tmp = choices[k]; choices[k] = choices[j]; choices[j] = tmp; }
        quiz.push({ q: fc.front.length < 8 ? 'What matches \u201c' + fc.front + '\u201d?' : fc.front.endsWith('?') ? fc.front : 'What is \u201c' + fc.front + '\u201d?', choices, answer: choices.indexOf(fc.back) });
      }
    });

    const summary = sents.slice(0, 3).join(' ').slice(0, 400);
    return {
      flashcards: flashcards.slice(0, 12),
      quiz: quiz.slice(0, 6),
      summary,
      concepts,
      createdAt: new Date().toISOString(),
      source: 'built-in'
    };
  }

  function studyKitRemote(task) {
    const prompt = 'Create a study kit for a student from this material. Respond ONLY with JSON: ' +
      '{"summary":"2-3 sentence summary","concepts":["key term"],"flashcards":[{"front":"question or term","back":"answer or definition"}],"quiz":[{"q":"question","choices":["a","b","c","d"],"answer":0}]} ' +
      'Max 8 flashcards and 4 quiz questions; answer is the 0-based index. Material:\n' +
      ((task.description || '') + '\n' + (task.notes || '')).slice(0, 3000);
    return remoteChat([{ role: 'user', content: prompt }], { maxTokens: 1200 }).then(txt => {
      const d = extractJson(txt);
      if (!d) throw new Error('Unusable AI study kit');
      const kit = {
        summary: String(d.summary || '').slice(0, 1000),
        concepts: Array.isArray(d.concepts) ? d.concepts.map(c => String(c).slice(0, 80)).filter(Boolean).slice(0, 10) : [],
        flashcards: Array.isArray(d.flashcards) ? d.flashcards.map(c => ({ front: String(c && c.front || '').slice(0, 200), back: String(c && c.back || '').slice(0, 500) })).filter(c => c.front && c.back).slice(0, 12) : [],
        quiz: Array.isArray(d.quiz) ? d.quiz.map(q => {
          const choices = Array.isArray(q && q.choices) ? q.choices.map(c => String(c).slice(0, 200)).slice(0, 6) : [];
          const answer = Math.max(0, Math.min(choices.length - 1, Math.round(Number(q && q.answer) || 0)));
          return { q: String(q && q.q || '').slice(0, 300), choices, answer };
        }).filter(q => q.q && q.choices.length >= 2).slice(0, 8) : [],
        createdAt: new Date().toISOString(),
        source: 'ai'
      };
      if (!kit.flashcards.length && !kit.quiz.length && !kit.summary) throw new Error('Empty AI study kit');
      return kit;
    });
  }

  /* ================= Writing feedback (local checks) ================= */

  function writingFeedback(text) {
    const src = String(text || '').trim();
    if (!src) return { issues: [], wordCount: 0, ok: true };
    const sents = sentences(src);
    const words = src.split(/\s+/).filter(Boolean);
    const issues = [];

    const dbl = /\b(\w+)\s+\1\b/i.exec(src);
    if (dbl) issues.push({ icon: '\u270d', title: 'Repeated word', detail: '\u201c' + dbl[1] + ' ' + dbl[1] + '\u201d appears twice in a row \u2014 delete one.' });

    sents.forEach(s => {
      const n = s.split(/\s+/).length;
      if (n > 35) issues.push({ icon: '\u270d', title: 'Very long sentence', detail: '\u201c' + s.slice(0, 60) + '\u2026\u201d is ' + n + ' words \u2014 try splitting it into two.' });
    });

    sents.forEach(s => {
      if (!/^[A-Z\u201c"']/.test(s)) issues.push({ icon: '\u270d', title: 'Capitalization', detail: 'This sentence should start with a capital letter: \u201c' + s.slice(0, 50) + '\u2026\u201d' });
    });

    const counts = new Map();
    words.forEach(w => {
      const k = w.toLowerCase().replace(/[^a-z']/g, '');
      if (k.length < 5 || STOPWORDS.has(k)) return;
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    const over = [...counts.entries()].filter(e => e[1] > 3).sort((a, b) => b[1] - a[1])[0];
    if (over) issues.push({ icon: '\u270d', title: 'Overused word', detail: '\u201c' + over[0] + '\u201d is used ' + over[1] + ' times \u2014 try a synonym or reword a sentence.' });

    if (/\b(gonna|wanna|kinda|sorta|stuff|things)\b/i.test(src)) issues.push({ icon: '\u270d', title: 'Informal wording', detail: 'Words like \u201cgonna\u201d or \u201cstuff\u201d read as informal \u2014 school writing usually sounds better without them.' });
    if (/\ba lot of\b/i.test(src)) issues.push({ icon: '\u270d', title: 'Vague phrase', detail: '\u201cA lot of\u201d is vague \u2014 try a specific number or \u201cmany\u201d / \u201cseveral\u201d.' });

    const passive = /\b(was|were|is|are|been)\s+(\w+ed)\b/i.exec(src);
    if (passive) issues.push({ icon: '\u2139', title: 'Possible passive voice', detail: '\u201c' + passive[0] + '\u201d \u2014 active voice (\u201cX did Y\u201d) is usually clearer.' });

    if (words.length < 40) issues.push({ icon: '\u2139', title: 'Quite short', detail: 'Only ' + words.length + ' words \u2014 check whether the assignment asks for more development.' });
    if (sents.length && !/[.!?)\u201d"']$/.test(src)) issues.push({ icon: '\u270d', title: 'Missing end punctuation', detail: 'The text does not end with punctuation.' });

    return { issues: issues.slice(0, 8), wordCount: words.length, ok: issues.length === 0 };
  }

  /* ================= Weekly insights (computed from real planner data) ================= */

  function weeklyInsights(state, todayArg) {
    const today = todayArg || Utils.todayStr();
    const weekStart = Utils.startOfWeek(today, (state.settings && state.settings.weekStartsOn) || 1);
    const done = (state.tasks || []).filter(t => t.status === 'completed' && t.completedAt && t.completedAt.slice(0, 10) >= weekStart);
    const open = (state.tasks || []).filter(t => t.status !== 'completed');
    const overdue = open.filter(t => t.dueDate && t.dueDate < today);
    const dueSoon = open.filter(t => t.dueDate && t.dueDate >= today && t.dueDate <= Utils.addDays(today, 7));

    /* on-time rate among completed tasks with a due date */
    const withDue = done.filter(t => t.dueDate);
    const onTime = withDue.filter(t => t.completedAt.slice(0, 10) <= t.dueDate);
    const onTimeRate = withDue.length ? Math.round((onTime.length / withDue.length) * 100) : null;

    /* estimate accuracy */
    const measured = done.filter(t => t.estimateMin > 0 && (t.actualMin || 0) > 0);
    let estNote = null;
    if (measured.length) {
      const ratio = measured.reduce((n, t) => n + (t.actualMin / t.estimateMin), 0) / measured.length;
      if (ratio > 1.3) estNote = 'Tasks took noticeably longer than your estimates this week (' + Math.round(ratio * 100) + '% of the estimate on average).';
      else if (ratio < 0.7) estNote = 'You finished faster than estimated \u2014 you can plan a bit more per day.';
      else estNote = 'Your time estimates were accurate this week \u2014 nice planning.';
    }

    /* per-class completed counts */
    const byClass = new Map();
    done.forEach(t => {
      const cls = (state.classes || []).find(c => c.id === t.classId);
      const key = cls ? cls.name : 'Other';
      byClass.set(key, (byClass.get(key) || 0) + 1);
    });
    const topClass = [...byClass.entries()].sort((a, b) => b[1] - a[1])[0] || null;

    const wentWell = [];
    if (done.length) wentWell.push('You completed ' + done.length + ' task' + (done.length === 1 ? '' : 's') + ' this week.');
    if (topClass && topClass[1] > 1) wentWell.push('Most of your finished work was for ' + topClass[0] + ' (' + topClass[1] + ' tasks).');
    if (onTimeRate !== null && onTimeRate >= 80) wentWell.push(onTimeRate + '% of dated tasks were done by their deadline.');
    if (!wentWell.length) wentWell.push('A fresh week \u2014 completing even one small task builds the streak.');

    const improve = [];
    if (overdue.length) improve.push(overdue.length + ' task' + (overdue.length === 1 ? ' is' : 's are') + ' overdue \u2014 reschedule rather than ignore them.');
    if (estNote) improve.push(estNote);
    if (!improve.length) improve.push('Nothing is overdue and your estimates look healthy. Keep it up!');

    const suggestion = dueSoon.length >= 3
      ? 'You have ' + dueSoon.length + ' deadlines in the next 7 days \u2014 use \u2696 Balance workload in the Daily Planner to spread them out.'
      : overdue.length
        ? 'Start with the oldest overdue task; even 15 minutes shrinks the pile.'
        : 'Plan your study sessions for next week\u2019s deadlines before the weekend.';

    return {
      completed: done.length,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      onTimeRate,
      wentWell,
      improve,
      suggestion,
      source: 'built-in'
    };
  }

  function weeklyInsightsRemote(state, todayArg) {
    const local = weeklyInsights(state, todayArg);
    const facts = 'Completed this week: ' + local.completed + '. Overdue: ' + local.overdue + '. Due in 7 days: ' + local.dueSoon + '.' +
      (local.onTimeRate !== null ? ' On-time rate: ' + local.onTimeRate + '%.' : '') +
      ' Open tasks: ' + (state.tasks || []).filter(t => t.status !== 'completed').length + '.';
    const prompt = 'Write a short encouraging weekly study report for a student given ONLY these facts. Do not invent numbers. ' +
      'Respond ONLY with JSON: {"wentWell":["..."],"improve":["..."],"suggestion":"..."}. Facts: ' + facts;
    return remoteChat([{ role: 'user', content: prompt }]).then(txt => {
      const d = extractJson(txt);
      if (!d || !Array.isArray(d.wentWell) || !Array.isArray(d.improve)) throw new Error('Unusable AI insights');
      return {
        completed: local.completed, overdue: local.overdue, dueSoon: local.dueSoon, onTimeRate: local.onTimeRate,
        wentWell: d.wentWell.map(x => String(x).slice(0, 200)).filter(Boolean).slice(0, 4),
        improve: d.improve.map(x => String(x).slice(0, 200)).filter(Boolean).slice(0, 4),
        suggestion: String(d.suggestion || local.suggestion).slice(0, 300),
        source: 'ai'
      };
    }).catch(() => local);
  }

  /* ================= Smart schedule suggestions (local, respects school day + breaks) ================= */

  function suggestPlan(state, todayArg) {
    const today = todayArg || Utils.todayStr();
    const limit = (state.settings && state.settings.dailyLoadLimit) || 180;
    const plans = [];

    const open = (state.tasks || [])
      .filter(t => t.status !== 'completed' && t.dueDate && t.dueDate >= today && t.dueDate <= Utils.addDays(today, 13))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (b.priority === 'urgent') - (a.priority === 'urgent'));

    const remainingOf = t => {
      const doneMin = (t.sessions || []).filter(s => s.done).reduce((n, s) => n + s.durationMin, 0);
      return Math.max(0, (t.estimateMin || 45) - doneMin);
    };

    const dayLoad = {};
    const schoolEnd = dow => {
      const slots = (state.classes || []).flatMap(c => (c.slots || []).filter(s => s.day === dow));
      if (!slots.length) return null;
      return Math.max(...slots.map(s => Utils.minutesOf(s.end)));
    };

    open.forEach(t => {
      let remaining = remainingOf(t);
      if (!remaining) return;
      for (let d = today; d < t.dueDate && remaining > 0; d = Utils.addDays(d, 1)) {
        if (global.Planner && Planner.isBreakDay(state, d)) continue;
        if (dayLoad[d] === undefined) {
          const base = Priority.workloadOn(state, d).total;
          dayLoad[d] = base;
        }
        const dow = Utils.parseDate(d).getDay();
        const end = schoolEnd(dow);
        const capacity = Math.min(45, limit - dayLoad[d]);
        if (capacity < 15) continue;
        const chunk = Math.min(45, remaining, capacity);
        const startMin = end ? Math.min(20 * 60, end + 20) : 16 * 60;
        plans.push({
          taskId: t.id,
          taskTitle: t.title,
          date: d,
          time: Utils.hhmm(startMin),
          durationMin: chunk,
          objective: t.title.length > 40 ? t.title.slice(0, 40) + '\u2026' : 'Work on ' + t.title,
          classId: t.classId || null
        });
        dayLoad[d] += chunk;
        remaining -= chunk;
      }
    });

    return plans;
  }

  /* ================= Public API ================= */

  const AI = {
    config, isRemote, testConnection,
    parseTaskText,
    breakdown(task, state) {
      if (isRemote()) {
        return breakdownRemote(task).catch(() => breakdown(task));
      }
      return Promise.resolve(breakdown(task));
    },
    estimate,
    studyKit(task) {
      if (isRemote()) {
        return studyKitRemote(task).catch(() => {
          const kit = studyKit(task);
          return kit ? Promise.resolve(kit) : Promise.reject(new Error('No material to build a study kit from.'));
        });
      }
      const kit = studyKit(task);
      return kit ? Promise.resolve(kit) : Promise.reject(new Error('Add a description or notes first \u2014 the study kit is built from them.'));
    },
    writingFeedback,
    weeklyInsights(state, today) {
      if (isRemote()) return weeklyInsightsRemote(state, today);
      return Promise.resolve(weeklyInsights(state, today));
    },
    suggestPlan
  };

  global.AI = AI;
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
