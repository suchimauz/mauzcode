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
  baseUrl(raw: string): string;                         // validate + versioned base
  defaultHeaders(): Record<string, string>;             // protocol-required, non-auth (anthropic-version)
  apiKeyHeaders(key: string): Record<string, string>;   // auth only
  listModels(ctx, opts: { fetch: ResolvedConnection["fetch"]; endpoint: ProtocolEndpoint; signal?: AbortSignal }): Promise<ModelInfo[]>;
  probe(ctx, opts: { fetch: ResolvedConnection["fetch"]; endpoint: ProtocolEndpoint; model: string; signal?: AbortSignal }): Promise<void>;
}
```

Protocols receive only the connection's transport-bound `fetch`, never the whole `ResolvedConnection`, so they cannot read secrets or config by construction. `model` is required: the caller (`customTest`) checks `config.testModel` and throws "A test model is required" before calling `probe`. A single type is used; a separate base contract for Claude/Codex is not introduced because nobody would implement it. `signal` is added now as an optional pass-through to `fetch`; current callers do not pass it yet.

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

Each `definition.ts` returns a `Protocol` object: `baseUrl`, `defaultHeaders` and `apiKeyHeaders` are small inline methods (they use `common/normalizeBase` through `ctx.fns`), while `listModels` and `probe` call the sibling procedures through `ctx.fns.models.protocol.<id>.*`. That gives three files per protocol instead of six. The registry object literal in `get.ts` is the only place that maps id to implementation. Code outside the registry has no `if`, `switch` or ternary on the protocol id. Alternative rejected: a `$modelProtocol_` loader. The set is closed by decision, so a loader would add extension surface that nobody is meant to use.

Per-protocol behavior moved verbatim from `customProtocol`:

| Protocol | base suffix | key headers | probe path / body | catalogue |
| --- | --- | --- | --- | --- |
| openai-chat | none | `Authorization: Bearer` | `/chat/completions`, messages `Hi`, `max_tokens: 1`, `stream: false` | `data[].id` |
| openai-responses | none | `Authorization: Bearer` | `/responses`, `input: "Hi"`, `max_output_tokens: 1`, `stream: false` | `data[].id` |
| anthropic | `/v1` unless present | default `anthropic-version: 2023-06-01` (always, also without key) + key `x-api-key` | `/messages`, messages `Hi`, `max_tokens: 1`, `stream: false` | `data[].id` |
| gemini | `/v1beta` unless `/v1` or `/v1beta` | `x-goog-api-key` | `/models/<id without models/>:generateContent`, `maxOutputTokens: 1` | `models[].name` without `models/` |

Discovery is `GET <base>/models`; the probe is POST with `Content-Type: application/json`. `probe` requires `model`; the missing-test-model check lives in `customTest`. Gemini discovery keeps today's behavior verbatim: only the id from `models[].name` is returned, `displayName` is ignored.

### Custom provider

`provider/custom/customEndpoint.ts` resolves `{ protocol, endpoint }`: `protocol = models.protocol.get({ id: config.protocol })`, `base = protocol.baseUrl(config.baseUrl)`, headers are merged through one `Headers` instance in this order, later sources overriding earlier ones case-insensitively: `Accept: application/json`, `protocol.defaultHeaders()`, then `protocol.apiKeyHeaders(key)` when `conn.secret("apiKey")` returns a key; the result is stored as a lowercase-keyed record. Protocols send these headers and set `Content-Type: application/json` for the probe last. `customListModels` and `customTest` keep their merging and result codes and call the protocol methods with `fetch: conn.fetch`; `customTest` throws "A test model is required" when `config.testModel` is empty, before any request. `customProtocol.ts` is deleted. `customValidate` stays. The `protocol` select stays static in `$modelProvider_custom.ts`; a test asserts its option values equal `models.protocol.list({})`. Alternative rejected: deriving options at load time, because it would make the declaration depend on runtime state.

### Claude and Codex

Not wrapped in protocols. The single entry point for callers is `ProviderDefinition` (`connections.test` → `definition.test`, `listModels` → `definition.listModels`); a protocol is only an internal helper of a provider. Claude and Codex keep their `*Wire*` procedures; only internal calls to removed root names are renamed. Should a future change route discovery or probing through protocols generically (for example `ProviderDefinition.protocol(ctx, conn) → { protocol, endpoint }`), the contract can gain an `Endpoint` type parameter and Claude/Codex can be expressed then.

### Error messages

All shared protocol messages are neutral: "Unsupported protocol", "Invalid base URL", "Model discovery request failed (HTTP n)", "Generation probe failed (HTTP n)", "Invalid model catalogue", "A test model is required". The old "Custom …" texts are not persisted anywhere (no DB cache, UI or docs reference them). They never reach the HTTP API or the test result: the test result keeps its fixed reason and message, and `listModels` exposes only the safe discovery error flag. Existing test assertions on `catalogue` still match.

### Minimal facade

The 13 entries listed in the proposal stay, together with `providers.ts` and `api.ts`. The 23 forwarding files are deleted, and every internal call inside `src/models` to a root name — removed or kept in the facade — is rewritten to its implementation name (for example `models.get` → `models.connections.get`, `models.failure` → `models.inference.failure`, `models.parseSSE` → `models.transport.parseSSE`, `models.codexReasoningProfile` → `models.provider.codex.codexReasoningProfile`). The facade is only for consumers outside `src/models`. `code.callers` drives the rewrite, and `code.quality` (missing-name rule) confirms nothing is left.

### Cancellation and future streaming

`listModels` and `probe` accept an optional `signal` that is passed to the given `fetch`; an aborted signal rejects the operation and releases the body. Streaming through shared protocols is planned later: the contract keeps object-shaped opts so an optional `stream(ctx, { fetch, endpoint, request, signal })` (and later `compact`) can be added to `Protocol` without changing existing methods; SSE framing would come from `models.transport.parseSSE`. This change adds neither.

## Risks / Trade-offs

- [Unknown external plugin calls a removed root name] → Accepted by the owner; the change is listed as BREAKING and docs are updated.
- [Subtle Claude/Codex behavior drift from renames] → Existing provider tests must pass with unchanged expectations.
- [Behavior drift while splitting custom branches] → `custom.test.ts` keeps every existing path, header, versioned-base, optional-key and malformed-catalogue assertion for all four protocols.
- [Stale registry after deleting files] → Run `procs.dev.genTypes` and reload `models`; cold-boot tests in `registryReload.test.ts` stay green.

## Migration Plan

Single deploy with no data migration. Rollback is a git revert of the change; there are no stored artifacts to undo.
