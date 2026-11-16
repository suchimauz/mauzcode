# Tasks

## 1. Provider scaffold

- [ ] 1.1 Create `src/models/provider/qwen/` with a constants file for URLs, client id and scope; verify the namespace `models.provider.qwen` loads with `procs.repl.load`
- [ ] 1.2 Add `src/models/$modelProvider_qwen.ts` (no fields, three transports, login/loginStatus/cancelLogin/logout actions, route, listModels, test, classifier) and verify in `src/models/qwen.test.ts` that `qwen` is listed among built-in providers and a new connection reports login required

## 2. Token store

- [ ] 2.1 Implement the encrypted per-connection token store (status, token, store, invalidate, markLogin, clear) with CAS and single-flight refresh; verify with unit tests for proactive refresh, concurrent refresh dedupe, `invalid_grant` → `LOGIN_REQUIRED` and stale-revision protection
- [ ] 2.2 Delete tokens when a connection is removed; verify with a test that no `qwen-auth` secret remains

## 3. Device-code login

- [ ] 3.1 Implement login start/status/cancel on `LoginFlow` through `conn.fetch`: device code, authorize link, polling with `authorization_pending`, `slow_down`, backoff, denial, expiry and cancel; verify each spec scenario with a fake transport
- [ ] 3.2 Read userinfo after success and rename default account names; verify success and userinfo-failure tests
- [ ] 3.3 Add a secrecy test asserting status payloads and logs contain no token or device code

## 4. Logout

- [ ] 4.1 Cancel and invalidate the active login flow before deleting local tokens, then best-effort revoke; serialize flow invalidation and token persistence (or use an equivalent atomic guard) so a late poll response cannot restore credentials. Verify revoke-timeout and logout-during-poll tests: a late successful token response stores no tokens, the connection still requires login, and logout succeeds

## 5. Models, routing and failures

- [ ] 5.1 Implement `/models` discovery mapping (openai-chat, context window, image modality, malformed list → failure); verify with fixture tests
- [ ] 5.2 Implement `route()` returning the Chat Completions base and bearer header, and 401 invalidation without replay; verify route and 401 tests
- [ ] 5.3 Implement the failure classifier and connection test; verify 429/Retry-After, 402/403 plan error and unauthenticated test scenarios
- [ ] 5.3a Update `src/models/protocol/common/streamFetch.ts` to preserve a valid response `Retry-After` when a provider classifier returns no `retryAfterMs`, without changing the classifier signature. Add shared-handler regression tests for numeric and HTTP-date headers, malformed headers, explicit classifier retry hints taking precedence, and unchanged status-only fallback; include a Qwen classified-quota test with `Retry-After: 60`
- [ ] 5.4 Write the provider description (login steps, unofficial-endpoint and ToS note, limitations) and update any Models docs listing built-in providers; verify the description shows in the provider list and the public-contract fixture test passes

- [ ] 5.5 Move the existing Add connection control and expanded provider-selection/form block before the connection list in `frontend/src/components/settings/ModelsPanel.tsx`, using DOM order rather than CSS-only ordering; preserve all providers, first-connection expanded state and existing form behavior
- [ ] 5.6 Add UI regression coverage for collapsed and expanded creation controls preceding existing connections, no duplicate creation block, empty state, and successful creation without reload; verify keyboard order, visible focus and layout at narrow and wide widths

## 6. Integration

- [ ] 6.1 Hot-reload the provider, log in with the owner's subscription and stream one prompt; record the observed quota error shape and User-Agent needs in design Open Questions
- [ ] 6.2 Run the Models tests and one full project check; verify both pass with no new diagnostics
