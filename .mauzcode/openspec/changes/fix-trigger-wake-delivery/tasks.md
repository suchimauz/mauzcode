Each block can be merged on its own and leaves the system working. Blocks 1–3 are the urgent base fix and ship first (verify with 11.5 right after); blocks 4–11 ship behind the `agent.triggerTaskWait` setting. Tests sit next to the code they cover.

## 1. Base fix: trigger starts a turn (D1, D2)

- [ ] 1.1 `src/agent/deliverTriggerPrompt.ts`: `excluded_from_cursor: false`, `author: null` (keep `message_type: 'trigger'`, result ref and wake_up event)
- [ ] 1.2 `src/agent/deliverWatch.ts`: same flags, keep `message_type: 'wake_up'`; leave `deliverWakes.ts` unchanged
- [ ] 1.3 Update `wake.test.ts` and `triggers.test.ts` for the new flag and null author
- [ ] 1.4 Worker test: a one-shot wake on an idle agent produces a model call with the prompt; cursor advances past it
- [ ] 1.5 Worker test: a cron tick on an idle agent produces a turn
- [ ] 1.6 Worker test: a trigger delivered mid-run that is not consumed causes a follow-up turn
- [ ] 1.7 Worker test: legacy watch (`deliverWatch`) ready/timeout produces a turn
- [ ] 1.8 Keep `triggerPause.unit.test.ts` green: stopped/archived agents get no prompt and no turn

## 2. Side effects of cursor-visible triggers (D4)

- [ ] 2.1 `agent/message.ts`: skip trigger rows when looking up the previous hop
- [ ] 2.2 Test: a trigger between agent messages does not reset the hop
- [ ] 2.3 Test: with two users a trigger prompt has no user-name prefix (`auth/attributeMessages`)
- [ ] 2.4 Test: trigger with an active goal runs an ordinary turn (`ordinary_input`)
- [ ] 2.5 Test: `goal/continuationAdmit` and `goal/externalResume` defer while a trigger prompt is pending
- [ ] 2.6 Review `agent/unpark.ts`, `acceptMessage.ts`, last-message DB trigger, `statusLineForTurn`, `statsData`; adjust tests if needed

## 3. Watch result in the prompt

- [ ] 3.1 Verify only: `processTrigger` already calls `resultStore.prepare` with `inlineLimit: 16_000` and handles preview/storage failure; check that `deliverTriggerPrompt` actually puts the inline result into the model-visible prompt (not only into the event), fix if not
- [ ] 3.2 Test at exactly the limit: prompt plus full result in the actual model request
- [ ] 3.3 Test just above the limit: preview plus a reference that `readResult` resolves
- [ ] 3.4 Test storage failure: preview plus notice, no invalid reference

## 4. Idempotent delivery and coalescing (D5 part, D6)

- [ ] 4.1 Migration: `agent_trigger_deliveries` table (D5); extend `agent_trigger_runs.outcome` CHECK with `coalesced` and `invalidated`
- [ ] 4.2 Firing key = `next_at` at claim for all kinds (not the claim token); `clientRequestId = "trigger:<id>:<firing_key>"`; delivery row with `ON CONFLICT DO NOTHING` in the append transaction
- [ ] 4.3 Test: retry and worker restart mid-delivery give exactly one prompt and one turn
- [ ] 4.4 Coalescing: skip appending while the trigger has a `pending` delivery; advance schedule; audit `coalesced`
- [ ] 4.5 Mark delivery `consumed` when the cursor passes its message after a successful turn
- [ ] 4.6 Test: several cron ticks while stopped/quota-parked give one pending prompt and one turn after resume

## 5. Task binding at creation (D3 creation, D5 part, D8)

- [ ] 5.1 Migration: `agent_triggers.task_reservation_id` and index
- [ ] 5.2 Bind `wake`, `cron`, `watch` only for a self-targeted call by the executing child under a live grant; write `reservation_id` into the delivery row
- [ ] 5.3 Test: UI, cross-agent and pre-migration triggers stay unbound
- [ ] 5.4 Limits: at most 5 armed bound triggers per task; bound cron interval at least 1 minute
- [ ] 5.5 Test: sixth bound trigger and sub-minute bound cron are rejected

