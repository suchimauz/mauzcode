## Context

See proposal.md — Why. Today `src/models/provider/custom/customProtocol.ts` holds every protocol difference as `if` branches and is driven by an `operation` string; `customListModels` and `customTest` call it. Claude (`claudeTest`, `claudeListModels`) and Codex (`codexTest`, `codexListModels`) own their wire behavior through provider-local `*Wire*` procedures; their contracts are strict and covered by `claudeProtocol.test`, `codex.test`, `codexParity.test` and `provider/codex/helperParity.test`. The root of `src/models` holds 36 forwarding procedures from `reorganize-models-internals`; a repository search shows no caller of them outside `src/models` (in `src`, `plugins`, `frontend` or `~/.mauzcode/user`); docs reference `models.stream`, `models.compact`, `models.listModels`, `models.setModelEnabled`, `models.refreshAll` and `models.resolveReasoning`.

Constraints: one function per file, calls between project files only through `ctx.fns`, no project-file imports, hot reload through `procs.repl.load`.

## Goals / Non-Goals

Goals: strategy-per-protocol with a single selection point; protocols reusable by any provider; a minimal root facade.

Non-Goals: streaming or compaction through shared protocols (custom keeps having no `stream`/`compact`); changing `ProviderDefinition`, the `$modelProvider_` loader or registration; letting plugins add shared protocols; migrating Claude or Codex onto shared protocols or wrapping their wire code in a protocol object; any change to Claude/Codex requests, headers, errors, results, stream, compact, usage, login or actions; UI, HTTP API, storage or migration changes.

## Decisions

### Contract types

```ts
// types.models.ProtocolEndpoint
{ base: string; headers: Record<string, string> }

// types.models.Protocol (the only protocol type)
{
  id: string; label: string;
  baseUrl(ctx, raw: string): string;                    // validate + versioned base
  defaultHeaders(): Record<string, string>;             // protocol-required, non-auth (anthropic-version)
  apiKeyHeaders(key: string): Record<string, string>;   // auth only
  listModels(ctx, opts: { fetch: ResolvedConnection["fetch"]; endpoint: ProtocolEndpoint; signal?: AbortSignal }): Promise<ModelInfo[]>;
  probe(ctx, opts: { fetch: ResolvedConnection["fetch"]; endpoint: ProtocolEndpoint; model: string; signal?: AbortSignal }): Promise<void>;
}
```

Protocols receive only the connection's transport-bound `fetch`, never the whole `ResolvedConnection`, so they cannot read secrets or config by construction. `model` is required: `probe` rejects an empty model with "A test model is required" before any request. `customTest` calls `probe` only after successful discovery and when `config.testModel` is non-empty; without a test model it returns `available` / `models-ok` only after successful discovery. Discovery failure always returns `unavailable` / `models-failed` without calling `probe`, exactly as today. Every method takes `ctx` explicitly, so the protocol object returned by `definition` holds no captured state and `get` can return it without rebuilding per call. A single type is used; a separate base contract for Claude/Codex is not introduced because nobody would implement it. `signal` is added now as an optional pass-through to `fetch`; current callers do not pass it yet.

`probe` replaces the `operation: "generation"` branch and `listModels` replaces `operation: "models"`, so no operation string remains. Alternative rejected: pure request builders with the provider doing fetch. That moves HTTP-failure and body-cancel handling into every provider, which duplicates code.

### Layout and single selection point

```
src/models/protocol/
  get.ts            id → Protocol via one object literal; unknown id throws "Unsupported protocol"
  list.ts           { id, label }[] in registry order
  common/normalizeBase.ts   http(s), no credentials/query/fragment, raw string containing "?" or "#" rejected (even empty), trailing slashes trimmed; throws "Invalid base URL"
  common/checkedFetch.ts    opts.fetch with opts.signal; !ok → cancel body, throw "<what> failed (HTTP n)"
  common/openaiModels.ts    parse data[].id with de-duplication (both OpenAI protocols)
  openaiChat/      definition.ts listModels.ts probe.ts
  openaiResponses/ …
  anthropic/       …
  gemini/          …
```

