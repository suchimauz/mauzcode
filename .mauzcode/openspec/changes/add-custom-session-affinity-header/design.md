## Context

`agent.run` already passes `sessionId` (agent id) and `promptCacheKey` (`agent.cacheRoot`: lineage root for transcript-sharing forks, own id otherwise) to `models.stream`. The custom provider builds one endpoint (base URL + auth headers) in `customEndpoint`, shared by discovery, test and streaming, and streams through `customStream`. Agent ids are short (two letters) and repeat across installations. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Opaque, stable, non-colliding affinity value for custom connections, header-only.
- Reuse the existing cache lineage without changing it.

**Non-Goals:**
- Sending `prompt_cache_key` or other body fields to custom endpoints (strict servers reject unknown fields).
- Affinity headers for built-in providers (Codex, Claude, OpenCode Go keep their own mechanisms).
- Additional aliases (`X-Session-Id`, `x-opencode-session`); can be added later behind the same field.
- Changing which sub-agents share a cache root.

## Decisions

- **Inject in `customStream`, not `customEndpoint`.** The endpoint is shared with discovery and test; adding the header there would leak it into non-inference requests. `customStream` copies `endpoint.headers` and adds the header before calling `protocol.stream`, so all four protocols get it without protocol branching.
- **Value = first 32 hex chars of HMAC-SHA256(salt, connectionId + ":" + (promptCacheKey || sessionId)).** HMAC with a secret salt makes values unguessable and non-reversible even though agent ids have a tiny space; including the connection id prevents cross-provider linking. 128 bits is ample for routing and fits typical header limits. Alternative considered: raw agent id (collides across installations, leaks ids); plain SHA-256 without salt (brute-forceable over two-letter ids).
- **Salt in the local encrypted secret store** (`secret://models/session-affinity-salt`, 32 random bytes, created lazily on first use, cached in memory). Persistent, stored encrypted in Postgres `local_secrets` with the encryption key held outside the database, same protection as other local secrets. Creation uses `secrets.putLocal({ ifAbsent: true })` (insert without overwrite), then always re-reads the stored value with `secrets.getLocal` before caching, so concurrent first calls end up with one salt. Alternative: `agent.instanceId` — regenerated on every process start, would break cache affinity after restarts. Alternative: a settings value — stored in plain text.
- **Derivation in a dedicated procedure** (e.g. `models.provider.custom.sessionAffinity({ connectionId, key })`) so it is unit-testable and reusable by other providers later.
- **Field `sessionAffinity` (type boolean, default true); absent ⇒ enabled.** No migration of stored connections needed.

## Risks / Trade-offs

- [A strict proxy rejects unknown headers] → owner disables `sessionAffinity` on that connection.
- [Salt cannot be read (missing or undecryptable, e.g. after the encryption key was lost)] → a new salt is generated and written over the entry; values change once and caches cool down — no correctness impact. If writing also fails, the stream proceeds without the header and logs a warning once; inference must never fail because of affinity.
- [Parallel forks sharing a cache root pin to one backend] → accepted: they share a real prefix; fresh delegated children already get their own value.

## Migration Plan

Additive. Deploy with hot reload; existing connections start sending the header. Rollback: disable the field per connection or revert the change.