## 6. Admission of bound firings (D3 delivery and consumption)

- [ ] 6.1 `goal.delegationConsume`: beyond the frontier admit only rows with a valid `pending` delivery of this reservation; the frontier itself never moves
- [ ] 6.2 `agent.buildLlmRequest` (including steering): show the model only authorised rows
- [ ] 6.3 Worker cursor: never advance past an unauthorised row
- [ ] 6.4 Test: human, cross-agent, old-task and unbound triggers do not resume a delegated child
- [ ] 6.5 Test: a human message before admission and during a turn is neither shown nor skipped
- [ ] 6.6 Gate bound resume on `goal.enabled` and the `agent.triggerTaskWait` setting (default off); with it off, triggers are never bound

## 7. Waiting state (D3 waiting, D5 part)

- [ ] 7.1 Migration: `task_state` CHECK with `waiting` and `blocked`; `blocked_reason`, `blocked_at`
- [ ] 7.2 Settlement: successful turn + armed bound trigger or pending firing + unfinished task → `waiting`, release claim, schedule nothing
- [ ] 7.3 A valid firing takes a fresh claim under the same reservation; after the last firing, settle normally
- [ ] 7.4 Explicit `finishTask` wins over an armed trigger
- [ ] 7.5 Test for `wake`, `cron`, `watch`: create → end turn → wait → fire → resume the same task; check model input and cursor
- [ ] 7.6 Test: wait survives worker restart; retry does not consume a firing; a second cron/edge-watch firing resumes again
- [ ] 7.7 `goal/externalApply.ts`, `externalClear.ts`, `externalResume.ts`: treat `waiting` and `blocked` as outstanding (add to `task_state IN (...)`)
- [ ] 7.8 Test: a parent goal with a waiting or blocked child is not completed or cleared

## 8. Lock order and end of task (D7, D3 end of task)

- [ ] 8.1 Apply the lock order agents → reservations → triggers → deliveries in delivery, admission, settle, cancel, timeout, `finishTask`, task cancel, revoke
- [ ] 8.2 On finish, cancel or revoke: disarm bound triggers (including recurring), mark pending deliveries `invalidated`
- [ ] 8.3 Test per trigger kind: finish, cancel and revoke stop further model calls, including an already queued firing
- [ ] 8.4 Test race: delivery and `finishTask`/cancel/revoke concurrently — no deadlock, firing either consumed before or invalidated with no turn

## 9. Blocked when the last trigger is gone

- [ ] 9.1 On single and bulk trigger cancellation: block a waiting task if no armed bound trigger and no pending firing remain; reason `trigger_cancelled`
- [ ] 9.2 Same on watch timeout without `onTimeoutPrompt`; reason `watch_timed_out`
- [ ] 9.3 Test: blocked with the right reason before and after restart; task unfinished; no model call
- [ ] 9.4 Test: another armed trigger or pending firing → not blocked; timeout with a prompt still resumes

## 10. Parent visibility (D9)

- [ ] 10.1 `agent.team` and task status: `taskState`, `blockedReason`, `blockedAt`, armed trigger count
- [ ] 10.2 Test: parent sees `waiting` for a waiting child and `blocked` with the reason after restart

## 11. Migration safety and rollout

- [ ] 11.1 Down step: waiting tasks → `blocked` with `rollback`; bound triggers paused
- [ ] 11.2 Test on existing data: old triggers stay unbound, old messages not replayed; down step works
- [ ] 11.3 Run `bun test src/agent src/goal` and `ctx.fns.code.quality({})`
- [ ] 11.4 Test: with `agent.triggerTaskWait` off, a delegated child's trigger stays unbound and behaves as after block 1
- [ ] 11.5 After deploy, schedule a short `agent.wake` on a test agent and on `yc`, confirm a turn runs
