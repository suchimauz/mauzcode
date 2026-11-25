# Design

## Context

The [reference adapter at revision 821f824](https://github.com/NoeFabris/opencode-antigravity-auth/tree/821f824440b2b7c9ffe96bbdfad9d5cdead2f1de) separates login (`src/antigravity/oauth.ts`, `src/plugin/token.ts`), project and inventory (`src/plugin/project.ts`, `src/plugin/quota.ts`), and wire adaptation (`src/plugin/request.ts`, `src/plugin/core/streaming/transformer.ts`). These are useful boundaries, not an OpenCode dependency. The removed Gemini Code Assist provider is not a credential source. Its shared Gemini request builder and wrapped-response reader still exist and are used by core's Gemini protocol.

## Goals / Non-Goals

Keep vendor-specific behavior inside the provider; leave the public Models facade, transcript shape and shared protocol registry unchanged. Do not read OpenCode/agy local accounts, restore old Google grants, emulate devices, automatically provision a Google project, or add account rotation. The test suite must not need a real Google login.

## Decisions

1. **Use a core provider with an opt-in connection.** Add a distinct `antigravity` declaration and provider-owned `stream`, discovery, test and login actions. A plugin such as OpenCode Go may declare a shared protocol route but cannot call private Models helpers. The public Gemini route expects a different URL and cannot wrap its entire body or unwrap responses. A core adapter can reuse `models.protocol.gemini.buildRequest` and `readStream` with unwrapping enabled, without either duplicating the codec or introducing a fifth protocol.
2. **Bind one authorization grant to one connection.** Use the existing Models authorization-code panel and provider-owned pending-flow state with expiry, cancellation, PKCE S256, single-use state and connection checks. For a remote browser, accept the returned redirect through the secured login panel, not through chat; validate the expected redirect and state before exchange. Keep deployment client material in installation-controlled secret configuration and account tokens in the connection's encrypted secret store. A missing client configuration disables sign-in. Do not embed, extract or fetch client credentials from the reference repository or another installation. Serialize refresh per connection, reject stale completions after logout, and never put tokens, redirect contents or verifiers in public status or diagnostics.
3. **Resolve account state, not global defaults.** Use the reference adapter's `loadCodeAssist` project discovery followed by `fetchAvailableModels`. Reject inaccessible projects; do not onboard on behalf of the user. Filter for identifiable Gemini text-generation entries, reject ambiguous families, preserve native IDs, and cache against connection/account state. Auth change invalidates the account view. Use discovery for a non-generating connection test; an empty successful response is not a transport error.
4. **Keep the wire adaptation narrow.** For the chosen native ID, send the account project, model and inner Gemini request to the Antigravity streaming operation. Feed its wrapped SSE records into the Gemini reader. Preserve signature associations across tool results, usage and terminal status. All server-side OAuth, discovery and inference I/O uses the resolved connection's transport and fixed expected destinations, not browser-provided URLs. Do not retry a generation after acceptance is uncertain; distinguish access denial, login required, quota and cancellation without failing over.

## Risks / Trade-offs

- **Account restrictions** → [Google's FAQ](https://antigravity.google/docs/faq/) says third-party access using a personal login violates its terms and may lead to suspension. Show the warning before login; acquiring or possessing a client configuration is not authorization. Use synthetic counterparties in development and CI. Do not present a fixture pass as proof that Google permits or serves the integration.
- **Undocumented wire contract** → Pin the reference revision above, use sanitized synthetic fixtures for mixed inventory and nested stream frames, and fail visibly on incompatible data rather than silently selecting a different product.
- **Changes to the shared Gemini codec** → Prefer the existing builder and reader as-is; run both the wrapped-provider fixtures and the ordinary unwrapped Gemini/tool-signature regressions.

## Migration Plan

Add the provider without migrating accounts, enabling existing connections, or contacting Google at startup. Existing `custom` and OpenCode Go routes remain untouched. Rollback disables the new provider through existing provider controls; logout clears connection authorization. No data migration or restoration of the removed `gemini` provider is required.
