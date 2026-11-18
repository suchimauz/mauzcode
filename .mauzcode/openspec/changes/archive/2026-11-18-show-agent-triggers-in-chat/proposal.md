# Proposal

## Why

A firing can already appear in chat, but it does not tell the person which triggers are still armed, which were cancelled, or whether a watch expired without waking the agent. People should be able to see and act on their agent's future work without leaving the conversation.

## What Changes

- Add a collapsible panel above the composer. Count armed triggers by kind; expand it to see what each is waiting for and when it will next run or check.
- Give each row a run/check-now action and an immediate single-trigger cancellation without a confirmation step. Introduce `/trigger` for conversational creation, immediate execution/checking and cancellation; a bare command asks what kind to add.
- Show committed lifecycle changes as system entries in chat. Reuse existing firing entries. Do not turn polling, retries, or a request merely accepted by the scheduler into firing notices.

## Capabilities

### New Capabilities

- `chat-trigger-visibility`: The current agent's active trigger panel, live refresh, and durable lifecycle entries in the transcript.
- `chat-trigger-management`: Single-trigger actions and the conversational `/trigger` command, including clarification, explicit run outcomes and execution boundaries.

### Modified Capabilities

None. `agent-trigger-delivery` still governs when an agent wakes and what it receives. `chat-todo-dock` is the neighbouring composer panel; its behaviour is unchanged.

## Impact

Affects the React chat composer, command catalogue and transcript, the owner-authorized agent API, command dispatch, trigger operations, and existing session-event/live-update paths. No new trigger kinds, retry limits, bulk chat actions, schedule editor, creation form, or changes to the existing audit view. This proposal defines future implementation work; it does not implement it.
