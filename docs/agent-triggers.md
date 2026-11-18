# Agent triggers

Agent triggers are the durable mechanism for starting a future turn in the same agent conversation. They replace separate wake-up, recurring schedule, and condition-watch concepts with one Postgres-backed engine.

## Public API

```ts
// One future turn: provide exactly one of at or inMs.
await ctx.fns.agent.wake({
  id: agent.id,
  inMs: 10 * 60_000,
  prompt: "Check the build",
});

// Recurring wall-clock schedule. Cron has five fields; timezone is required.
await ctx.fns.agent.cron({
  id: agent.id,
  expression: "0 9 * * 1-5",
  timezone: "Europe/Lisbon",
  prompt: "Prepare the morning update",
});

// Durable condition polling.
await ctx.fns.agent.watch({
  id: agent.id,
  predicate: "file.exists",
  opts: { path: "/tmp/result.json" },
  prompt: "The result is ready",
  everyMs: 30_000,
  timeoutMs: 60 * 60_000,
  mode: "once",
  onTimeoutPrompt: "The result did not arrive in time",
});

await ctx.fns.agent.triggers({ id: agent.id, status: "active" });
await ctx.fns.agent.cancelTrigger({ id: agent.id, triggerId });
await ctx.fns.agent.cancelAllTriggers({ id: agent.id });
```

Supported watch predicates are `file.exists`, `db.rows`, `http.ok`, and `runtime.fn`. A watch evaluates its predicate once before it is saved: invalid SQL, URL, runtime-function configuration, and immediate provider errors are returned to the caller instead of creating a broken trigger. A valid `ready: false` result still creates the watch. `mode: "once"` completes after the first true result. `mode: "edge"` fires on each false-to-true transition and does not fire repeatedly while the condition remains true.

Legacy `wakeAt`, `wakeIn`, `wakeUpWhen`, and `cancelWake` calls are compatibility wrappers over this engine. New code should use `wake`, `cron`, and `watch`.

## Persistence and delivery

`agent_triggers` stores the trigger definition, lifecycle, next due time, claim token, timeout, and watch edge state. `agent_trigger_runs` records execution history; `agent_trigger_deliveries` ties a firing's original scheduled time to its message index and consumption state. The main agent worker includes the earliest active trigger in its sleep deadline and atomically claims due rows with `FOR UPDATE SKIP LOCKED`.

A firing appends a user-role message with `message_type="trigger"`, `excluded_from_cursor=false` and no human author, then schedules the existing conversation. A mid-turn firing remains pending until a successful turn consumes it. Replaying a firing does not duplicate its prompt; repeated cron ticks or watch edges coalesce while the same trigger has a pending delivery. Stopped or archived recipients receive no delivery. A ready watch includes its serialized result inline (up to 16,000 UTF-16 code units); larger results include a preview and a readable reference, or a notice if storage failed.

Cron uses explicit IANA timezones. If the process was unavailable at a scheduled time, one due occurrence is delivered on recovery and the following occurrence is calculated from the recovery time, so missed runs do not create an unbounded backlog.

## Delegated goal tasks

`agent.triggerTaskWait` is **off by default**. With both it and `goal.enabled` on, a child may wait on a trigger it creates for itself under its current task grant. The next firing resumes the same task; it does not authorize messages from another agent or a person. At most five triggers may be armed per task. Finishing the task disarms them. Cancelling the last one, or a silent watch timeout, leaves the task blocked if no firing is pending. `agent.team` reports the reason to the parent.

## Inspector UI

The right-side **Automation** section is the single control surface for Wake-up, Schedule, and Watch triggers. It lists active triggers and supports Run now, Cancel, Cancel all, and creation of all three types. **Recent runs** shows completed, timed-out, cancelled, and failed work with the last outcome, attempt count, result preview, error, and timestamps. Function retrieval and reranking controls live separately under **Agent settings**.

