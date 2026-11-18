Each block can be merged on its own and leaves the system working. Blocks 1–3 are the urgent base fix and ship first (verify with 11.5 right after); blocks 4–11 ship behind the `agent.triggerTaskWait` setting. Tests sit next to the code they cover.

## 1. Base fix: trigger starts a turn (D1, D2)

- [x] 1.1 `src/agent/deliverTriggerPrompt.ts`: `excluded_from_cursor: false`, `author: null` (keep `message_type: 'trigger'`, result ref and wake_up event)
- [x] 1.2 `src/agent/deliverWatch.ts`: same flags, keep `message_type: 'wake_up'`; leave `deliverWakes.ts` unchanged
- [x] 1.3 Update `wake.test.ts` and `triggers.test.ts` for the new flag and null author
- [x] 1.4 Worker test: a one-shot wake on an idle agent produces a model call with the prompt; cursor advances past it
- [x] 1.5 Worker test: a cron tick on an idle agent produces a turn
- [x] 1.6 Worker test: a trigger delivered mid-run that is not consumed causes a follow-up turn
- [x] 1.7 Worker test: legacy watch (`deliverWatch`) ready/timeout produces a turn
- [x] 1.8 Keep `triggerPause.unit.test.ts` green: stopped/archived agents get no prompt and no turn

## 2. Side effects of cursor-visible triggers (D4)

- [x] 2.1 `agent/message.ts`: skip trigger rows when looking up the previous hop
- [x] 2.2 Test: a trigger between agent messages does not reset the hop
- [x] 2.3 Test: with two users a trigger prompt has no user-name prefix (`auth/attributeMessages`)
- [x] 2.4 Test: trigger with an active goal runs an ordinary turn (`ordinary_input`)
- [x] 2.5 Test: `goal/continuationAdmit` and `goal/externalResume` defer while a trigger prompt is pending
- [x] 2.6 Review `agent/unpark.ts`, `acceptMessage.ts`, last-message DB trigger, `statusLineForTurn`, `statsData`; adjust tests if needed

## 3. Watch result in the prompt

- [x] 3.1 Verify only: `processTrigger` already calls `resultStore.prepare` with `inlineLimit: 16_000` and handles preview/storage failure; check that `deliverTriggerPrompt` actually puts the inline result into the model-visible prompt (not only into the event), fix if not
- [x] 3.2 Test at exactly the limit: prompt plus full result in the actual model request
- [x] 3.3 Test just above the limit: preview plus a reference that `readResult` resolves
- [x] 3.4 Test storage failure: preview plus notice, no invalid reference

## 4. Idempotent delivery and coalescing (D5 part, D6)

- [x] 4.1 Migration: `agent_trigger_deliveries` table (D5); extend `agent_trigger_runs.outcome` CHECK with `coalesced` and `invalidated`
- [x] 4.2 Firing key = `next_at` at claim for all kinds (not the claim token); `clientRequestId = "trigger:<id>:<firing_key>"`; delivery row with `ON CONFLICT DO NOTHING` in the append transaction
- [x] 4.3 Test: retry and worker restart mid-delivery give exactly one prompt and one turn
- [x] 4.4 Coalescing: skip appending while the trigger has a `pending` delivery; advance schedule; audit `coalesced`
- [x] 4.5 Mark delivery `consumed` when the cursor passes its message after a successful turn
- [x] 4.6 Test: several cron ticks while stopped/quota-parked give one pending prompt and one turn after resume

## 5. Task binding at creation (D3 creation, D5 part, D8)

- [x] 5.1 Migration: `agent_triggers.task_reservation_id` and index
- [x] 5.2 Bind `wake`, `cron`, `watch` only for a self-targeted call by the executing child under a live grant; write `reservation_id` into the delivery row
- [x] 5.3 Test: UI, cross-agent and pre-migration triggers stay unbound
- [x] 5.4 Limits: at most 5 armed bound triggers per task; bound cron interval at least 1 minute
- [x] 5.5 Test: sixth bound trigger and sub-minute bound cron are rejected

## 6. Admission of bound firings (D3 delivery and consumption)

- [x] 6.1 `goal.delegationConsume`: beyond the frontier admit only rows with a valid `pending` delivery of this reservation; the frontier itself never moves
- [x] 6.2 `agent.buildLlmRequest` (including steering): show the model only authorised rows
- [x] 6.3 Worker cursor: never advance past an unauthorised row
- [x] 6.4 Test: human, cross-agent, old-task and unbound triggers do not resume a delegated child
- [x] 6.5 Test: a human message before admission and during a turn is neither shown nor skipped
- [x] 6.6 Gate bound resume on `goal.enabled` and the `agent.triggerTaskWait` setting (default off); with it off, triggers are never bound

