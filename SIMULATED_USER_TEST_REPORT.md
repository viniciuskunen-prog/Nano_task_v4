# NanoTask Simulated User Test Report

Date: 2026-03-07
Method: Code-path simulation + targeted runtime safety checks
Scope: Task lifecycle, subtasks, completion modal, pomodoro integration, rapid interactions, state consistency, UI safety

## 1) Simulated user flow results

### 1.1 Task lifecycle
- ✅ Create task: `saveTask` insert path updates DB and prepends task to `state.tasks`.
- ✅ Edit task: `saveTask` update path mutates in-memory task and synchronizes subtasks.
- ✅ Delete task: `deleteTask` removes task from DB and from local state.
- ✅ Complete task: event action `toggle-done` -> `handleTaskCompletion` -> `completeTask`.
- ❌ Reopen task: UI path is blocked; clicking completed task returns `already_completed` toast and does not toggle done=false.

### 1.2 Subtasks flow
- ✅ Task with subtasks can be created/saved.
- ✅ Subtasks can be toggled one by one.
- ✅ When all subtasks are done, parent now completes via `completeTask(taskId)`.
- ✅ Parent completion through this path triggers the same XP/activity/badge pipeline (`awardXP`, `logActivity`, `checkBadges`) via `completeTask`.

### 1.3 Completion modal flow
- ✅ Pending-subtask path correctly opens modal.
- ✅ "Complete all" and "Promote subtasks" are serialized at UI level with `completeModalBusy` and button disabling.
- ✅ Domain-level guard (`completionInFlight`) prevents duplicate concurrent `completeWithSubs` execution for same task ID.
- ⚠️ If `completeTask` fails unexpectedly after subtask promotion inserts, partial side effects can exist (new promoted tasks created while parent may remain incomplete) because there is no transactional rollback.

### 1.4 Pomodoro integration
- ✅ Task can be linked/unlinked.
- ✅ Starting pomodoro prevents duplicate interval start (`if (pomodoroState.running) return`).
- ✅ Task timer tick clears old interval before new one (`clearInterval(timerInterval)`).
- ⚠️ Completing pomodoro requires real wall-clock duration (90% validity check), making deterministic automated simulation difficult without time controls.
- ⚠️ Deleting linked running task attempts reset/unlink path and should stop timers, but depends on async DB success ordering.

### 1.5 Rapid interaction simulation
- ✅ Double-clicking completion modal actions is now protected at UI + domain levels.
- ⚠️ Rapid repeated completion on same task via different UI surfaces may still rely on stale local state until async returns.
- ⚠️ Fast view switching while timer updates causes frequent full re-renders and selector queries; functionally stable but risk of UI flicker/perf degradation under heavy load.

### 1.6 State consistency
- ✅ `state.tasks` is updated on create/edit/delete/complete paths.
- ⚠️ Potential orphan subtasks at DB level on task deletion if backend FK cascade is not enforced (frontend only deletes parent task explicitly).
- ⚠️ Promote-subtasks flow can produce duplicates under retry/error-reentry conditions because no idempotency token exists for promotion inserts.

### 1.7 UI safety
- ❌ Multiple direct DOM bindings in `main.js` do not null-check target elements before `addEventListener`; any template drift can crash startup.
- ✅ Some modules use null-safe checks (`?.` or guard `if (el)`), but safety is inconsistent across app.

## 2) Failures detected

1. Reopen completed task is not possible through current UI flow (scenario requirement fails).
2. Unsafe startup DOM bindings can throw null reference errors if expected nodes are missing.

## 3) Edge cases discovered

1. Promotion flow is non-transactional: partial writes possible if later step fails.
2. Task deletion may leave orphan subtasks without DB cascade constraints.
3. Rapid view/timer interactions may degrade responsiveness due to full-list re-renders.

## 4) Recommended fixes

1. Add explicit "Reopen task" action that routes through a centralized `reopenTask()` pipeline (state + DB + side effects).
2. Wrap all top-level DOM event bindings with element existence guards (or use a helper `bind(id, event, fn)`).
3. Make `completeWithSubs(false)` transactional at backend level (RPC/transaction) or add compensating rollback on failure.
4. Enforce DB FK cascade (`subtasks.task_id -> tasks.id ON DELETE CASCADE`) and validate in migrations.
5. Add idempotency key for promoted subtask inserts to avoid duplicate creation on retries.
6. Reduce render churn (partial updates or memoized selectors) for timer/view rapid-switch paths.

## 5) Final verdict

**Not production ready.**

Main blockers are missing reopen-task behavior (required lifecycle), startup null-safety gaps in DOM bindings, and non-transactional promote-subtask path that can leave partial state under failure.
