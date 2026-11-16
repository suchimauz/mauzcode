# Design

## Context

QwenLM/qwen-code (commit `10cab840`) has two Qwen OAuth stacks:

- **Legacy free tier** (`packages/core/src/qwen/qwenOAuth2.ts`): device code + PKCE against `https://chat.qwen.ai/api/v1/oauth2/{device/code,token}`, client id `f0304373b74a44d2b584a3fb70ca9e56`, inference on a DashScope URL from `resource_url`. Discontinued on 2026-04-15.
- **Subscription** (`subscription-oauth-client.ts`, `subscription-session.ts`, `subscription-content-generator.ts`, `oauth-config.ts`):
  - Auth base `https://auth.qwen.ai`, endpoints `/api/oauth/device/code`, `/api/oauth/token`, `/api/oauth/revoke`, `/api/oauth/userinfo`; form-encoded POSTs, JSON responses.
  - Client id `qwen-code-cli`, scope `model:invoke profile:read`, no PKCE.
  - Device response: `device_code`, `user_code`, `verification_uri`, `verification_uri_complete`, `expires_in`, `interval`. The CLI shows `https://chat.qwen.ai/authorize?user_code=…&client=cli` (plus tracking params `entry=qwen_code&paywallScene=cli`).
  - Token: `grant_type=urn:ietf:params:oauth:grant-type:device_code`; response `access_token`, `refresh_token`, `token_type: Bearer`, `expires_in`, `scope`. Errors are `{ error, error_description }`; `authorization_pending` and `slow_down` (+5 s) keep polling; 429/5xx/network back off.
  - Refresh: `grant_type=refresh_token`; refreshed 30 s before expiry and once after a 401; `invalid_grant` clears credentials. Credentials sit in `~/.qwen/subscription_credentials.json` (0600, file lock, revision counter).
  - Userinfo: `sub`, `name`, `email`, `member_type`.
  - Gateway: OpenAI-compatible `https://api.qwen.ai/compatible-mode/v1` — only `/chat/completions` and `/models` (`data[].id`, `input_modalities`, `context_window_tokens`). Default model `qwen3.8-max`.

MauzCode already has the pieces: `LoginFlow` with `kind: "device-code"`, the Codex token store (encrypted `local_secrets`, CAS revisions, single-flight refresh), protocol-route providers (`zai-coding`, `minimax-coding`) and the provider failure classifier.

## Goals / Non-Goals

**Goals:** subscription login without API keys; transport-correct traffic; Codex-level token secrecy; models and streaming through the shared `openai-chat` protocol.

**Non-Goals:** the legacy free-tier flow; DashScope/Coding Plan keys (a custom OpenAI-compatible connection already covers them); importing `~/.qwen` files; web-search MCP; usage windows (no endpoint exists).

## Decisions

1. **Built-in Models provider**: declaration `src/models/$modelProvider_qwen.ts`, adapters in `src/models/provider/qwen/` (namespace `models.provider.qwen`), tests in `src/models/qwen.test.ts`, following `codex` and `zai-coding`. Owner's choice; a separate plugin was considered and rejected so Qwen is a first-class provider like the others.
2. **Protocol route, not a custom stream.** `route()` returns `{ protocol: "openai-chat", baseUrl, headers: { Authorization } }` with a token from the store. Core handles streaming, tools and reasoning. A 401 marks the token stale (store op `invalidate`) so the next call refreshes; no automatic replay, because Chat Completions is not replay-safe.
3. **Token store mirrors `codexAuth`.** One encrypted secret `models/<connId>.qwen-auth` holding `{accessToken, refreshToken, expiresAt, needsLogin, account?}` with CAS on `version`; refresh deduplicated through a per-connection promise in namespace-owned `ctx.state`. Refresh margin 30 s (Qwen Code value).
4. **Login actions** `login`, `loginStatus`, `cancelLogin`, `logout` reuse the `LoginFlow` device-code UI. `verificationUri` is the composed `chat.qwen.ai/authorize?user_code=…&client=cli` link (falling back to `verification_uri_complete`); tracking params are omitted. Expiry comes from `expires_in`, not a fixed 15 min.
5. **Fixed identity values** (`qwen-code-cli`, scope, URLs) are constants in one `provider/qwen` file, so a Qwen-side change is a one-line fix. No User-Agent impersonation beyond a neutral `MauzCode` UA; if the gateway later requires a QwenCode UA, that is an explicit follow-up decision.
6. **Failure classifier** maps the gateway JSON `error.code`/status to SDK codes without reading bodies into messages. The existing classifier receives no response headers; update shared `protocol/common/streamFetch.ts` to merge a valid `Retry-After` into classified failures when `retryAfterMs` is absent. Support seconds and HTTP-date values, ignore malformed headers, and preserve explicit classifier retry hints. No classifier signature change is needed; regression tests cover classified responses and the existing status-only fallback.
7. **Logout fences pending login writes.** Cancel and invalidate the active flow before deleting credentials, then revoke the captured refresh token best-effort through `conn.fetch`. Serialize flow invalidation and token persistence (or use an equivalent atomic guard); aborting fetch or checking a flag before an asynchronous write alone is insufficient. A late successful device-code poll must not restore credentials or report the cancelled flow as succeeded. Cover logout during an in-flight poll as well as revoke timeout.

8. **Connection creation first in Models settings.** Move the existing `AddConnection` block before the connection list in `frontend/src/components/settings/ModelsPanel.tsx`, rather than using CSS-only ordering. Both the collapsed control and expanded provider picker/form stay above existing connections, with matching DOM and keyboard order. Apply to all providers, retain the first-connection expanded state and existing styling, accessible focus and form behavior; do not duplicate the control or redesign the tab.

## Risks / Trade-offs

- Undocumented, client-specific endpoints and a client id that belongs to Qwen Code → may break or be restricted to official clients; mitigated by constants in one file and clear `LOGIN_REQUIRED`/`UNSUPPORTED` errors.
- Terms of service may limit third-party use of the `qwen-code-cli` client → owner decision; noted in the provider description and docs.
- Refresh token rotation: if Qwen rotates refresh tokens, a lost CAS write could log the user out → store the new refresh token in the same CAS update as the access token, like Codex.
- No usage endpoint → the Models UI shows no quota bars; quota appears only as failures.

## Migration Plan

None: new built-in provider, no schema migration. Rollback is removing the provider files; existing qwen connections then report an unknown provider, and their secrets are deleted with the connections.

## Open Questions

- Exact quota/plan error shape from `api.qwen.ai` (qwen-code reads it via `subscriptionQuotaDisplay`) — to be confirmed with a live subscription during apply.
- Whether `/models` needs a specific User-Agent — verify live; adjust Decision 5 only with the owner's approval.
