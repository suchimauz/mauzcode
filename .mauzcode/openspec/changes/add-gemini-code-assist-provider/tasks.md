# Tasks

## 1. Shared Gemini protocol

- [x] 1.1 Extract `buildRequest` (with an option to omit the reasoning mapping) and `readStream` (with optional `unwrap`) from `protocol/gemini/stream.ts` and verify the existing gemini protocol tests pass unchanged
- [x] 1.2 Capture `functionCall` `thoughtSignature` into returned tool calls, add optional `thoughtSignature` to `StreamResult.toolCalls`, and verify with tests for signed, unsigned, parallel calls with only the first signed, and replayed calls (stream → stored message → `toGeminiContents`)
- [x] 1.3 Update `public-contract.baseline.json` if the type change affects it and verify the contract test passes

## 2. Provider skeleton, tokens and login

- [x] 2.1 Add `models/provider/gemini/constants` (URLs, public client, scopes, pinned CLI version, dated model list) and `$modelProvider_gemini.ts` with no fields, direct/socks/ssh-tunnel transports and a description that warns about the unofficial API and account-block risk; verify the provider registry and architecture tests list `gemini`
- [x] 2.2 Implement `auth` (encrypted CAS record, 60 s refresh, single-flight, `invalid_grant` → LOGIN_REQUIRED, invalidate, clear) and `lock`; verify with mocked-fetch tests for refresh, concurrent refresh, rejected refresh and stale revision
- [x] 2.3 Implement `login` (PKCE S256, state, paste-code redirect, 10-minute flow, single exchange, restart/cancel) with best-effort userinfo; verify with tests for success over the transport, rejected code, duplicate code, expiry and restart
- [x] 2.4 Add optional `callbackAuthorizationUrl` to `LoginFlow` (and the public contract baseline), then the `127.0.0.1` loopback listener that sets it with its own authorization URL and state check; verify with tests for callback success, state mismatch, bind failure fallback (no `callbackAuthorizationUrl`) and listener closing on every exit path
- [x] 2.5 Implement `loginStatus`, `logout` (cancel flow, delete tokens under lock, 5 s best-effort revoke) and the login actions; verify with tests that status never contains tokens, verifier or code, and that a late exchange after logout stores nothing
- [x] 2.6 Update `frontend/src/components/settings/ModelsPanel.tsx` to show a "Browser on this machine" link from `callbackAuthorizationUrl` next to the paste link and code field, leaving `claude` flows unchanged; verify with the frontend typecheck/tests and manually in the Models settings

## 3. Code Assist setup and requests

- [x] 3.1 Implement `request` (v1internal URL, bearer, User-Agent, 401 → invalidate, transport only); verify with tests for headers, URL, 401 handling and 401 followed by a rejected refresh → `LOGIN_REQUIRED`
- [x] 3.2 Implement `setup` (`loadCodeAssist`, `onboardUser`, LRO polling up to 2 min, stored project and tier, single-flight, lazy run); verify with tests for existing project, free-tier onboarding, INELIGIBLE, PROJECT_REQUIRED, VALIDATION_REQUIRED and timeout

## 4. Inference

- [x] 4.1 Implement `reasoningProfile` with SDK levels only, no default, and wire values (Gemini 3 levels, Gemini 2.5 budgets, `off` with `disable` for flash/flash-lite); verify with table tests per model and level, including applied `auto` → `thinkingBudget: -1` on 2.5 and no level on 3, and no `includeThoughts` for `off`
- [x] 4.2 Implement provider `stream` (wrapped request with model, project, `user_prompt_id` `<sessionId>########<n>`, `session_id`; unwrapped `response`; structured output; sampling; provider-built `thinkingConfig` replacing the shared mapping; placeholder signature only when no call in a turn is signed); verify with tests for wrapping, a stable prompt id on retry, deltas, signatures (including parallel calls), structured output and an interrupted stream
- [x] 4.3 Implement `countTokens` through `v1internal:countTokens` with body `{ request: { model: "models/<model>", contents } }` (instructions as a leading user content, no project); verify with a test of the exact body that returns `totalTokens` and sends no generation request
- [x] 4.4 Implement `failure` (quota vs throttled 429, RetryInfo, 403, 404) and wire it as `classifyFailure`; verify with tests that no upstream body text reaches the message

## 5. Models, usage and test

- [x] 5.1 Implement `listModels` from the constant list with google catalogue limits; verify with a test that no request is sent
- [x] 5.2 Implement `usage` from `retrieveUserQuota` (per-model windows, tier, email, 60 s refresh); verify with tests for remaining fraction → used percent and reset time, skipped invalid buckets and merged duplicate buckets per model
- [x] 5.3 Implement `test` (setup-based available/unauthorized/unavailable); verify with tests for each outcome
- [x] 5.4 Add the "Built-in Gemini (Google account) provider" section to `docs/models-providers.md`, including the unofficial-API and account-block warning with the advice to use a non-critical Google account, and verify that its links and names match the code

## 6. Integration checks

- [x] 6.1 Run the project typecheck and `bun test src/models` and verify both pass
- [x] 6.2 Run a manual acceptance check on a real Google account: login (paste and loopback), automatic onboarding, model list, a Gemini 3 tool loop without signature errors, the quota card and logout
- [x] 6.3 Run `openspec validate add-gemini-code-assist-provider --strict` after ticking the tasks and verify it passes

## Workflow follow-up

- Archive the change after review and acceptance.
