# Design

## Context

`deliverTriggerPrompt` appends the prompt with `message_type: 'trigger'` and `excluded_from_cursor: true`, then sets `next_run_at`. The worker claims the agent, but `runOne` computes the frontier and pending input only from rows with `excluded_from_cursor = 0`. Since `f0b0e879` (persistent goals) an empty pending set yields `startAction = 'skip'`, which parks the agent without calling the model. Before that commit the worker ran anyway, so the trigger worked as a side effect of the schedule.

`excluded_from_cursor` exists for synthetic rows that must never wake an agent (tool feedback, `goal_context`, `planning_context`). A trigger prompt is the opposite: its whole purpose is to wake the agent.

## Goals / Non-Goals

**Goals:** each authorised firing reaches the model and is acknowledged only on success; input may share a turn. Task-bound triggers resume only the task that created them.

**Non-Goals:** replaying triggers already swallowed before the fix; changing cron timing, watch predicates or stop/archive pause rules; changing goal continuation rules; changing quota-parking wake-ups from `deliverWakes` (they stay excluded — `unpark` schedules the real pending input itself).

## Decisions

### D1 — Store trigger prompts as cursor-visible input (chosen)
Set `excluded_from_cursor: false` in `deliverTriggerPrompt` and in the legacy watch path `deliverWatch` (`message_type: 'wake_up'`, same bug). The worker, finalize rescheduling, unpark and stale recovery already treat cursor-visible user rows as work, so a trigger behaves exactly like a queued human message: one turn, cursor advances on success, retry on error, follow-up turn if delivered mid-run.

Alternatives considered:
- **B. Special-case `message_type = 'trigger'` in the worker's pending check.** Rejected: the frontier, finalize reschedule (`MAX(idx) … excluded_from_cursor = 0`), unpark and delegation checks all use the same predicate; patching only `runOne` leaves a mid-run trigger without a follow-up turn and keeps the cursor from ever covering it. Every new cursor query would have to remember the exception.
- **C. Make `skip` run the model when `next_run_at` was set.** Rejected: reintroduces wake-ups with no input (spin) that the goal change deliberately removed.

### D2 — Trigger prompts are system input, not human input
Both delivery paths store the prompt with `author: null`. `appendMessage` otherwise fills the author from `auth.actorId`, and `auth.attributeMessages` would prefix the prompt with `<Name>:` in multi-user installs, presenting scheduled work as a human message.

For a ready watch, `processTrigger` passes the serialized predicate result prepared by `resultStore.prepare` to `deliverTriggerPrompt`. Include the whole result up to the existing 16,000 UTF-16 code unit limit. Above it, include only the bounded preview and the existing full-result reference; on storage failure, keep the preview and say the full result is unavailable. Do not attach a predicate result to wake, cron or watch timeout prompts.

### D3 — Bind each delegated trigger to the task that created it
- **Creation:** for `wake`, `cron` and `watch`, bind the trigger ID to the stable task reservation only when the trusted executing child is the target and its current worker claim has a valid grant for that reservation. Do not accept provenance from caller arguments. Human/UI calls, cross-agent calls and legacy rows without proof remain unbound. A null author is not proof of origin.
- **Waiting:** when a turn succeeds with a bound trigger still armed (or a firing pending) and the task was not explicitly finished, settle usage and release the claim into durable waiting, not terminal success or retry. Waiting without a firing does not schedule work. A firing permits a fresh claim under the same reservation and current authority, not reuse of the old claim token. After consuming the last firing, settle normally unless another trigger remains. Explicit task completion takes precedence even with an active cron.
- **Loss of the last trigger:** on single or bulk trigger cancellation, or watch timeout without `onTimeoutPrompt`, reconcile the waiting reservation under the same lock as delivery and settlement. If the task is unfinished and has neither an armed bound trigger nor a pending authorised firing, persist `blocked` and the reason (cancelled or timed out) with the transition. Expose that reason in the parent's task status across restart; do not synthesize a prompt, schedule a turn or mark the task complete. A timeout with a prompt follows normal firing delivery.
- **Delivery and consumption:** persist the exact delivered message index against its trigger and firing in the append transaction. Deduplicate a firing on replay. Use this receipt and the live reservation in admission, model-history filtering (including mid-run requests), and cursor finalization. Keep the original authorised frontier immutable: admit only individually verified extra rows, never a range up to the newest trigger. Unapproved post-frontier input blocks admission; if it arrives during a run it must neither reach the model nor be skipped by cursor advancement. Acknowledge only consumed rows on success; retry does not consume a firing.
- **End of task:** serialize completion, cancellation and revocation with delivery/admission. Disable remaining bound triggers, including recurring cron/edge watches, and invalidate queued firings. A stale dispatcher or restarted worker cannot reopen the task or fall back to an ordinary turn. A stopped or archived agent stays paused under existing rules.

### D4 — Remaining side effects are accepted
- `agent.message` hop counter reads the last cursor-visible user row. Trigger rows (`message_type` `trigger` or trigger `wake_up`) are skipped when looking for the previous hop, so a trigger never resets the agent-to-agent chain; otherwise a cron could bypass the hop limit.
- `goal/continuationAdmit.ts` and `goal/externalResume.ts` `pending_user` guards now see pending trigger rows and defer goal continuation/resume, like for human input.
- `continuationValidateStart` sees a `trigger` row as ordinary input (`run`, `ordinary_input`), so a goal continuation is suppressed for that turn; the turn itself runs normally.
- The `update_agent_last_message` DB trigger moves the agent up the list on every fire; `frontendBridge/statsData` and `statusLineForTurn` count trigger prompts as user messages.
- `acceptMessage` returns `SUBMISSION_CONFLICT` for a submission waiting on the current run while a trigger prompt is pending — same as for any queued message.

