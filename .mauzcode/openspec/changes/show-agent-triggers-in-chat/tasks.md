# Tasks

## 1. Active trigger snapshot and refresh

- [ ] 1.1 Add the owner-authorized active/checking read projection with purpose derived from the first prompt line (≤120 chars); verify with isolated DB/API fixtures for mixed kinds, checking state, due-time ordering, an armed row older than 100 finished rows, denied foreign reads and absence of raw predicate data.
- [ ] 1.2 Emit scoped, post-commit invalidations for all changes that affect the projection (including reschedules without delivery); verify the refreshed GET reflects committed changes and rollback publishes no misleading state.

## 2. Shared single-trigger operations

- [ ] 2.1 Extract conditional make-due from the trigger form handler into a shared operation. Return `scheduled`, `deferred_paused`, `already_checking` or `not_active`. Test wake, recurring cron, false/true watch, paused recipient, checking and terminal targets; verify scheduling acceptance never asserts delivery and never creates a parallel check.
- [ ] 2.2 Add the owner-authorized UI action boundary and the agent capability for immediate execution/checking, preserving existing task and preset restrictions. Test CSRF rejection, mismatched agent/trigger, denied grant, PLAN and ineligible sessions; review capability classification before exposing the tool.
- [ ] 2.2a Require `x-csrf-token` (`auth.verifyCsrf`) on the new JSON action endpoint and on the existing inspector form route; send the token from the inspector form and route its `run` branch through the shared operation. Test missing/invalid token rejection on both routes and that the inspector still works.
- [ ] 2.3 Wire chat-initiated single-trigger cancellation (no confirmation step) through the existing operation and recheck state at execution. Test single-target execution, foreign/substituted ID, stale target, and the cancellation-versus-delivery race on isolated Postgres.
- [ ] 2.4 Add the `agent_trigger_action_requests` migration and use it for mutating row and conversational actions, written in the action's transaction. Test retry after losing the response (including after a cron already fired), reuse with different input, and transaction rollback; verify one state change and one actual result.

## 3. Durable chat lifecycle

- [ ] 3.0 Add nullable `created_by_agent_id`/`created_by_tool_call_id` to `agent_triggers` and fill them in `wake`/`cron`/`watch` (enclosing evaluation call for code-evaluation tools). Test direct tool call, call inside eval, creation for another agent, form creation and legacy NULL rows.
- [ ] 3.1 Record safe display-only events for committed creation (skipped when created by a tool call visible in the same chat; badge that tool card instead), cancellation (single, existing bulk and delegated-task cleanup), and expiry without delivery, including a coalesced edge-watch timeout. Verify transaction rollback and replay do not leak or duplicate events and notices add no model message or wake.
- [ ] 3.2 Project lifecycle snapshots through the authorized, paginated events API. Verify an edge watch expiring with a timeout prompt and an earlier pending firing adds one expiry entry and no wake, including after reload. Test legacy and new `wake_up`, delivered versus silent timeout, repeated cron, coalescing and edge-watch rearming; verify no raw predicate data, invented historical metadata, duplicate timeout, duplicate creation next to a visible tool call, or any failure entry for retryable errors.
- [ ] 3.3 Render distinct, chronological system entries using the chat lifecycle renderer. Test visibility across work-group collapse, live append, reload and older history; verify accepted actions are not rendered as firing, and notices do not look like human messages.

## 4. Conversational command

- [ ] 4.1 Register `/trigger` in the shared catalogue and implement an explicit parse/dispatch branch for all chat submission paths. Test manual and menu submission, bare and argument forms, request-key replay/conflict, unsupported attachments, and unchanged `/plan` and `/compact` behaviour.
- [ ] 4.2 Route one accepted request to the current agent at ordinary human authority. Test with mocked conversations: a bare command asks which of three kinds to add; a complete request creates once; ambiguous timing, time zone, condition or target asks only for missing data; zero matches never substitutes another trigger.
- [ ] 4.3 Connect resolved run/check/cancel intents to shared operations; a cancellation reply names the cancelled trigger's ID, kind and purpose. Test selection among multiple same-agent matches, zero matches, replay across clarification, a failed creation, an accepted but not yet delivered run, a paused recipient (`deferred_paused`), and a PLAN session with an existing pending review; assert truthful replies and no unauthorized mutation.
- [ ] 4.4 Document `/trigger` discovery, examples and scheduling versus delivery in the agent-trigger guide; check examples against the command and mocked-flow tests.

## 5. Composer panel and integration

- [ ] 5.1 Mount an independent disclosure beside the todo dock with type counts, sorted details and accessible labels. React-test zero/one/mixed groups, checking state, cron zone, next watch check, keyboard expansion and preservation of todos and composer focus.
- [ ] 5.2 Wire data loading, live refresh and reconnect, clear state on agent switch and discard stale responses. Test missing an invalidation, a failed fetch, out-of-order responses and agreement between counts and rows after a change.
- [ ] 5.3 Wire per-row Run now / Check now / Cancel with pending feedback, immediate cancellation and plain-language outcome messages (including "scheduled, will run after the agent resumes"). Test keyboard use, denial, stale-state refresh, false watch and no duplicate action on retry. Check narrow layouts keep kind/count pairs legible without hiding the input.
- [ ] 5.4 Update the trigger UI guide to distinguish the chat dock, command, transcript and existing audit. Verify end to end with isolated fixtures: create via command, inspect counts, check/run, cancel from chat, then reload and compare panel, transcript and audit with engine state. Run focused backend/frontend suites and the project's prescribed checks.
