## 1. Todo runtime namespace

- [ ] 1.1 Create `src/todo/create.ts`, `update.ts`, `done.ts`, `remove.ts` from `src/session/{plan,updatePlan,done,removePlan}.ts`, store under `scratchpad.todos`/`todoHistory`, and use `todo.*` error prefixes; `todo.create` keeps replacing an existing list without archiving and keeps `deferPublication` (used by `publishGoalDelegation.ts`); delete the old files
- [ ] 1.2 Move the extension point to `src/todo/$point_taskDone.ts` (`todo.taskDone`), add `active: string[]` to its payload next to `next`, and delete `src/session/$point_taskDone.ts`
- [ ] 1.3 Add parallel start: accept `status: "active"` for pending/new todos in `todo.update` and reject other values; enforce the order rule (no pending before active) in both `todo.create` and `todo.update`; return `active: string[]` from `todo.create`/`todo.update`
- [ ] 1.4 Change `todo.done` to auto-activate only when no todo is active, and return `active`, `next`, `complete` and `progress`
- [ ] 1.5 Add idempotent `todo.pause`/`todo.resume` that settle or restart every active todo and emit the `todos` section; classify the `todo` namespace in `coreCatalogue.ts` with only `todo.create/update/done/remove` granted to Standard
- [ ] 1.6 Rename the `refreshAgentMeta` section `plan` → `todos` and update all emitters

## 2. Consumers

- [ ] 2.1 Replace inline pause/resume with `todo.pause`/`todo.resume` in `agent/stop.ts`, `stopContextGuard.ts`, `retryMember.ts`, `run.ts`, `acceptMessage.ts` and `api/$route_v1_agents_$id_messages_POST.ts`; move the SQL pause guards to the `todos` key in `session/deliverInbound.ts` (`#>> '{plan,pausedAt}'`), `input/submit.ts`, `input/choiceBatch.ts` and `input/complete.ts` (`->'plan'->>'pausedAt'`)
- [ ] 2.2 Update `agent/team.ts` (member field `todos` and the "task plans" JSDoc), `finishTask.ts`, `steer.ts`, `delegate.ts`, `publishGoalDelegation.ts`, `sharedAgent/delegate.ts`, the `section: "plan"` refresh and `plan` wording in `steer.ts`, the `session.plan` comments in `goal/lifecycleFailure.ts` and `goal/lifecycleFailureStatus.ts`, and the "plans" comments in `session/fork.ts` and `session/save.ts`
- [ ] 2.3 Rename the team event `plan.completed` → `todos.completed` in `steer.ts` and `finishTask.ts`; keep displaying the old `plan.completed` and `plan_activation` types in `api/$route_v1_agents_$id_events_GET.ts`
- [ ] 2.4 Delete `agent/$route_$id_plan_POST.ts` and `planRoute.test.ts`; rewrite `humanResume.unit.test.ts`, which imports that route, against `todo.resume`
- [ ] 2.5 Add `agent/$route_$id_todos_GET.ts` reusing `goal.surfaceAuthorize` (401/403/404 as the persistent-goal GET); drop `plan` from the `metaSurface.ts` response

## 3. Migrations

- [ ] 3.1 Add `src/session/$migration_20380106120000_plan_to_todos.ts`: boot-only like `$migration_20330306120000_remove_legacy_scratchpad_results.ts` (refuse while agents are loaded, so `session.save` cannot write `plan` back); for every agent (including archived) cast the `TEXT` scratchpad to `jsonb`, move `plan`→`todos` and `planHistory`→`todoHistory` separately and only when present and the target is absent, never create null keys, skip and count invalid JSON, write back as text; add a `down` that swaps the keys back under the same rule
- [ ] 3.2 Add `src/agentPreset/$migration_20380106120000_todo_tools.ts` (id after all existing preset migrations) that rewrites the grants (`tools.planUpdate/planDone`, `session.plan/updatePlan/done/removePlan`) in `allow` and `deny` of factory presets, user presets and every snapshot layer, and adds the `todo.*` names next to covering wildcards (`session.*`, `*`); idempotent, no duplicates, forward-only (comment why, like the earlier preset migrations); update `coreCatalogue.ts`
- [ ] 3.3 Before merging, compare both migration ids with `main` and the worktrees in `../wt/` (especially `show-provider-client-version`) and bump them if another branch has a later or equal id; resolve overlaps in `coreCatalogue.ts` and `sharedAgent/delegate.ts`

## 4. Native tools

