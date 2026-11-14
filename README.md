# ⚡ Momentum — School-First Academic Planner

A fully interactive, school-first planner that combines an assignment tracker, class workspaces, study-session planner, digital calendar, daily workload planner, extracurricular schedule and productivity dashboard. **Zero runtime dependencies** — plain HTML/CSS/JS with localStorage persistence.

## Run it

```bash
npm start          # serves at http://localhost:4173 (zero-dep Node server)
```

…or open `index.html` directly in a browser, or host the folder statically (works on GitHub Pages).

```bash
npm test           # run the 143-test suite (Important Dates replaces the standalone Calendar nav item) (Vitest + jsdom)
npm run test:watch
```

## Feature map

| Area | What's included |
|---|---|
| **Dashboard** | School-portal layout — class period schedule panel on the left (with live “now” highlight), to-do list, exams & quizzes, important dates, activities, mini month calendar and next-days preview; auto day/night theme (dark at night, light in daytime); greeting + date, stat tiles (due today / assignments due soon / upcoming assessments / overdue), ✨ recommended next task with reasoning, today's priorities, today's planned study sessions (toggleable), overdue panel, upcoming deadlines, tests & quizzes ahead, extracurricular schedule, recently completed, next-4-days preview with ⚖ workload badges, inline quick-add (date optional — undated tasks land in the Inbox) |
| **My Classes** | Subject workspaces with teacher, room, icon & color, recurring class schedule slots; per-class view of assignments, upcoming tests, completed work, related notes and auto-calculated progress |
| **Assignments & study sessions** | Tasks support class, assignment type (homework / essay / project / lab / reading / revision / test-prep / quiz / test) and submission status (not started / working / ready / submitted — filterable); each assignment can carry multiple planned **study sessions** with date, time, duration and objective, toggleable from the dashboard, daily planner and task viewer |
| **Assignment templates** | One-click templates (homework, essay, lab report, project, exam prep, reading) that pre-fill type, checklist and a realistic session plan spread before the due date, skipping breaks |
| **Exams & Quizzes** | Dedicated view: every upcoming assessment grouped per class with countdown, revision sessions and minutes-revised tracking, one-click “＋ Revision session”, past/missed and recently completed sections |
| **Study timer** | Floating ⏱ timer (refresh-safe) started from any task; on finish it logs real minutes into the task's “time spent” |
| **Attachments** | Attach worksheets and instruction files (up to 2 MB each, stored locally in your browser) to any task; download from the task viewer |
| **School breaks** | Define holiday ranges in Settings; they are shaded in the calendar, flagged in the daily planner and skipped by workload balancing and smart rescheduling |
| **Task management** | Create / edit / duplicate / delete / complete; description, start & due dates, scheduled time, duration, priority (Low→Urgent), status, category, tags, estimate vs. actual time, subtask checklists, recurrence (daily / weekdays / weekly / biweekly / monthly — every option respects its interval), reminders, reference links, dependencies, notes; search, 5 sort orders, combined filters (incl. class & type); completed tasks move to a collapsible history |
| **Important Dates/Calendar** | Sidebar page embedding the full month calendar (replaces the standalone Calendar item) with your own custom important dates (add/edit/delete, shown on the calendar, dashboard and agenda), plus upcoming deadlines, tests & quizzes, activities and school breaks |
| **Planning views** | Daily (hour-by-hour grid with timed sessions, drag to reschedule, 🏫 class-schedule chips with live “now” highlight, ⚖ Balance workload), Monthly calendar (overdue vs. deadline highlighting, events + break shading in cells, day dialog), Agenda (chronological groups incl. events, overdue & undated) — all synchronized through a single store |
| **Smart scheduling** | ⚖ Balance workload: moves study sessions off overloaded days to the lightest feasible day (before the due date, skipping breaks) with an approve/reject dialog; ⚖ Smart reschedule: relocates overdue work and missed sessions to realistic new days; both never change anything without your approval |
| **Activities & events** | Dedicated events view for extracurriculars: icon, time range, location, category, notes; upcoming 30 days grouped by date with collapsible history; events appear alongside tasks in the calendar but behave differently (no completion, no priority) |
| **Recurring events** | Events can repeat daily / weekdays / weekly / biweekly / monthly (with interval) — shown with a 🔁 badge, expanded automatically across the calendar, daily planner, agenda and dashboard |
| **Weekly academic review** | One-click 📋 Weekly review on the dashboard: overdue work, deadlines and tests ahead, per-day workload bars vs. your limit, activities, and completed-this-week summary |
| **Conflict detection** | The daily planner warns when timed events, study sessions or timed tasks overlap |
| **Storage meter** | Settings shows how much of the ~5 MB browser storage is in use and counts attachments, warning near the limit |
| **Installable app (PWA)** | Install Momentum from the live site with its own icon and window: Mac Safari → Share → **Add to Dock**; Chrome/Edge → install icon in the address bar; iPhone/iPad → Share → **Add to Home Screen**. Works offline once installed (service worker with network-first updates). Instructions are also in Settings → Install as an app |
| **Login / accounts** | Built-in per-person accounts (no third-party logins): sign up with a name, username, email + password (min 4 characters), then sign in with your username **or** email + password. New accounts start completely fresh (no sample data — only the owner account keeps the built-in class schedule; sample data removed from other accounts on login, and "Load sample data" in the Danger zone keeps samples if you want them). Profiles created in earlier versions get a one-time "Finish setting up your account" prompt to pick a username + email (they can still sign in with their display name until then). Each account has fully separate data, and a 🔒 Lock button / Settings → Account details & change password controls access. Accounts can be deleted in Settings → Danger zone → Delete account (requires typing the name). Note: accounts are stored only in this browser — there's no server, no password reset, and no cross-device sync; it's a lock, not bank-grade security |
| **Save health** | Boot-time storage probe: a red banner explains how to fix blocked storage (private mode / cookies), a file:// banner points to the live site, and a "Saved HH:MM" indicator in the sidebar proves saving works |
| **Categories** | 9 seeded categories; full CRUD with icon + color picker |
| **Smart prioritization** | Weighted scoring: deadline proximity, overdue boost, assigned priority, in-progress momentum, quick-win bonus, long-task drag for far-out work, dependency blocking (blocked tasks are never recommended) |
| **Analytics** | 14-day completion trend (line), overall completion (donut), category & project progress (bars), per-class progress, study time trend (hours of completed sessions), 7-day workload chart with over-limit warnings, submission pipeline, completion-by-weekday history, open-tasks-by-priority — all computed from real saved data |
| **Reminders** | Per-task reminder times + app-wide default; in-app toasts always; real device notifications only after explicit browser permission (status shown honestly in Settings) |
| **Inbox** | Quick capture without deadlines: undated tasks collect in the Assignment Inbox until you schedule them |
| **Data reliability** | Autosave to localStorage on every change, schema validation on load, 5 rolling automatic snapshots with one-click restore, JSON export/import, trash with restore for every item type, "delete all" behind confirmation |

## Keyboard shortcuts

- `Ctrl/Cmd + K` — global search (tasks, events, categories)
- `Ctrl/Cmd + N` — quick add task
- `Esc` — close search / modal

## Architecture

```
index.html            app shell
css/styles.css        design system: light/dark tokens, components, responsive
js/utils.js           date math, formatting, escaping (tested)
js/storage.js         persistence, validation, backups, trash, import/export (tested)
js/store.js           central state + actions + pub/sub, recurrence engine (tested)
js/priority.js        smart scoring, recommended-next-task, shared selectors (tested)
js/planner.js         workload distribution, smart rescheduling, templates, breaks (tested)
js/timer.js           refresh-safe study timer (tested)
js/charts.js          dependency-free canvas charts
js/reminders.js       in-app + device notification scheduler
js/ui.js              toasts, modals, task editor, shared task item renderer
js/views/*.js         one module per view (dashboard, classes, exams,
                      tasks, daily, monthly, agenda,
                      activities, analytics, settings)
js/app.js             router, nav, theme, global search, seed data
tests/                Vitest unit tests + full-app jsdom smoke test
```

All data stays on your device — nothing is sent anywhere.
