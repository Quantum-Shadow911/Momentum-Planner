# ⚡ Momentum — All-in-One Productivity Planner

A fully interactive personal planner that combines a to-do list, digital calendar, daily/weekly planner, project manager, goals tracker and productivity dashboard. **Zero runtime dependencies** — plain HTML/CSS/JS with localStorage persistence.

## Run it

```bash
npm start          # serves at http://localhost:4173 (zero-dep Node server)
```

…or open `index.html` directly in a browser, or host the folder statically (works on GitHub Pages).

```bash
npm test           # run the 48-test suite (Vitest + jsdom)
npm run test:watch
```

## Feature map

| Area | What's included |
|---|---|
| **Dashboard** | Greeting + date, stat tiles (due today / overdue / completed / overall progress), ✨ recommended next task with reasoning, today's schedule, overdue & in-progress panels, upcoming deadlines, next-4-days preview, inline quick-add |
| **Task management** | Create / edit / duplicate / delete / complete; description, start & due dates, scheduled time, duration, priority (Low→Urgent), status, category, tags, estimate vs. actual time, subtask checklists, recurrence (daily / weekdays / weekly / biweekly / monthly with interval), reminders, reference links, dependencies, notes; search, 5 sort orders, combined filters; completed tasks move to a collapsible history |
| **Planning views** | Daily (hour-by-hour grid, drag to reschedule), Weekly (7-day board, drag between days), Monthly calendar (deadline highlighting, day dialog), Agenda (chronological groups incl. overdue & undated), Kanban (4 status columns with drag & drop) — all synchronized through a single store |
| **Categories** | 9 seeded categories; full CRUD with icon + color picker |
| **Smart prioritization** | Weighted scoring: deadline proximity, overdue boost, assigned priority, in-progress momentum, quick-win bonus, long-task drag for far-out work, dependency blocking (blocked tasks are never recommended) |
| **Projects & goals** | Milestones with due dates, linked tasks, auto-calculated progress, status/priority, links & notes; goals with milestone progress and target dates |
| **Analytics** | 14-day completion trend (line), overall completion (donut), category & project progress (bars), completion-by-weekday history, open-tasks-by-priority — all computed from real saved data |
| **Reminders** | Per-task reminder times + app-wide default; in-app toasts always; real device notifications only after explicit browser permission (status shown honestly in Settings) |
| **Notes** | Colored, pinnable notes searchable across titles/bodies, linkable to tasks and projects |
| **Data reliability** | Autosave to localStorage on every change, schema validation on load, 5 rolling automatic snapshots with one-click restore, JSON export/import, trash with restore for every item type, "delete all" behind confirmation |

## Keyboard shortcuts

- `Ctrl/Cmd + K` — global search (tasks, projects, goals, notes, categories)
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
js/charts.js          dependency-free canvas charts
js/reminders.js       in-app + device notification scheduler
js/ui.js              toasts, modals, task editor, shared task item renderer
js/views/*.js         one module per view (dashboard, tasks, daily, weekly,
                      monthly, agenda, kanban, projects, goals, analytics,
                      notes, settings)
js/app.js             router, nav, theme, global search, seed data
tests/                Vitest unit tests + full-app jsdom smoke test
```

All data stays on your device — nothing is sent anywhere.
