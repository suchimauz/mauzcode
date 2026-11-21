# Design

## Context

Built-in providers are `src/models/$modelProvider_<id>.ts` declarations (`ProviderDefinition`), with helpers under `src/models/provider/<id>/`. `qwen` is the closest model for this provider: no credential fields, an encrypted local secret with CAS revisions, single-flight refresh, a per-connection lock and process-local login flows (`LoginFlow`). `claude` already implements an authorization-code PKCE login with a pasted code, an optional `Bun.serve` loopback callback and a `submitLogin` action.

The shared `gemini` protocol (`src/models/protocol/gemini/`) converts transcripts (`toGeminiContents`), tools (`toTools`) and streams public `generateContent` SSE. It authenticates with `x-goog-api-key` and posts to `{base}/models/{model}:streamGenerateContent`. A `ProtocolRoute` can only change the base URL, headers and extra body fields. `toGeminiContents` already replays `tool_calls[].thoughtSignature`, but `stream` never captures it. `agent/run.ts` stores returned tool calls unchanged, so an extra field reaches the transcript.

Gemini CLI (`packages/core/src/code_assist`) is the reference: `oauth2.ts` (client, scopes, PKCE, `codeassist.google.com/authcode`, loopback `/oauth2callback`), `setup.ts` (`loadCodeAssist` / `onboardUser` / LRO polling), `server.ts` (`v1internal:<method>`, SSE `alt=sse`), `converter.ts` (`{model, project, user_prompt_id, request}` wrapper, `response` unwrapping) and `geminiChat.ts` (`skip_thought_signature_validator`).

## Goals / Non-Goals

**Goals:**
- Reuse the shared Gemini conversion and SSE parsing instead of copying them.
- Keep all network traffic on `conn.fetch`, which covers SOCKS and SSH tunnel transports, except the local loopback listener.
- Match Gemini CLI wire behavior closely enough that Code Assist accepts the requests.

**Non-Goals:**
- API keys, Vertex AI, a manual Google Cloud project field, `GOOGLE_CLOUD_PROJECT` env support.
- Gemini CLI telemetry (`recordConversationOffered`, metrics), experiments, admin controls, AI-credit overage (`enabled_credit_types`).
- Reading `~/.gemini` credential files or running the Gemini CLI binary.
- Dynamic model discovery (Code Assist has no model list endpoint).

## Decisions

### Own `stream`, not `route`
Code Assist uses a different URL shape (`v1internal:streamGenerateContent`) and wraps both the request and every response event. A `ProtocolRoute` cannot express either. Adding a fifth shared protocol is also wrong, because the protocol set is closed to four entries. The provider therefore declares `stream`/`countTokens` itself.
- Alternative: a `wrap` hook on the shared protocol. Rejected because it widens the protocol contract for one provider.

### Shared Gemini reading helpers
Extract two pure helpers from `protocol/gemini/stream.ts`: `buildRequest` (contents, systemInstruction, tools, generationConfig from a `StreamRequest`) and `readStream` (SSE → deltas and `StreamResult`, with an optional `unwrap` that reads `event.response`). The shared protocol calls them with no unwrap. The provider wraps the built request and unwraps responses. The public protocol behavior stays the same and is covered by existing tests.

### Thought signatures
`readStream` copies `part.thoughtSignature` to the tool call. `StreamResult.toolCalls[]` gains an optional `thoughtSignature?: string` (`session.Message` already declares it, and `toGeminiContents` already replays it). Each call keeps exactly the signature its own part carried: with parallel calls Gemini signs only the first call, so the others stay unsigned and are replayed unsigned. Before sending, the provider adds `skip_thought_signature_validator` to the first `functionCall` part of a model turn only when no `functionCall` part in that turn has a signature (for example a transcript from another provider), as Gemini CLI does. Signatures on text-only parts are not stored; Gemini validates only function-call turns. The shared public protocol does not add the placeholder; the public API is not changed here.
- Alternative: store the raw model parts in `tool_calls[0].geminiParts`, which `toGeminiContents` can replay unchanged. Rejected because it needs a new `StreamResult` field and changes in `agent/run.ts` to copy raw parts into the transcript, duplicates text and arguments, and its strict match check fails once a transcript is edited or compacted. A per-call signature is enough for the validator and already fits the stored message shape.

### Login
Copy the shape of `claude/claudeLogin`: one flow per connection in `ctx.state.models.geminiLogin`, a ten-minute timer, a `busy` flag for single exchange, and `Bun.serve({ hostname: "127.0.0.1", port: 0 })` for the loopback. Each redirect URI gets its own authorization URL. Both share the verifier and state, and the exchange uses the redirect that matches the code's source. The public flow view uses `kind: "authorization-code"`, `authorizationUrl` (paste flow), `callbackListening` and a new optional `LoginFlow.callbackAuthorizationUrl` (loopback flow, set only while the listener runs). The Models settings panel shows the second link labelled "Browser on this machine" next to the paste field when the field is present; providers that do not set it (`claude`) keep their current view. The field contains no secret: the authorization URL holds only the client id, challenge and state. The token exchange sends `client_secret` because Google installed-app clients require it. The secret is public in Gemini CLI and lives in `constants`.
- Alternative: a device-code flow. Rejected because Google's device flow does not allow the `cloud-platform` scope for this client.

