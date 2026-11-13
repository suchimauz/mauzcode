## Context

See proposal.md — Why. Today `src/models/provider/custom/customProtocol.ts` holds every protocol difference as `if` branches and is driven by an `operation` string; `customListModels` and `customTest` call it. Claude (`claudeTest`, `claudeListModels`) and Codex (`codexTest`, `codexListModels`) own their wire behavior through provider-local `*Wire*` procedures; their contracts are strict and covered by `claudeProtocol.test`, `codex.test`, `codexParity.test` and `provider/codex/helperParity.test`. The root of `src/models` holds 36 forwarding procedures from `reorganize-models-internals`; a repository search shows no caller of them outside `src/models` (in `src`, `plugins`, `frontend` or `~/.mauzcode/user`); docs reference `models.stream`, `models.compact`, `models.listModels`, `models.setModelEnabled`, `models.refreshAll` and `models.resolveReasoning`.

Constraints: one function per file, calls between project files only through `ctx.fns`, no project-file imports, hot reload through `procs.repl.load`.

## Goals / Non-Goals

Goals: strategy-per-protocol with a single selection point; protocols reusable by any provider; a common contract that Claude and Codex also express privately; a minimal root facade.

Non-Goals: streaming or compaction through shared protocols (custom keeps having no `stream`/`compact`); changing `ProviderDefinition`, the `$modelProvider_` loader or registration; letting plugins add shared protocols; migrating Claude or Codex onto shared protocols; any change to Claude/Codex requests, headers, errors, results, stream, compact, usage, login or actions; UI, HTTP API, storage or migration changes.

## Decisions

### Contract types

```ts
// types.models.ProtocolEndpoint
{ base: string; headers: Record<string, string> }

// types.models.Protocol<Endpoint = types.models.ProtocolEndpoint>
{
  id: string; label: string;
  listModels(ctx, opts: { conn: ResolvedConnection; endpoint: Endpoint }): Promise<ModelInfo[]>;
  probe(ctx, opts: { conn: ResolvedConnection; endpoint: Endpoint; model?: string }): Promise<void>;
}

// types.models.SharedProtocol = Protocol & {
//   baseUrl(raw: string): string;              // validate + versioned base
//   apiKeyHeaders(key: string): Record<string, string>;
// }
```

The `Endpoint` type parameter lets private protocols carry what they need (Codex: bearer token, account id and client version) without widening the shared shape. `probe` replaces the `operation: "generation"` branch and `listModels` replaces `operation: "models"`, so no operation string remains. Alternative rejected: pure request builders with the provider doing fetch. That moves HTTP-failure and body-cancel handling into every provider, which duplicates code.

### Layout and single selection point

```
src/models/protocol/
  get.ts            id → SharedProtocol via one object literal; unknown id throws "Unsupported custom protocol"
  list.ts           ids in registry order
  common/normalizeBase.ts   http(s), no credentials/query/fragment, trailing slashes trimmed
  common/checkedFetch.ts    conn.fetch; !ok → cancel body, throw "<what> failed (HTTP n)"
  common/openaiModels.ts    parse data[].id with de-duplication (both OpenAI protocols)
  openaiChat/      definition.ts baseUrl.ts apiKeyHeaders.ts listModels.ts probe.ts
  openaiResponses/ …
  anthropic/       …
  gemini/          …
```

Each `definition.ts` returns a `SharedProtocol` object whose methods call its sibling procedures through `ctx.fns.models.protocol.<id>.*`. The registry object literal in `get.ts` is the only place that maps id to implementation. Code outside the registry has no `if`, `switch` or ternary on the protocol id. Alternative rejected: a `$modelProtocol_` loader. The set is closed by decision, so a loader would add extension surface that nobody is meant to use.

Per-protocol behavior moved verbatim from `customProtocol`:

