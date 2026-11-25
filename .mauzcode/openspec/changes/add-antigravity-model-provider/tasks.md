# Tasks

## 1. Provider registration and operator contract

- [ ] 1.1 Add the `antigravity` core declaration and installation-level client configuration. Prove the provider has a distinct route, no usable default credentials, and makes zero outbound calls when unconfigured.
- [ ] 1.2 Document the referenced adapter revision, Google's personal-account restriction, configuration ownership, and how to disable the provider. Verify the setup contains no credential values and does not direct users to extract credentials.

## 2. Connection authorization

- [ ] 2.1 Implement connection-bound authorization-code actions and reuse the Models PKCE login panel. Test the pre-login warning, valid remote-browser return, cancel, expiration, mismatched state and callback replay with a fake issuer.
- [ ] 2.2 Store grants in connection secrets, serialize refresh, and invalidate authorization and account caches on logout or revoked grant. Test two isolated connections, concurrent refresh, and logout during refresh; assert credentials are absent from public views, errors and logs.

## 3. Project and Gemini model discovery

- [ ] 3.1 Resolve the grant's project and fetch its inventory over the saved transport. Mixed-family, inaccessible-project and empty-inventory fixtures must yield respectively Gemini generation entries only, an access failure, and no models. Assert native IDs are preserved.
- [ ] 3.2 Wire discovery to connection test and catalogue refresh. With a recording fake transport verify that Test sends no generation, reports an empty eligible catalogue distinctly, and exposes no stale models after an account change.

## 4. Wrapped generation and tools

- [ ] 4.1 Adapt the Gemini request and wrapped SSE response over the connection transport. Test the outer model/project and inner system instructions, messages and tool declarations; assert incremental text, finish reason and normalized usage from synthetic frames.
- [ ] 4.2 Exercise a two-turn conversation with parallel tool calls and distinct opaque signatures. Verify the following request correlates the right calls, signatures and results; unsigned calls acquire no fabricated signature.
- [ ] 4.3 Map authentication, entitlement, quota, malformed stream and abort outcomes to distinct SDK results. With a request-counting transport, prove no alternate account, service or quota is tried and no partially accepted turn is replayed.

## 5. Integration verification

- [ ] 5.1 Exercise login, discovery, streamed tool round trip and logout through the Models facade using fixtures only. Verify existing Custom Gemini and OpenCode Go routes, public protocol behavior and architecture boundary tests still pass.
- [ ] 5.2 Run the project typecheck and strict validation for this change. Record exact checks and distinguish fixture coverage from any claim about live availability or permitted use.
