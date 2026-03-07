# NanoTask Production Readiness Audit

Date: 2026-03-07
Reviewer: Senior JavaScript Engineer (Automated Audit)

## 1) Critical Issues (must fix before production)

1. **Task completion flow can race and execute twice from the completion modal.**
   - The completion modal action handlers call `completeWithSubs(...)` directly with no in-flight lock or button disabling.
   - Double-clicks (or click both actions quickly) can run two async paths against the same `pendingCompleteId`, causing duplicate promoted tasks, repeated DB writes, and inconsistent subtask deletion/completion.
   - Files:
     - `main.js` (`btn-complete-all`, `btn-promote-subs` handlers).
     - `tasks.js` (`completeWithSubs`) has no idempotency guard.

2. **Automatic completion via subtasks bypasses XP/badges/activity pipelines.**
   - When all subtasks are checked, `toggleSubtask()` marks the parent task as done but does not call `awardXP('task_complete')`, `logActivity('task_completed')`, or `checkBadges('task_complete')`.
   - This creates inconsistent progression and badge trigger behavior versus `completeTask()`.
   - File: `tasks.js`.

3. **Completion path through `completeWithSubs()` also bypasses XP/badges/activity.**
   - The path that concludes a task via completion modal updates `done/completed_at` and closes flow without reward/badge updates.
   - This is a business-critical logic mismatch in production gameification logic and impacts user trust.
   - File: `tasks.js`.

## 2) Potential Bugs (should fix)

1. **Pomodoro completed sessions are not persisted to profile stats.**
   - `pomodoroState.sessions` increments in-memory, but `state.profile.pomo_sessions` (used by profile stats) is not updated/persisted.
   - Profile screen may show stale pomodoro count.
   - Files: `pomodoro.js`, `profile.js`.

2. **`Notification.requestPermission()` lacks rejection handling.**
   - Uses `.then(...)` only; no `.catch(...)` branch for browser/runtime promise failures.
   - File: `pomodoro.js`.

3. **Event listeners are all registered at module load in `main.js` without element existence guards.**
   - Works with current static `index.html`, but any template drift/missing node will throw at startup (`Cannot read properties of null`).
   - File: `main.js`.

## 3) Code Smells (optional improvements)

1. **Circular dependency between `tasks.js` and `pomodoro.js`.**
   - Current behavior works with live bindings, but increases fragility and maintenance complexity.

2. **Dynamic imports used in hot click handler (`link-pomo`) and XP update path.**
   - Improves cycle safety but adds runtime indirection and harder traceability.

3. **Mixed responsibility in modules.**
   - `tasks.js` mixes persistence, side effects (toasts), pomodoro coupling, and gamification.

4. **Unused imports and dead references.**
   - e.g., `updatePomodoroUI` imported in `tasks.js` but not used; `state` imported in `notifications.js` but not used.

## 4) Performance Risks

1. **Frequent full `innerHTML` re-renders for task list.**
   - `renderTasks()` rebuilds whole grouped list each time; scales poorly with large task sets.

2. **Repeated filtering/count computations across render passes.**
   - `updateCounts()` and `renderSidebar()` repeatedly scan `state.tasks`, causing avoidable O(n*k) work.

3. **Per-second DOM querying in timer updates.**
   - `startTimerTick()` queries selector every tick; acceptable now, but can degrade with large DOM or multiple rapid view switches.

## 5) Security Risks

1. **Public Supabase anon key in frontend bundle.**
   - Typical for Supabase browser clients, but ensure strict RLS on all tables/buckets and validate policies for `profiles`, `tasks`, `subtasks`, `xp_events`, `user_badges`, and `avatars`.
   - File: `config.js`.

2. **User-controlled content injected into `innerHTML` in multiple render paths.**
   - Task titles/notes/tags and some profile strings are interpolated directly into HTML templates.
   - If server-side sanitization is not enforced, this can become XSS.

---

## Verdict

**Not production-safe yet.**

Primary blockers are completion-flow race conditions and inconsistent XP/badge accounting across completion pathways.