### D5 — Data model
- `agent_triggers.task_reservation_id uuid NULL REFERENCES goal_delegation_reservations(reservation_id) ON DELETE SET NULL`. Set only at creation (D3); never updated afterwards except cleared by the cascade. Index `(task_reservation_id, status)`.
- New table `agent_trigger_deliveries(trigger_id, firing_key, agent_id, message_idx, reservation_id NULL, state, created_at, settled_at)`, `PRIMARY KEY (trigger_id, firing_key)`, `UNIQUE (agent_id, message_idx)`, `state IN ('pending','consumed','invalidated')`. Written in the same transaction as the appended message. Message idempotency alone comes from `appendMessage`'s existing `clientRequestId` dedup; this table is still needed because it carries per-firing state (pending/consumed/invalidated), the reservation binding used by admission, and the coalescing check — none of which `messages` or `agent_trigger_runs` can hold.
- `agent_trigger_runs.outcome` CHECK is extended with `coalesced` (and `invalidated` for firings dropped at task end); otherwise the audit insert fails.
- `goal_delegation_reservations.task_state` CHECK is extended with `waiting` and `blocked`; new nullable columns `blocked_reason text CHECK (blocked_reason IN ('trigger_cancelled','watch_timed_out','rollback'))` and `blocked_at bigint`. `waiting`/`blocked` are non-terminal: `finishTask`, cancellation and revocation accept them like `open`.
- Migrations (additive, no backfill): `agent/$migration_<ts>_trigger_task_binding.ts` (column + deliveries table) and `goal/$migration_<ts>_goal_task_waiting.ts` (CHECK + columns). Existing triggers keep `task_reservation_id = NULL`.

### D6 — Firing identity, idempotency and coalescing
- `firing_key` is the scheduled time of the firing for every trigger kind: the trigger's `next_at` at claim time (the same value already written to `agent_trigger_runs.scheduled_at`). The claim token is NOT used: it changes when a restarted worker re-claims, so a replayed delivery would not be recognised as a duplicate. `deliverTriggerPrompt` appends with `clientRequestId = "trigger:<triggerId>:<firing_key>"` and inserts the delivery row with `ON CONFLICT DO NOTHING`; a replayed delivery returns the existing row and appends nothing, so a retry never produces a second turn.
- Coalescing: if the same trigger already has a `pending` delivery, a new cron tick or edge-watch firing appends no message and only advances the schedule (`outcome: 'coalesced'` in the audit record). At most one unconsumed prompt per trigger exists, so a slow, stopped-then-resumed or quota-parked agent never receives a burst of turns.

### D7 — Lock order
Every path that touches delivery, admission, settlement, trigger cancellation, watch timeout, `finishTask`, task cancellation and grant revocation locks rows in one order: `agents` → `goal_delegation_reservations` → `agent_triggers` → `agent_trigger_deliveries`, each with `FOR UPDATE`, inside one transaction. No path locks a later row and then an earlier one. This removes deadlocks and makes "deliver vs. finish" strictly serial: whichever commits first wins, and the loser re-checks state after acquiring the locks.

### D8 — Limits for task-bound triggers
- At most 5 armed bound triggers per task reservation; creating a sixth fails with a clear error.
- A bound cron must have an interval of at least 1 minute; a bound watch keeps the existing minimum `everyMs`.
- Limits apply only to bound triggers; existing limits for unbound triggers are unchanged.

### D9 — Parent visibility
Every reader of `task_state` that treats `('open','pending_review')` as "task outstanding" — `goal/externalApply.ts`, `goal/externalClear.ts`, `goal/externalResume.ts` — must include `waiting` and `blocked`; otherwise a waiting child looks finished and the parent goal may complete or clear early.

`agent.team` and the delegation/task status returned to the parent expose `taskState` (`open` / `waiting` / `blocked` / terminal), `blockedReason`, `blockedAt` and the number of armed bound triggers. Values are read from the reservation row, so they survive restart. A child in `waiting` is shown as working, not finished.

## Risks / Trade-offs

- [A frequent cron produces many turns] → unchanged intent of cron; existing trigger limits apply.
- [Hidden callers rely on trigger rows being excluded] → grep for `excluded_from_cursor` and `'trigger'` shows only the files listed in the proposal; regression tests cover worker behaviour.
- [Duplicate prompt after a delivery retry] → idempotent firing key (D6).
- [Burst of turns after a pause] → coalescing (D6).
- [Deadlock between delivery and finish] → single lock order (D7).
- [A later trigger could mask an intervening human message] → test interleaved input at admission and again during model execution; verify both model input and the persisted cursor.

## Migration Plan

Rollout is in two steps inside this change. Step 1 (tasks 1–3) is the base fix and can ship on its own. Step 2 (tasks 4–11) is guarded by a runtime setting `agent.triggerTaskWait` (default off until the tests in 7–9 pass); with it off, triggers are never bound and the system behaves as after step 1. This allows disabling waiting without a down migration.

Rolling back step 1 needs no data change: prompts already stored as cursor-visible stay ordinary pending input and are processed once; older code simply stops creating new ones that way.

Resume via bound triggers is active only when `goal.enabled` is true (`ctx.fns.goal.enabled({})`) and `agent.triggerTaskWait` is on; with goals disabled, bound triggers are treated like unbound ones on a delegated child (blocked admission, no turn).

Deploy additive nullable task bindings, delivery receipts and waiting-state storage before enabling bound resumes. Do not backfill authority for historical triggers. On rollback, a down step moves every `waiting` reservation to `blocked` with `blocked_reason='rollback'` and pauses bound triggers (`status='paused'`) before older workers run; never reinterpret a bound trigger as an ordinary one.
