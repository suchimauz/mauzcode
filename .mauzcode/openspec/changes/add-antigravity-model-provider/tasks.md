# Tasks

## 1. Provider registration and operator contract

- [ ] 1.1 Add the `antigravity` core declaration and a constants function with the public client ID, client secret and redirect from the reference revision, overridable by `ANTIGRAVITY_OAUTH_CLIENT_ID` and `ANTIGRAVITY_OAUTH_CLIENT_SECRET`. Prove the provider has a distinct route, overrides take effect, and a connection makes zero outbound calls before sign-in.
- [ ] 1.2 Document the referenced adapter revision, Google's personal-account restriction and the owner's acceptance of that risk, the environment overrides, and how to disable the provider. Verify the documentation contains no account tokens.

## 2. Connection authorization

- [ ] 2.1 Implement connection-bound authorization-code actions and reuse the Models PKCE login panel with the optional loopback listener and the pasted-redirect path. Test with a fake issuer: the pre-login warning, a remote-browser paste, a different host or path, a missing code, a mismatched state, cancel, expiration, and a loopback completion followed by the same paste, each exchanging a code at most once.
- [ ] 2.2 Store grants in connection secrets, serialize refresh, and invalidate authorization and account caches on logout or revoked grant. Test two isolated connections, concurrent refresh, and logout during refresh; assert account tokens, codes and verifiers are absent from public views, errors and logs.

## 3. Project and Gemini model discovery

- [ ] 3.1 Resolve the grant's project and fetch its inventory over the saved transport. Fixtures with visible, hidden, disabled, Claude and Gemini entries, an inaccessible project, and an empty inventory must yield respectively only the visible Gemini entries, an access failure, and no models. Assert native IDs are preserved.
- [ ] 3.2 Derive model metadata from the inventory: context and output limits, no limits when absent, Gemini 3 Flash `minimal|low|medium|high` and Gemini 3 Pro `low|high` sent as native `thinkingLevel`, no levels when thinking is unsupported, and no price. Test each case with fixtures.
- [ ] 3.3 Wire discovery to connection test and catalogue refresh. With a recording fake transport verify that Test sends no generation, reports an empty eligible catalogue distinctly, and exposes no stale models after an account change.

## 4. Wrapped generation and tools

- [ ] 4.1 Adapt the Gemini request and wrapped SSE response over the connection transport. Test the outer model/project and inner system instructions, messages and tool declarations; assert incremental text, finish reason and normalized usage from synthetic frames.
- [ ] 4.2 Exercise a two-turn conversation with parallel tool calls and distinct opaque signatures. Verify the following request correlates the right calls, signatures and results; unsigned calls acquire no fabricated signature.
- [ ] 4.3 Classify failures per the spec table: revoked grant, 401 with one refreshed retry, 403 access failure, 429 `QUOTA_EXHAUSTED` with reset time, 5xx before data, malformed frame and abort after data. Through the shared model call with a request-counting transport, prove quota and access failures send exactly one generation request, 401 at most two on the same account, and no alternate account, project or service is tried.

## 5. Integration verification

- [ ] 5.1 Exercise login, discovery, streamed tool round trip and logout through the Models facade using fixtures only. Verify existing Custom Gemini and OpenCode Go routes, public protocol behavior and architecture boundary tests still pass.
- [ ] 5.2 Run the project typecheck and strict validation for this change. Record exact checks and distinguish fixture coverage from any claim about live availability or permitted use.
