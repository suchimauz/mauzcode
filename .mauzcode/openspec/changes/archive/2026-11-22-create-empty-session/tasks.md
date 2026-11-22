## 1. Bridge

- [x] 1.1 Accept blank `text` without files in `src/frontendBridge/newSession.ts` validation
- [x] 1.2 Skip `agent.acceptMessage` for empty requests, persist claim status `created` and answer 201 `{ agentId, projectId, status: "created" }`
- [x] 1.3 Replay a `created` claim with the same agent; recovery of a `ready` empty claim finishes as `created` without a message
- [x] 1.4 Update the bridge doc comment and `src/frontendBridge/new-session.test.ts` (empty create, retry, no messages)

## 2. Frontend

- [x] 2.1 Add `allowEmptySubmit` to `MessageInput` for Enter and the send button, with the "Создать сессию" label when empty
- [x] 2.2 In `NewSessionComposer`, pass `allowEmptySubmit`, remove the empty-text guard, skip command validation for empty text and accept `created` as success
- [x] 2.3 Widen the `submitNewSession` result type in `frontend/src/lib/newSession.ts` to `sent | created`
- [x] 2.4 Tests in `frontend/src/test/new-session.test.tsx` (Enter and button on empty draft, label, no Workspace) and a check that an existing chat still ignores empty Enter

## 3. Verification

- [x] 3.1 Run backend and frontend test suites and typecheck
- [x] 3.2 `openspec validate create-empty-session --strict`