The inspector form route (`POST /agent/:id/triggers`) requires owner authorization and a cookie-bound CSRF token (`x-csrf-token` header or `csrf` form field). Its `run` action uses the shared make-due operation below.

## Chat surfaces

Four surfaces show triggers; keep them distinct:

| Surface | Shows | Source |
|---|---|---|
| **Trigger dock** above the composer (next to the todo dock) | Counts of armed (active/checking) triggers by kind; expanded rows with purpose, next run/check, cron expression and time zone, Run/Check now and Cancel | `GET /agent/:id/triggers` (`agent.armedTriggers`), refreshed by `ui.metaSection` `automation`/`wake`/`all` hints and on reconnect |
| **`/trigger` command** | A human request to the agent to add, run/check now or cancel one trigger | `commands.dispatch` → `commands.trigger` |
| **Transcript** | One `trigger_lifecycle` entry per committed creation, cancellation (manual, bulk, task cleanup) or expiry without delivery; firings keep their `wake_up` entry | session events via the authorized events API |
| **Trigger audit** (agent meta) | Latest 100 definitions and their runs | unchanged |

The dock never derives state from the transcript or the capped audit list. Purpose is the first non-empty prompt line, whitespace-collapsed and cut to 120 characters; predicate configuration, SQL, URLs, arguments and results are never sent to the dock or lifecycle entries.

### Run now / check now

`agent.runTriggerNow` makes an **active** trigger due and wakes the worker; the worker alone claims and evaluates it. Outcomes:

- `scheduled` — made due; a firing appears in chat only after delivery. A false watch check fires nothing.
- `deferred_paused` — made due while the agent is paused; it runs after resume.
- `already_checking` — being checked now; no parallel evaluation is started.
- `not_active` — finished, cancelled or not this agent's trigger; nothing changed.

Row controls use `POST /agent/:id/triggers/:triggerId/actions` with `{ requestId, action: 'run' | 'cancel' }` and `x-csrf-token`. `agent.triggerAction` stores each result in `agent_trigger_action_requests` in the same transaction as the change: an identical retry returns the stored result (even after the worker fired), a reused key with another action or target returns 409. In PLAN mode the outcome is `planning` and nothing changes. Cancellation needs no confirmation step: triggers are cheap to recreate.

### `/trigger`

`/trigger` is in the command catalogue and works with no armed triggers. The command text becomes an ordinary human message and schedules one turn; it never changes planning mode or a pending review. Acceptance means the request was received, not that a trigger exists or fired.

- `/trigger` — the agent asks whether to add a one-shot wake, a recurring schedule or a condition watch.
- `/trigger in 20 minutes check the build` — the agent creates a wake with that timing and purpose and reports it only after `agent.wake` returned an id.
- `/trigger cancel the daily report` — the agent resolves exactly one of its own armed triggers (asks if several match, changes nothing if none) and calls `agent.applyTriggerAction({ triggerId, action: 'cancel' })`; the reply names the trigger's id, kind and purpose.

`agent.applyTriggerAction` derives its replay key from the latest accepted `/trigger` command, so a retry after clarification does not repeat the change.

### Lifecycle entries and creators

`agent_triggers.created_by_agent_id` / `created_by_tool_call_id` record who created a trigger; tool calls (including calls made inside `eval`) record the enclosing provider call id. When an agent creates its own trigger through a recorded tool call, the transcript shows a "Триггер создан" badge on that tool card instead of a separate entry. Creation by another agent adds one entry in the owner's chat naming the creator (and badges the creator's card); creation without a recorded call (form, direct calls) adds an entry. Existing rows stay NULL; history is not backfilled.

A watch that expires with a delivered timeout prompt is shown only by its `wake_up` entry; a silent expiry, or a timeout coalesced behind a pending firing, adds one `expired` entry and no wake or model message. Polls, rearming, coalesced ticks and retryable predicate errors never add entries. Lifecycle entries stay visible when the surrounding work block is collapsed.