- [ ] 4.1 Rename `src/tools/planUpdate.ts` → `todoUpdate.ts` and `planDone.ts` → `todoDone.ts` (tools `todo_update`, `todo_done`) with `$tool_todo_update.md` and `$tool_todo_done.md`; add the optional `status` argument; change the `todo_update` result from `active: string | null` to `active: string[]`
- [ ] 4.2 Make `delegate_task` and `finish_task` create and check the child's todos

## 5. Prompts and docs

- [ ] 5.1 Rewrite the body and `requires` of `src/agent/$prompt_plans.md` to todos while keeping the file and section id `plans`; update `$prompt_delegation.md`, `fullSystemPrompt.ts` and `planning/prompt.ts` ("separate from todo tracking")
- [ ] 5.2 Rewrite the runtime system prompt section `Plans for non-trivial multi-step work` as `Todos for multi-step work` with `todo_update`/`todo_done`/`todo.*` (the section id `plans` stays), and regenerate the creator-prompt fixture
- [ ] 5.3 Update `docs/team-delegation.md` (also drop the outdated "Team section of the Meta panel" text: children's todos are seen in the child's chat dock and through `agent.team`), `continuous-context-compaction.md`, `agent-intent-goal-loop.md` and `planning-mode.md`, and the JSDoc that mentions plans in `goal/lifecycleFailure*.ts`, `agent/steer.ts` and `agent/retryMember.ts`

## 6. UI

- [ ] 6.1 Add `frontend/src/lib/todos.ts` (`getTodos`) and the types
- [ ] 6.2 Add `TodoDock.tsx` and `todo-dock.css` (collapsed/expanded, status markers, paused badge, instructions disclosure, accessible toggle) and place them in `LiveComposer` above `GoalDock`
- [ ] 6.3 Refresh the dock through `subscribeLive` on `ui.metaSection` (`todos`/`all` for the agent, not `team`) and on resync, with no polling
- [ ] 6.4 Remove the Meta "Plan" section and `plan` from `Snapshot` in `core-ui/agent-meta.tsx`; label `todos.completed` in `LifecycleRow` ("Задачи завершены", also used for the old `plan.completed`) while keeping the old `plan.completed` and `plan_activation` labels

## 7. Tests and verification

- [ ] 7.1 Port `plan.test`, `updatePlan.test`, `removePlan.test`, `planDelegation.test`, `tools.test`, `teamDelegation.test`, `stop*.test`, `humanResume`, `acceptMessage*`, `goalAutomationGuard.unit.test`, `presetPrompt.test` and `standardUpgrade.test` to todos; update the `plan`/`planHistory` fixtures in `legacyScratchpadMigration.test` and `resultRef.test` to the new keys
- [ ] 7.2 Add tests for parallel start (including the order rule and the rejected way back to pending), `active: string[]` in update/done results and the `todo.taskDone` payload, done auto-activation only with no active todo, pause/resume of several active todos, the SQL pause guards (a paused agent is not scheduled by an inbound message, an input answer, a batch answer or an input completion), `todo.create` over an existing list and with `deferPublication`, both migrations (idempotency, history-only agent, existing `todos` not overwritten, refusal when not at boot, scratchpad `down`, `deny` rewrite, `session.*` wildcard), an old `plan_update` call failing as an unknown tool that lists `todo_update`, and the todos GET route (own agent, null todos, 401, 403 for another owner, 404)
- [ ] 7.3 Add frontend `todo-dock.test.tsx` (hidden when empty or all done, counter, several active, expand, live refresh on `todos`/`all`, no refetch on `team`)
- [ ] 7.4 Confirm that `rg -n "scratchpad\??\.plan\b|planHistory|plan_update|plan_done|planUpdate|planDone|session\.(plan|updatePlan|removePlan|done|taskDone)\b|tools\.plan|section: ?['\"]plan['\"]|['\"]plan\.completed['\"]|MauzCode session\.plan|child plan|'plan'->|\{plan,|Plans for non-trivial|Plan panel" src frontend/src docs plugins` has no hits outside the exceptions listed in design decision 14 (migrations, their tests, history compat code, planning mode, the `plans` section id), and check the user plugin directory the same way
- [ ] 7.5 Run the full test suite, the frontend tests and `code.quality`; manually check that an agent's `todo_update` makes the dock appear and update live
- [ ] 7.6 Archive with the spec move: `native-plan-delegation` is emptied and deleted, `native-todo-delegation` is created