## 7. Waiting state (D3 waiting, D5 part)

- [x] 7.1 Migration: `task_state` CHECK with `waiting` and `blocked`; `blocked_reason`, `blocked_at`
- [x] 7.2 Settlement: successful turn + armed bound trigger or pending firing + unfinished task → `waiting`, release claim, schedule nothing
- [x] 7.3 A valid firing takes a fresh claim under the same reservation; after the last firing, settle normally
- [x] 7.4 Explicit `finishTask` wins over an armed trigger
- [x] 7.5 Test for `wake`, `cron`, `watch`: create → end turn → wait → fire → resume the same task; check model input and cursor
- [x] 7.6 Test: wait survives worker restart; retry does not consume a firing; a second cron/edge-watch firing resumes again
- [x] 7.7 `goal/externalApply.ts`, `externalClear.ts`, `externalResume.ts`: treat `waiting` and `blocked` as outstanding (add to `task_state IN (...)`)
- [x] 7.8 Test: a parent goal with a waiting or blocked child is not completed or cleared

## 8. Lock order and end of task (D7, D3 end of task)

- [x] 8.1 Apply the lock order agents → reservations → triggers → deliveries in delivery, admission, settle, cancel, timeout, `finishTask`, task cancel, revoke
- [x] 8.2 On finish, cancel or revoke: disarm bound triggers (including recurring), mark pending deliveries `invalidated`
- [x] 8.3 Test per trigger kind: finish, cancel and revoke stop further model calls, including an already queued firing
- [x] 8.4 Test race: delivery and `finishTask`/cancel/revoke concurrently — no deadlock, firing either consumed before or invalidated with no turn

## 9. Blocked when the last trigger is gone

- [x] 9.1 On single and bulk trigger cancellation: block a waiting task if no armed bound trigger and no pending firing remain; reason `trigger_cancelled`
- [x] 9.2 Same on watch timeout without `onTimeoutPrompt`; reason `watch_timed_out`
- [x] 9.3 Test: blocked with the right reason before and after restart; task unfinished; no model call
- [x] 9.4 Test: another armed trigger or pending firing → not blocked; timeout with a prompt still resumes

## 10. Parent visibility (D9)

- [x] 10.1 `agent.team` and task status: `taskState`, `blockedReason`, `blockedAt`, armed trigger count
- [x] 10.2 Test: parent sees `waiting` for a waiting child and `blocked` with the reason after restart

## 11. Migration safety and rollout

- [x] 11.1 Down step: waiting tasks → `blocked` with `rollback`; bound triggers paused
- [x] 11.2 Test on existing data: old triggers stay unbound, old messages not replayed; down step works
- [x] 11.3 Run `bun test src/agent src/goal` and `ctx.fns.code.quality({})`
- [x] 11.4 Test: with `agent.triggerTaskWait` off, a delegated child's trigger stays unbound and behaves as after block 1
- [x] 11.5 After deploy, schedule a short `agent.wake` on each of two agents and confirm a new turn on both. The original second target (`yc`) was archived; the operator requested a new agent (`yu`) instead.

## Worktree verification

- Isolated Postgres and mock providers: `bun test --timeout 20000 ./src/agent ./src/goal` — 1,256 passed. This includes task-bound wake, cron and watch cycles, steering, retry, cancellation/revocation races and explicit task completion.
- `bun run test` — 3,837 passed, 12 skipped, 0 failed. Whole-project typecheck passed with the optional `opencode-go` plugin mounted for its imported model-provider test fixture.
- `code.quality({})` on the worktree index: 0 errors, 559 warnings. Strict metadata checks passed for changed runtime procedures.

## Post-deployment verification

- MauzCode restarted on `a9a8db68`. Startup recorded both `20390101000000_goal_task_waiting` and `20390101000001_trigger_task_binding` as applied.
- `yt`: one-shot `tr_01a1eebf-8ae7-7315-9f67-2f87a1c7d088` fired; a subsequent assistant response confirmed marker `smoke-ed443798-5263-45bb-969f-c9277a39c793`.
- `yu`: one-shot `tr_01a1eec4-dca9-7145-83b9-1020b2f0ec17` fired; the assistant replied `WAKE-REPLACEMENT-yu-A9A8DB68` in the new turn. No new trigger was created for archived agent `yc`.