Each `definition.ts` returns a `Protocol` object: `baseUrl`, `defaultHeaders` and `apiKeyHeaders` are small inline methods (`baseUrl(ctx, raw)` calls `common/normalizeBase` through the passed `ctx.fns`), while `listModels` and `probe` call the sibling procedures through `ctx.fns.models.protocol.<id>.*`. That gives three files per protocol instead of six. The registry object literal in `get.ts` is the only place that maps id to implementation. Code outside the registry has no `if`, `switch` or ternary on the protocol id. Alternative rejected: a `$modelProtocol_` loader. The set is closed by decision, so a loader would add extension surface that nobody is meant to use.

Per-protocol behavior moved verbatim from `customProtocol`:

| Protocol | base suffix | key headers | probe path / body | catalogue |
| --- | --- | --- | --- | --- |
| openai-chat | none | `Authorization: Bearer` | `/chat/completions`, messages `Hi`, `max_tokens: 1`, `stream: false` | `data[].id` |
| openai-responses | none | `Authorization: Bearer` | `/responses`, `input: "Hi"`, `max_output_tokens: 1`, `stream: false` | `data[].id` |
| anthropic | `/v1` unless the base already ends with `/v1` (any other ending, including `/v1beta` or `/v2`, gets `/v1` appended) | default `anthropic-version: 2023-06-01` (always, also without key) + key `x-api-key` | `/messages`, messages `Hi`, `max_tokens: 1`, `stream: false` | `data[].id` |
| gemini | `/v1beta` unless the base already ends with `/v1` or `/v1beta` (any other ending, including `/v1alpha`, gets `/v1beta` appended) | `x-goog-api-key` | `/models/<id without models/>:generateContent`, `maxOutputTokens: 1` | `models[].name` without `models/` |

Discovery is `GET <base>/models`; the probe is POST with `Content-Type: application/json`. `probe` requires `model`; the missing-test-model check lives in `customTest`. Gemini discovery keeps today's behavior verbatim: only the id from `models[].name` is returned, `displayName` is ignored.

### Custom provider

`provider/custom/customEndpoint.ts` resolves `{ protocol, endpoint }`: `protocol = models.protocol.get({ id: config.protocol })`, `base = protocol.baseUrl(ctx, config.baseUrl)`, headers are merged through one `Headers` instance in this order, later sources overriding earlier ones case-insensitively: `Accept: application/json`, `protocol.defaultHeaders()`, then `protocol.apiKeyHeaders(key)` when `conn.secret("apiKey")` returns a key; the result is stored as a lowercase-keyed record. Protocols send these headers and set `Content-Type: application/json` for the probe last. `customListModels` and `customTest` keep their merging and result codes and call the protocol methods with `fetch: conn.fetch`; `customTest` without `config.testModel` performs discovery only and returns `available` / `models-ok` only if discovery succeeds; after successful discovery with a test model, it also calls `probe` and returns `generation-ok` or `generation-failed`. If endpoint preparation or discovery fails, it returns the existing fixed `unavailable` / `models-failed` result and never calls `probe`, with or without a test model. `customProtocol.ts` is deleted. `customValidate` stays. The `protocol` select stays static in `$modelProvider_custom.ts`; a test asserts its option values equal `models.protocol.list({})`. Alternative rejected: deriving options at load time, because it would make the declaration depend on runtime state.

### Claude and Codex

Not wrapped in protocols. The single entry point for callers is `ProviderDefinition` (`connections.test` → `definition.test`, `listModels` → `definition.listModels`); a protocol is only an internal helper of a provider. Claude and Codex keep their `*Wire*` procedures; only internal calls to removed root names are renamed. Should a future change route discovery or probing through protocols generically (for example `ProviderDefinition.protocol(ctx, conn) → { protocol, endpoint }`), the contract can gain an `Endpoint` type parameter and Claude/Codex can be expressed then.

### Error messages

All shared protocol messages are neutral: "Unsupported protocol", "Invalid base URL", "Model discovery request failed (HTTP n)", "Generation probe failed (HTTP n)", "Invalid model catalogue", "A test model is required". The old "Custom …" texts are not persisted anywhere (no DB cache, UI or docs reference them). They never reach the HTTP API or the test result: the test result keeps its fixed reason and message, and `listModels` exposes only the safe discovery error flag. Existing test assertions on `catalogue` still match.