| Protocol | base suffix | key headers | probe path / body | catalogue |
| --- | --- | --- | --- | --- |
| openai-chat | none | `Authorization: Bearer` | `/chat/completions`, messages `Hi`, `max_tokens: 1`, `stream: false` | `data[].id` |
| openai-responses | none | `Authorization: Bearer` | `/responses`, `input: "Hi"`, `max_output_tokens: 1`, `stream: false` | `data[].id` |
| anthropic | `/v1` unless present | `x-api-key` + `anthropic-version: 2023-06-01` | `/messages`, messages `Hi`, `max_tokens: 1`, `stream: false` | `data[].id` |
| gemini | `/v1beta` unless `/v1` or `/v1beta` | `x-goog-api-key` | `/models/<id without models/>:generateContent`, `maxOutputTokens: 1` | `models[].name` without `models/` |

Discovery is `GET <base>/models`; the probe is POST with `Content-Type: application/json`. When a shared protocol's `probe` gets no model, it throws "A test model is required".

### Custom provider

`provider/custom/customEndpoint.ts` resolves `{ protocol, endpoint }`: `protocol = models.protocol.get({ id: config.protocol })`, `base = protocol.baseUrl(config.baseUrl)`, headers `Accept: application/json` merged with `protocol.apiKeyHeaders(key)` when `conn.secret("apiKey")` returns a key. `customListModels` and `customTest` keep their merging and result codes and call the protocol methods. `customProtocol.ts` is deleted. `customValidate` stays. The `protocol` select stays static in `$modelProvider_custom.ts`; a test asserts its option values equal `models.protocol.list({})`. Alternative rejected: deriving options at load time, because it would make the declaration depend on runtime state.

### Claude and Codex private protocols

`provider/claude/claudeProtocol.ts` returns `Protocol<ClaudeEndpoint>`: `listModels` returns the current static list; `probe` performs the existing `claudeWireRequest("/api/oauth/usage")` with `claudeWireHeaders({ compact: false, usage: true })` and cancels the body. `provider/codex/codexProtocol.ts` returns `Protocol<CodexEndpoint>` with an endpoint from `codexWireAuth` and `codexVersion`; `listModels` keeps the `/codex/models?client_version=` request, `codexWireChecked` and the mapping; `probe` keeps the same request and body cancel. `claudeTest`, `codexTest` and the list procedures keep login checks, reasons, messages and errors and delegate only the network step. Declarations, stream, compact, usage, actions and thin action adapters do not change. Their protocols are not added to the shared registry.

### Error messages

Protocol messages are neutral: "Model discovery request failed (HTTP n)", "Generation probe failed (HTTP n)", "Invalid model catalogue". They never reach the HTTP API or the test result: the test result keeps its fixed reason and message, and `listModels` exposes only the safe discovery error flag. Existing test assertions on `catalogue` still match.

### Minimal facade

The 13 entries listed in the proposal stay, together with `providers.ts` and `api.ts`. The 23 forwarding files are deleted, and every internal `ctx.fns.models.<removed>` call is rewritten to its implementation name (for example `models.get` → `models.connections.get`, `models.failure` → `models.inference.failure`, `models.parseSSE` → `models.transport.parseSSE`, `models.codexReasoningProfile` → `models.provider.codex.codexReasoningProfile`). `code.callers` drives the rewrite, and `code.quality` (missing-name rule) confirms nothing is left.

## Risks / Trade-offs

- [Unknown external plugin calls a removed root name] → Accepted by the owner; the change is listed as BREAKING and docs are updated.
- [Subtle Claude/Codex behavior drift] → Existing provider tests must pass with unchanged expectations; requests are compared in the custom/claude/codex local HTTP fixtures.
- [Behavior drift while splitting custom branches] → `custom.test.ts` keeps every existing path, header, versioned-base, optional-key and malformed-catalogue assertion for all four protocols.
- [Stale registry after deleting files] → Run `procs.dev.genTypes` and reload `models`; cold-boot tests in `registryReload.test.ts` stay green.
- [Generic type parameter on Protocol becomes complex] → Only `Endpoint` is generic; the remaining contract is the same for all protocols.

## Migration Plan

Single deploy with no data migration. Rollback is a git revert of the change; there are no stored artifacts to undo.
