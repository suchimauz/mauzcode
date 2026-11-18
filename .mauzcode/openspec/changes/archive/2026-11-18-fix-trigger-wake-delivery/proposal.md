## Why

Durable triggers (`wake`, `cron`, `watch`) fire and append their prompt to the agent's chat, but the agent never takes a turn. The prompt is stored as a user message excluded from the processing cursor, and since the persistent-goals change the worker only starts a model call when there is pending cursor-visible user input; otherwise it parks the agent as idle. Every wake-up, cron tick and watch hit is therefore silently dropped (observed on agent `yc`: trigger `completed/fired`, prompt at idx 525, no run).

## What Changes

- A delivered trigger prompt becomes ordinary pending input for its agent: the worker starts a turn for it, and the cursor advances past it only after that turn succeeds.
- A trigger prompt delivered while the agent is running is picked up by a follow-up turn, like any other queued user message.
- Trigger prompts are stored without a human author, so they are never shown to the model as a named user's message.
- A delegated child may wait for its own `wake`, `cron` or `watch` and resume the same task. The runtime binds the trigger to the child's active task grant at creation; a trigger created by a human, another agent or a prior task cannot authorise a turn.
- Ending a turn while waiting is not task completion. Completing or cancelling the task, or revoking its grant, disables all remaining task-bound triggers, including recurring ones.
- If the last bound trigger is cancelled or a watch expires silently and no other trigger or pending firing remains, the waiting task becomes `blocked`. The parent can see why, including after restart; the task does not complete or start a turn.
- For a ready watch, the model receives the full predicate result inline when it fits; larger results are delivered as a preview with a reference to the full result.
- Delivery is idempotent per firing; a cron tick or edge-watch firing is coalesced while the previous prompt of the same trigger is unconsumed.
- Trigger prompts do not reset the agent-to-agent hop counter.
- Bound triggers are limited per task (count and minimum cron interval).
- The legacy watch path (`deliverWatch`) gets the same cursor and attribution fix.
- Trigger prompts still never start a turn for a stopped or archived agent (existing pause/stop behaviour is unchanged).
- Tests that pinned the old `excluded_from_cursor: true` storage are updated, and a worker-level regression test asserts that a fired trigger produces a model call.

## Capabilities

### New Capabilities
- `agent-trigger-delivery`: how a fired durable trigger's prompt is delivered to its agent and turned into an agent turn.

### Modified Capabilities

## Impact

- `src/agent/deliverTriggerPrompt.ts` and `src/agent/deliverWatch.ts` (message flags, author), trigger creation and delivery (durable task binding), `src/goal/delegationConsume.ts` and `delegationSettle.ts` (admission and waiting), `src/agent/buildLlmRequest.ts` and `workerLoop.ts` (authorised model input and cursor).
- Cursor-based readers that now see trigger prompts: `agent/message.ts` hop counter (trigger rows skipped), `goal/continuationAdmit.ts`, `goal/externalResume.ts`, `agent/unpark.ts`, `agent/acceptMessage.ts`, `goal/continuationValidateStart.ts`, `auth/attributeMessages.ts`, `agent/statusLineForTurn.ts`, `frontendBridge/statsData.ts`, the `update_agent_last_message` DB trigger.
- Tests: `wake.test.ts`, `triggers.test.ts`, `workerLoop.test.ts`, delegation, goal-continuation and attribution tests.
- Goal readers of `task_state` that must count `waiting`/`blocked` as outstanding: `goal/externalApply.ts`, `goal/externalClear.ts`, `goal/externalResume.ts`.
- Migrations: `agent_triggers.task_reservation_id`, new `agent_trigger_deliveries` table, `agent_trigger_runs.outcome` CHECK extended with `coalesced`/`invalidated`, `waiting`/`blocked` task states with `blocked_reason`/`blocked_at` (design D5).
- `agent.team` / task status show waiting, blocked and the reason to the parent.
- Rollout: the base fix (cursor-visible, unattributed trigger prompts) ships first; task-bound waiting ships behind the `agent.triggerTaskWait` setting (default off).
- Add durable task/trigger/delivery associations and a waiting state. Existing triggers have no inferred task authority. Already-delivered messages are not replayed.