### Minimal facade

The 13 entries listed in the proposal stay, together with `providers.ts` and `api.ts`. The 23 forwarding files are deleted, and every internal call inside `src/models` to a root name — removed or kept in the facade — is rewritten to its implementation name (for example `models.get` → `models.connections.get`, `models.failure` → `models.inference.failure`, `models.parseSSE` → `models.transport.parseSSE`, `models.codexReasoningProfile` → `models.provider.codex.codexReasoningProfile`). The facade is only for consumers outside `src/models`. `code.callers` drives the rewrite, and `code.quality` (missing-name rule) confirms nothing is left.

### Cancellation and future streaming

`listModels` and `probe` accept an optional `signal` that is passed to the given `fetch`; a signal already aborted before the call rejects with an AbortError without calling `fetch`; a signal aborted after the response arrives rejects the operation and cancels the response body. Streaming through shared protocols is planned later: the contract keeps object-shaped opts so an optional `stream(ctx, { fetch, endpoint, request, signal })` (and later `compact`) can be added to `Protocol` without changing existing methods; SSE framing would come from `models.transport.parseSSE`. This change adds neither.

## Risks / Trade-offs

- [Unknown external plugin calls a removed root name] → Accepted by the owner; the change is listed as BREAKING and docs are updated.
- [Subtle Claude/Codex behavior drift from renames] → Existing provider tests must pass with unchanged expectations.
- [Behavior drift while splitting custom branches] → `custom.test.ts` keeps every existing path, header, versioned-base, optional-key and malformed-catalogue assertion for all four protocols.
- [Stale registry after deleting files] → Follow the exact nested reload and explicit `procs.repl.unload` sequence below; compare the live registry with fresh discovery in a migration regression. The existing `registryReload.test.ts` only verifies provider declaration replacement and is not sufficient.

## Migration Plan

Single deploy with no data migration. Hot reload is not recursive and does not remove absent source files: `procs.repl.load({ name: "models" })` only reloads the root module and its declarations, while `procs.dev.genTypes({})` only regenerates types.

1. Stop admitting new model operations and let existing calls drain before applying the source changes. Keep that maintenance boundary until verification completes; `procs.repl.unload` does not stop existing invocations.
2. Apply the complete source changes, including removal of the 23 forwarding files listed in proposal.md and `provider/custom/customProtocol.ts`, then run `procs.dev.genTypes({})`.
3. Reload exact slash-delimited module directories with `procs.repl.load({ name })`: first `models/protocol/common`, `models/protocol/openaiChat`, `models/protocol/openaiResponses`, `models/protocol/anthropic`, `models/protocol/gemini` and `models/protocol`; then `models/transport`, `models/connections`, `models/catalog`, `models/inference`, `models/provider/claude`, `models/provider/codex` and `models/provider/custom`; finally `models` for root procedures and provider declarations. If the final implementation introduces another nested directory, add its exact target to the deployment inventory; individual changes may instead use their full dotted function names. Do not use a dotted namespace as a module reload target.
4. After replacement callers are loaded, call `procs.repl.unload({ name })` for each of the 23 exact removed `models.<name>` entries from proposal.md and for `models.provider.custom.customProtocol`. The supported unload operation refuses names whose function source still exists and is idempotent for already absent entries; do not mutate the registry directly.
5. Verify the actual live registry, not proxy property presence or only the source index: every removed function is absent, every retained facade target resolves, and custom discovery/probing reaches the new protocol procedures using local fixtures. Compare model procedure names with a separate fresh-boot fixture, then resume model operations. Add this regression using the real scanner, loader and unload operation; retain the existing provider-declaration reload test separately.

Rollback restores the previous source revision, regenerates types and reloads each affected exact module directory, including restored wrappers and `models/provider/custom`, before resuming calls. Unload new protocol procedures and `models.provider.custom.customEndpoint` only after their source files have been removed and replacement callers have drained; verify the previous live model catalogue is restored. There are no persisted data artifacts to undo.
