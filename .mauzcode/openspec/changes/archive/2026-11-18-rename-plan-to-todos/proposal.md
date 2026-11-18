## Why

Agent task tracking is called "plan" (`plan_update`, `plan_done`, `session.plan`, `scratchpad.plan`), which collides with planning mode (`/plan`, `planning.enter`) in prompts, tools and UI. The tracked tasks are also only visible in the Meta panel, while users expect to see what the agent is working on right above the chat, as in deepseek-harness.

## What Changes

- **BREAKING** Rename agent task tracking from "plan" to "todos" everywhere: native tools `plan_update` → `todo_update` and `plan_done` → `todo_done`; runtime functions `session.plan/updatePlan/done/removePlan` → `todo.create/update/done/remove`; extension point `session.taskDone` → `todo.taskDone`; stored state `scratchpad.plan` → `scratchpad.todos`; live section `plan` → `todos`; team event `plan.completed` → `todos.completed` (whole delegated list finished; distinct from the per-step `task.completed`). The `plan_activation` message type has no successor: its only producer (the unused plan POST route) is removed. Old names are removed without aliases. The internal prompt section id `plans` is kept unchanged because presets and snapshots may reference it in `exclude_sections`.
- Migrate stored data: move every agent's `scratchpad.plan` (and `planHistory`) to the new keys (reversible), and rewrite tool/function grants (`allow` and `deny`) in factory presets, user presets and agent preset snapshots (forward-only; rollback by backup).
- Allow several todos to be active at once: an update can start a pending todo next to the current active one; completing a todo auto-activates the next pending one only when no todo remains active; stop, pause and resume act on every active todo. Results and the `todo.taskDone` payload report all active todos as a list (`active: string[]`). An active todo cannot be returned to pending.
- Add a read-only todo dock above the message input: collapsed it shows the active todo(s) and done/total progress, expanded it lists all todos with status and instructions; it is hidden when there are no todos or all are done, and it refreshes live.
- Add a read endpoint for an agent's todos, used by the dock.
- Remove the "Plan" section from the Meta tab and the `plan` field from its settings response.
- Update prompts and documentation to the todo vocabulary and state explicitly that todos are separate from planning mode.
- Old transcript events (`plan.completed`, `plan_activation`) keep rendering in history.
- Agent preset snapshots are rewritten by the migration. This is a deliberate exception to the rule that snapshots freeze rules: without it, existing agents would lose access to todo tracking.

## Capabilities

### New Capabilities
- `agent-todos`: the agent's durable todo list — data model, statuses, parallel active todos, completion and auto-activation, pause/resume, removal, live change notification, read endpoint and migration from the old plan state.
- `chat-todo-dock`: the read-only todo dock above the chat input — visibility, collapsed and expanded presentation, live refresh.
- `native-todo-delegation`: successor of `native-plan-delegation` — native tools `todo_update` (with parallel start and `active: string[]` in the result) and `todo_done`, rejection of the old tool names, plus `delegate_task`, `finish_task`, trusted binding and preset gating in the todo vocabulary.

### Modified Capabilities
- `native-plan-delegation`: retired. All its requirements move to `native-todo-delegation`; the old spec is deleted on archive.

## Impact

- Runtime: `src/session/{plan,updatePlan,done,removePlan}.ts` move to a new `src/todo/` namespace; consumers in `src/agent/` (run, acceptMessage, stop, stopContextGuard, retryMember, team, finishTask, steer, delegate, publishGoalDelegation, metaSurface, plan POST route), `src/sharedAgent/delegate.ts`, the SQL pause guards in `src/session/deliverInbound.ts` and `src/input/{submit,choiceBatch,complete}.ts`, `src/goal/lifecycleFailure*.ts`, `src/api/` messages and events routes, `src/events/refreshAgentMeta.ts`.
- Tools and presets: `src/tools/planUpdate.ts`, `planDone.ts`, their `$tool_*.md`, `src/agentPreset/coreCatalogue.ts`, a new preset migration and a new session scratchpad migration.
- Prompts and docs: `src/agent/$prompt_plans.md` (content and `requires` only; file and section id `plans` are kept), `$prompt_delegation.md`, `fullSystemPrompt.ts`, `src/planning/prompt.ts`, the runtime system prompt template, `docs/team-delegation.md`, `continuous-context-compaction.md`, `agent-intent-goal-loop.md`, `planning-mode.md`.
- Frontend: new `TodoDock` in `LiveComposer`, `lib/todos.ts`, removal of the "Plan" section in `core-ui/agent-meta.tsx`, `LifecycleRow` labels.
- Planning mode (`/plan`, `planning.*`) is not renamed. Users cannot edit todos from the UI.
