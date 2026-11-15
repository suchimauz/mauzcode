## Why

A custom endpoint that understands the `x-session-affinity` header can keep a conversation on one backend, which keeps its prefix/prompt cache warm. MauzCode already computes a per-agent prompt cache identity but does not expose it to custom connections, so their cache hit rate depends on random load-balancing.

## What Changes

- The `custom` provider sends an `x-session-affinity` header on every streaming inference request, derived from the request's prompt cache identity (falling back to its session id).
- The header value is an opaque, stable digest: keyed with a persistent per-installation secret salt and scoped to the connection, so raw agent ids never leave the machine, different installations sharing a gateway do not collide, and the same session on two connections is not linkable.
- Forks that share their parent's transcript prefix keep the parent's affinity value (existing cache-root lineage); delegated children without inherited history get their own value, so parallel sub-agents spread across backends.
- New boolean connection field `sessionAffinity` ("Send session affinity header"), enabled by default; existing connections without the field behave as enabled.
- Model discovery and connection tests do not send the header.

## Privacy

Because the field is enabled by default, every existing custom connection starts sending a stable per-conversation identifier to its endpoint right after the update. The value is an opaque digest and reveals no agent id, but it lets the endpoint group requests of one conversation. The owner turns this off per connection with `sessionAffinity`; the field's help text says so.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `llm-custom-provider`: adds the session affinity connection field and the header on streaming inference requests.

## Impact

- `src/models/$modelProvider_custom.ts` (new field), `src/models/provider/custom/customStream.ts` (header injection), a new small procedure deriving the affinity value and owning the salt.
- Local encrypted secret store (Postgres `local_secrets`) gains one installation-wide salt entry, created on first use; `secrets.putLocal` gains an `ifAbsent` option that never overwrites an existing entry.
- No change to other providers, to `agent.cacheRoot`, or to the `models.stream` contract. Tests in `src/models/custom.test.ts`.