### Token store and setup state
One secret `models/<id>.gemini-auth` stores `{ accessToken, refreshToken, expiresAt, needsLogin, account: { email }, projectId?, tier?: { id, name } }`, following `qwen/auth` ops (`status`, `token`, `store`, `account`, `setup`, `invalidate`, `markLogin`, `clear`). Storing project and tier in the same CAS record means logout clears them. `setup` runs right after login (best effort, the error is kept in status) and lazily in `request` when `projectId` is missing, single-flight per connection.

### Request helper
`request({ conn, method, body, stream?, signal })` builds `https://cloudcode-pa.googleapis.com/v1internal:<method>` and adds a bearer token, `Content-Type` and the `User-Agent` `GeminiCLI/<pinned>/<model> (<platform>; <arch>; mauzcode)`. It sends through `conn.fetch` and maps 401 to `invalidate`, so the next request refreshes the token first; a rejected refresh then reports `LOGIN_REQUIRED`. LRO polling uses `GET v1internal/<operation name>`. Non-stream calls retry nothing automatically. The SDK retry policy decides.

### Wire shapes
- `streamGenerateContent?alt=sse` body: `{ model, project, user_prompt_id, request: { contents, systemInstruction?, tools?, generationConfig?, session_id } }`. `session_id` is `StreamRequest.sessionId`. `user_prompt_id` is `<sessionId>########<n>`, where `n` counts user turns in the transcript, so it is stable across retries of one step and changes on a new user turn (Gemini CLI uses the same `<session>########<turn>` form). Each SSE event is `{ response: <GenerateContentResponse>, traceId? }`; `readStream` reads `event.response`.
- `countTokens` body has no project or prompt id: `{ request: { model: "models/<model>", contents } }`, where `contents` comes from the same conversion as streaming, with the system instruction as a leading user content because this request has no `systemInstruction` field. The response is `{ totalTokens }`.

### Reasoning
`reasoningProfile(model)` returns versioned SDK capabilities (`profile: "gemini-code-assist-<date>"`) using only SDK levels (`ReasoningLevel` has no `auto`; an omitted or auto preference resolves to `applied: "auto"` when no `default` is declared):
- Gemini 3: `supported` `low`, `high` (plus `medium` for flash), no `default`; `wire` equals the level name and is sent as `thinkingLevel`.
- Gemini 2.5: `supported` `low`, `medium`, `high` (plus `off` with `disable: true` for flash and flash-lite), no `default`; `wire` `{ low: "1024", medium: "8192", high: "24576", off: "0" }`, sent as the number `thinkingBudget`.

Applied `auto` sends `thinkingConfig: { thinkingBudget: -1, includeThoughts: true }` on Gemini 2.5 (dynamic thinking) and `{ includeThoughts: true }` on Gemini 3 (model default level). The provider builds `thinkingConfig` itself and replaces whatever `buildRequest` produced: `buildRequest` takes an option to omit reasoning, so the shared protocol's `thinkingLevel` rule never reaches the Code Assist body. `includeThoughts` is sent with every applied level except `off`.

### Models and limits
`constants.models` is a dated array of `{ id, label, reasoning, imageInput }`, taken from Gemini CLI `config/models.ts` (`VALID_GEMINI_MODELS`, excluding `none` and the `-customtools` variant). `inference.catalog.modelsDev: ["google"]` supplies limits.

### Usage and failures
`usage` calls `retrieveUserQuota({ project })` and maps buckets to additional windows `{ label: modelId, usedPercent: round((1 - remainingFraction) * 100), resetAt }`, with tier and email as plan details. Buckets without `modelId` or a numeric `remainingFraction` are skipped. Several buckets for one model (for example per token type) merge into one window with the lowest remaining fraction and the reset time of that bucket (earliest reset on a tie). Windows are sorted by model id. `failure` parses Google RPC errors: `RESOURCE_EXHAUSTED` with a `QuotaFailure` or `ErrorInfo` reason of quota exhaustion → `QUOTA_EXHAUSTED`/`quota`; any other 429 → `RATE_LIMITED`/`throttled`; `RetryInfo.retryDelay` → `retryAfterMs`. 403 → `auth`, 404 → `MODEL_UNAVAILABLE`. The provider's `stream` passes it to `streamFetch` as `classifyFailure`.

## Risks / Trade-offs

- [Unofficial API and client id may change or be restricted by Google] → Isolate all URLs, ids and the version in `constants`. Document the risk and recommend checking Google's terms.
- [Google may limit, suspend or block an account used through a third-party client with Gemini CLI's identity] → The provider description, shown when choosing the provider, and the docs say so plainly and recommend a separate or non-critical Google account. The provider is opt-out through the existing `disabledProviders` setting. No automatic fallback to other Google identities.
- [Loopback listener on a remote server is unreachable from the user's browser] → The paste-code link is always the primary path. Loopback is marked as for a browser on the same machine.
- [Loopback traffic does not use the connection transport] → It only receives the redirect locally. The token exchange still uses `conn.fetch`.
- [Static model list goes stale] → Versioned constant with a date, plus 404 → `MODEL_UNAVAILABLE` and the per-model enable switch.
- [Placeholder signature may be rejected in future] → Applied only on the Code Assist path, where Gemini CLI uses it. Tested as a separate rule so it is easy to remove.
- [Refactoring the shared Gemini stream could change public protocol behavior] → Existing protocol tests must stay green before the provider uses the helpers.

## Migration Plan

Additive: a new provider file and an optional result field. No database migration. Rollback is deleting the provider files. Connections created meanwhile then become unknown-provider connections, the same as for any removed provider.
