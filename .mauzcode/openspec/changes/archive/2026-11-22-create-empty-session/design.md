## Context

`NewSessionComposer` blocks submit when `draft.text.trim()` is empty and there are no files; `MessageInput` computes `canSubmit` the same way for Enter and the send button. The bridge `src/frontendBridge/newSession.ts` rejects blank text without files with HTTP 400, and after `agent.createFromValues` always calls `agent.acceptMessage`. Idempotency is a `kv` claim keyed by `requestKey` with a fingerprint and statuses `sending | sent | failed`.

## Goals / Non-Goals

**Goals:**
- One Enter or click on an empty new-session draft creates a configured agent and opens its chat.
- Same idempotency and retry guarantees as the first-message path.

**Non-Goals:**
- Allowing empty messages in existing chats.
- A separate "create" button or a new endpoint.

## Decisions

- **Opt-in in `MessageInput`.** Add an `allowEmptySubmit` prop; when set, `canSubmit` is true regardless of text. Only `NewSessionComposer` passes it, so existing chats keep their behaviour. The send label becomes "Создать сессию" when empty and the prop is set.
- **Same endpoint, new status.** The bridge accepts blank `text` without files. After the agent is created and configured (`ready`), an empty request skips `acceptMessage`, stores `status: "created"` and answers 201 `{ agentId, projectId, status: "created" }`. Replay of a claim with `created` returns the same body with 200. The fingerprint already includes `text`, so empty and non-empty requests with one key conflict (409) as today. Alternative: a separate endpoint — rejected, it would duplicate validation and idempotency.
- **Composer.** `send()` drops the text/files guard (keeps Workspace, model and file checks), skips slash-command validation for empty text, and treats both `sent` and `created` as success before calling `onCreated`.

## Risks / Trade-offs

- [Accidental empty sessions from a stray Enter] → acceptable: the session is cheap and the label makes the action explicit.
- [Old clients expecting only `sent`] → only the bundled composer calls this endpoint; it is updated together.
