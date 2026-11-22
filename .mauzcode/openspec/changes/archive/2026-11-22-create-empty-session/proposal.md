# Proposal

## Why

The new-session composer only creates an agent together with its first message, so a person who wants to prepare a session (choose workspace, model, preset, title) and write later has to invent a throwaway message. Creating an empty session should be one Enter press or one click away.

## What Changes

- The new-session composer allows submitting with empty text and no attachments: Enter in the input or the send button creates the agent and opens its chat without any message.
- The send button stays enabled for an empty new-session draft (once a workspace and model are ready) and is labelled "Создать сессию" while the text is empty.
- The new-session bridge accepts an empty `text` without files, creates and configures the agent (title, model, effort, mascot, preset) and does not accept a first message; it answers with `status: "created"`.
- Retries with the same request key stay idempotent: a repeated empty submit returns the same agent and never creates a second one.
- The ordinary chat composer is unchanged: empty messages still cannot be sent into an existing chat.

## Capabilities

### New Capabilities

### Modified Capabilities
- `new-session-options`: adds requirements for creating a session without a first message from the composer and through the new-session bridge.

## Impact

- `frontend/src/components/mauzcode/NewSessionComposer.tsx`, `frontend/src/components/mauzcode/MessageInput.tsx` (opt-in empty submit), `frontend/src/lib/newSession.ts` (response status).
- `src/frontendBridge/newSession.ts` (validation, skipping `agent.acceptMessage`, `created` status, replay).
- Tests: `src/frontendBridge/new-session.test.ts`, `frontend/src/test/new-session.test.tsx`, `frontend/tests/new-session-api.bun.ts`.
