# Model provider SDK v0

This SDK is the production inference runtime. Agents, one-shot calls, compaction,
model selection and usage all use the `models` facade. The retired `llm`, `llms`
and `node` trees are preserved under `legacy/src/`, outside all scanned roots;
their procedures, settings, hooks, compactors and HTTP routes are not loaded.
There is no fallback to them. Applied migration records and legacy tables remain
intact; retiring code is not a database rollback.

## Internal implementation navigation

The public surface is a **minimal facade** of root procedures
`ctx.fns.models.<name>`: `stream`, `call`, `compact`, `resolveRoute`, `tokenPrice`, `displayNames`, `listModels`, `setModelEnabled`,
`refreshAll`, `list`, `get`, `create`, `update`, `remove`, `test`, `usage` and
`action`, plus `models.providers` (catalogue), `models.disabledProviders` (read-through
disabled-provider set) and `models.api` (HTTP). Each facade
entry delegates once to its implementation with unchanged options, callbacks,
signal and return/error identity. Every other model procedure lives in an
implementation namespace and is called by its full name, e.g.
`models.inference.resolveReasoning`, `models.transport.parseSSE`,
`models.connections.resolve`, `models.provider.codex.codexInput`:

| Directory / runtime namespace | Responsibility |
| --- | --- |
| `models/provider/{claude,codex,custom,zaiCoding,minimaxCoding,qwen}` | Provider protocol helpers and declaration operations |
| `models/protocol` | Closed set of shared wire protocols and their registry (see below) |
| `models/transport` | Destination validation, HTTP transport and SSE parsing |
| `models/catalog` | Model discovery/cache, refresh and per-model availability |
| `models/connections` | CRUD, configuration validation, secret-free projections, resolution, actions and health/usage cache |
| `models/inference` | Stream/compact dispatch, disabled-state/input checks, reasoning and error construction |

The singular `provider` directory is intentional: a `models/providers` namespace
would collide with callable `models.providers`. Public types, declarations,
routes, migrations, the provider loader, the facade, `api`, `providers` and
`$start` remain at root. Shared runtime state remains `ctx.state.models`.
Code inside `src/models` calls implementation namespaces directly, never a root
facade entry. `internalCompatibility.test.ts` pins the facade signatures and
asserts that no other root procedure exists. `architecture.test.ts` checks executable
calls across source, plugins, frontend, scripts and tests; outside `src/models`,
only the public facade may be called. Its injected-negative cases prove that private
calls fail while quoted fixture source does not count as an executable call.

## Routes and provider inference descriptors

`models.resolveRoute({ route })` is the public network-free route lookup. Routes
are `<provider>/<accountName>:<modelId>`; the first slash and following colon delimit
identity. Account spaces and all slashes/colons in the native model id survive
parse/format unchanged. Internal parsing/formatting stays in `models.inference`.
Empty/malformed components fail `INVALID_ROUTE`; SSH-prefixed routes, bare
`provider:model` (including model separators), and unregistered providers fail
`LEGACY_ROUTE`, with instructions to choose a model. All route failures are
nonretryable SDK failures. Missing connections fail `CONNECTION_NOT_FOUND`;
current disabled connection/model state fails `CONNECTION_DISABLED` /
`MODEL_DISABLED_BY_USER`, before any provider operation.

The result contains `{ route, connectionId, provider, accountName, model, modelId,
nativeCompaction, systemPreamble?, priceVendor?, contextWindow?, maxOutputTokens? }`.
`model` is ready for `stream`/`call`; `modelId` preserves the parsed route component.
Limits come only from stored catalogue metadata. The internal `cacheOnly` read
falls back to manual ids or an empty catalogue on a cold cache, never discovers
models, reads secrets or sends traffic. Unknown model ids remain resolvable without
limits. Ordinary `listModels` still discovers on a cold cache.

`ProviderDefinition.inference` is optional: `systemPreamble` identifies a provider's
system instructions and `priceVendor` identifies its public price catalogue.
Claude declares the Claude Code identity line and `anthropic`; Codex declares
`openai`; Custom declares neither. An absent block yields absent properties, not
provider-specific fallback logic in callers. Native compaction is derived from
the provider's `compact` operation.

Connection identity is unique by `(provider, account_name)` (enforced by a
model-owned index). Account names cannot contain `/` or `:`. Duplicate creates or
renames fail `VALIDATION`, and transactions roll back configuration and secrets.
The same account name on another provider is valid. On rename, models updates only
its own connection and `models.localizationModel` (preserving native separators),
then emits `{ type: "models.connectionRenamed", provider, from, to }` through
`procs.events` **after commit**. `from` comes from the row locked by the transaction.
Failed/no-op renames emit nothing. Models never writes `agents` or `kv`; the agent
module's subscriber updates non-archived session routes and `kv.last-model`;
archived sessions remain explicitly unset. An instance-file-fixed localization setting cannot be rewritten: rename
fails atomically rather than silently leaving that route stale.

## Wire protocols

`models.protocol` owns four shared wire protocols: `openai-chat`,
`openai-responses`, `anthropic` and `gemini`. Each one is a
`types.models.Protocol` strategy object (`models.protocol.<name>.definition`) with
`baseUrl(ctx, raw)` (validate and version the base URL), `defaultHeaders()`
(protocol headers such as `anthropic-version`), `apiKeyHeaders(key)` (the standard
auth header form), `listModels(ctx, { fetch, endpoint, signal? })` and
`probe(ctx, { fetch, endpoint, model, signal? })` (one minimal non-streaming
generation). `models.protocol.get({ id })` is the only id → implementation mapping
and throws `Unsupported protocol` without a request; `models.protocol.list({})`
returns `{ id, label }[]` in registry order.

The **provider is the single entry point**: `ProviderDefinition.test` and
`listModels` stay unchanged, and a protocol is an implementation detail of the
provider. A protocol never sees the connection or its secrets. It only gets the
transport-bound `conn.fetch` and a provider-built `types.models.ProtocolEndpoint`
(`{ base, headers }`). The provider decides on authentication. For example,
`models.provider.custom.customEndpoint` merges `Accept`, the protocol's
`defaultHeaders()` and, when an API key is set, `apiKeyHeaders(key)` through one
case-insensitive `Headers`. The custom provider's protocol select must equal
`models.protocol.list({})`. Claude and Codex keep their own wire code. Plugins
cannot add shared protocols.

### Reload, unload and rollback

`procs.repl.load` replaces loaded functions but never removes registry entries
for deleted files; `procs.repl.unload({ name })` does, and only after the source
is gone (it refuses names that are still scanned and is idempotent for absent
ones). Unload does not stop running invocations, so for a change that removes
procedures:

1. Stop admitting new model operations and let in-flight calls drain; keep this
   boundary until verification completes.
2. Apply the source change (including deleted files), then run
   `ctx.fns.procs.dev.genTypes({})`.
3. Reload exact slash-delimited directories, leaves first:
   `models/protocol/common`, `models/protocol/openaiChat`,
   `models/protocol/openaiResponses`, `models/protocol/anthropic`,
   `models/protocol/gemini`, `models/protocol`; then `models/transport`,
   `models/connections`, `models/catalog`, `models/inference`,
   `models/provider/claude`, `models/provider/codex`, `models/provider/custom`;
   finally `models` (root facade and declarations). A dotted name such as
   `models.provider.codex` is a procedure, not a directory, and reloading `models`
   is not recursive.
4. Once the replacement callers are loaded, `procs.repl.unload` each removed
   exact name. For the facade reduction those were `models.assertModelEnabled`,
   `models.cached`, `models.checkInput`, `models.claudeAuth`, `models.claudeLogin`,
   `models.claudeRequest`, `models.codexAuth`, `models.codexFailure`,
   `models.codexInput`, `models.codexLogin`, `models.codexQuota`,
   `models.codexReasoningProfile`, `models.codexVersion`, `models.customProtocol`,
   `models.failure`, `models.fetch`, `models.parseSSE`, `models.resolveReasoning`,
   `models.resolve`, `models.safeMessage`, `models.toView`, `models.validateConfig`,
   `models.validateTransport` and `models.provider.custom.customProtocol`. Never
   mutate the registry directly.
5. Verify the live registry (not only the source index): removed names are absent,
   facade targets resolve and custom discovery/probing reaches `models.protocol`.
   Then resume model operations. `facadeRemoval.test.ts` covers this sequence with the
   real scanner, loader and unload and compares against a fresh boot;
   `registryReload.test.ts` separately covers provider-declaration reload.

Rollback: restore the previous source revision, regenerate types and reload each
affected exact directory (including restored wrappers and
`models/provider/custom`) before resuming calls. Unload new protocol procedures
and `models.provider.custom.customEndpoint` only after their sources are removed
and callers have drained, then verify that the previous live model catalogue is back.
No persisted data needs to be undone. Validate each changed procedure with
`strict:true, typecheck:false` and run one complete project typecheck for the
settled batch.

## Declare a provider

Put `$modelProvider_<id>.ts` in a mounted core module or mounted plugin source
namespace. Default-export a `types.models.ProviderDefinition`. The filename and
`id` must match and use lowercase kebab-case (`acme`, `acme-chat`, not `Acme`,
`acme_foo`, `acme--chat`). No plugin-owner prefix is required.

Minimal offline example, also verified by `src/models/providers.test.ts`:

```ts
export default {
    id: "acme",
    label: "Acme",
    description: "Fixture provider",
    icon: "Boxes",
    fields: [
        { key: "baseUrl", label: "Base URL", type: "url", required: true, default: "https://example.invalid" },
        { key: "apiKey", label: "API key", type: "secret", required: true },
    ],
    transports: ["direct"],
    test: async () => ({
        status: "configured",
        reason: "fixture",
        message: "Fixture only",
        checkedAt: 1,
    }),
} satisfies types.models.ProviderDefinition;
```

The example deliberately makes no network request. A real test should use the
connection's bound `fetch`, return the actual check time (`Date.now()`), and return
only safe messages. Providers run in the server process with the full `Context`;
this contract is **not** a security sandbox. Never log secrets or response bodies
that may contain credentials.

## Backend contract

`types.models.ProviderDefinition` requires `id`, `label`, `fields`, `transports`
and `test(ctx, conn)`. `description` and `icon` (Lucide name or data URL) are optional.

| Member | Result / purpose |
| --- | --- |
| `test(ctx, conn)` | `Promise<TestResult>`; required connection check |
| `listModels(ctx, conn)` | Optional `Promise<ModelInfo[]>` |
| `usage(ctx, conn)` | Optional `Promise<UsageReport>` |
| `usageRefreshMs` | Optional integer 10000–3600000 ms (default 60000): minimum interval between usage requests per connection; available and unavailable reports are cached this long, `refresh` bypasses |
| `validate(ctx, config)` | Optional synchronous/async validation; throw to reject |
| `stream(ctx, conn, req)` | Optional `Promise<StreamResult>`; streaming inference, reached only through `models.stream` |
| `compact(ctx, conn, req)` | Optional `Promise<CompactResult>`; native compaction, reached only through `models.compact` |
| `actions[name]` | `{ label, run(ctx, conn, input) }` for provider-owned login/logout or other operations |

These callbacks belong to the declaration object, not the `ctx.fns` procedure
calling convention. Runtime procedures still take a single options object.

`ResolvedConnection` contains `id`, `provider`, `accountName`, non-secret `config`,
`secret(key): Promise<string | null>` and `fetch(url, init?): Promise<Response>`.
It contains no secret reference map and no other connections. Secret access is
lazy; absent values return `null`. Use `conn.fetch` rather than global `fetch`
so the connection's transport is respected. `config` values are strings, numbers,
booleans, null or string arrays (including manually configured model ids).

`TestResult` contains `status`, machine-readable `reason`, safe `message`, and
`checkedAt` in Unix epoch milliseconds. Status is `available`, `unavailable`,
`configured`, or `disabled`; core is responsible for returning `disabled` without
calling the provider. `ModelInfo` contains a provider-native `id` with optional
`label`, `description`, `contextWindow` and `maxOutputTokens`.

`UsageReport` contains `status`, optional `reason`, and `checkedAt`; optional
`windows` contain `label`, `usedPercent` (0–100), `remaining`, and `resetAt`
(epoch milliseconds), plus optional classification metadata: a stable `id`,
`period` (`fiveHour`, `weekly`, `monthly`), `scope` (`account`, `model`,
`unknown`), `durationSeconds`, `model` and `observedAt` (epoch ms of the
window's own observation). Only windows with `scope: "account"` and an explicit
`period` fill the main quota columns; a period claimed by several distinct
account windows fills none. **Every other window — including label-only windows
from adapters that supply no metadata — is shown only as an additional limit.**
Labels are display text and are never parsed for a period. `models.connections.usage`
validates each metadata field and drops invalid values without dropping the
window. Optional `balance` is `{ amount, currency }`. The planned
status-only fallback contains no invented quota data. `State.health` reserves
cache entries with `expiresAt`, `result` and an in-flight `pending` promise;
cache execution is not implemented by the registry.

Provider actions accept and return JSON-compatible `ActionValue`. Returned values
must contain no credentials or secret references. Core does not implement
provider-specific authorization. Declaring an action does not itself expose an
HTTP endpoint or grant permission to invoke it.

## Inference and model availability

`ctx.fns.models.stream({ connectionId, model, instructions, messages, tools?, reasoningEffort?, sessionId, promptCacheKey?, runId?, state?, signal?, onEvent? })`
and `ctx.fns.models.compact({ connectionId, model, instructions, messages, sessionId, focus?, maxTokens?, signal? })`
are the only entry points to a provider's `stream`/`compact`. Before calling the
provider, they re-read the stored connection on **every** request
(`models.inference.assertModelEnabled`, no cache):

- disabled connection → code `CONNECTION_DISABLED`;
- model in the connection's `disabledModels` → `Model <model> is disabled by user`,
  code `MODEL_DISABLED_BY_USER`, `retryable:false`, `replaySafe:false`;
- provider without the operation → code `UNSUPPORTED`.

None of these send a network request. `StreamRequest.messages` is the
OpenAI-shaped transcript, `tools` are neutral `ToolSpec[]` (`name`, `description`,
JSON Schema `parameters`),
and `onEvent` receives `text_delta`, `thinking_delta` and `tool_args_delta`.
`StreamResult` supplies `text`, `thinking`, `finishReason`, `usage` and `toolCalls`.
Agent execution calls `models.resolveRoute` and `models.stream`; it measures
request timings and owns goal authorization and run accounting.

### Provider-neutral tools

Claude converts tools with `models.protocol.anthropic.toTools` (`input_schema`);
Codex uses `openaiResponses.toTools` (flat `type:function`). Custom delegates to
its configured protocol, whose stream converts with its own `toTools`:
OpenAI Chat uses nested `{ type: "function", function: ... }`, and Gemini wraps
`functionDeclarations`. Both OpenAI converters share a recursive strict-schema
check: optional object properties anywhere, including array items, disable
`strict`. Conversion does not mutate the caller's schema.

`tools.schemas({ api })` remains a legacy compatibility API with its existing
private strict check while legacy callers are loaded. It does not call private
models namespaces; models owns a self-contained check and has no dependency on
the legacy tools module. The historical contract snapshot is retained, with
explicit tests for these intentional additive descriptor/tool/facade changes.

### One-shot calls

`ctx.fns.models.call({ connectionId, model, user, system?, tools?, temperature?, maxTokens?, reasoningEffort?, responseFormat?, providerOptions?, sessionId?, timeoutMs?, signal? })`
makes one non-agent request over the provider's `stream` (providers implement no
separate call). It sends `user` as one user message and optional neutral tools
(advertised only; this call does not execute them), and returns
`{ text, finishReason, usage, reasoning?, attempts, ignored }`.

- Input is validated before any network request (`INVALID_INPUT`); enabled and
  `UNSUPPORTED` checks are the same as for `models.stream`.
- `temperature`/`maxTokens` reach only providers declaring `capabilities.sampling`;
  otherwise their names are listed in `ignored`.
- `responseFormat` (`json_object` or `json_schema`) is sent natively to providers
  declaring `capabilities.structuredOutput`, otherwise a JSON-only instruction is
  appended. The answer is always normalized to compact JSON; a violation of the
  top-level type, `required` or `additionalProperties:false` fails `INVALID_OUTPUT`.
- `providerOptions` pass through unchanged; providers reject unknown keys with
  `INVALID_INPUT` (`models.inference.rejectProviderOptions`).
- Retries (`models.inference.retryDecision`): at most 3 attempts on the **same**
  connection, only for retryable, replay-safe failures with acceptance `none` or
  `rejected`; delay `retryAfterMs` or 500/2000 ms, bounded by `timeoutMs`. The
  `sessionId` stays stable across attempts. There is no fallback chain.

Every shared protocol also implements `stream`; the custom provider streams
through its configured protocol. One-shot callers use `models.call`.

### Additive SDK contracts

Every field below is optional and opt-in. A provider declares support with
`capabilities: { continuationState?, checkpoints?, reasoning?, sampling?, structuredOutput? }` and, for
reasoning, an optional `reasoningProfile(ctx, model)`. The loader rejects
unknown flags and `checkpoints` without `compact`. `sampling` admits
`temperature`/`maxTokens` and `structuredOutput` admits `responseFormat`;
`models.stream` drops them for other providers. Claude declares `sampling`,
custom declares `sampling` and `structuredOutput`, Codex adds `structuredOutput`.

| Contract | Request | Result | Without the capability |
| --- | --- | --- | --- |
| Cache identity | `promptCacheKey` (falls back to `sessionId`) | — | ignored |
| Run state | `runId`, `state` (from the previous request of the same run) | `state: ProviderState` | `state` → `UNSUPPORTED` |
| Ordered input | `messages` may contain `{ type: "checkpoint", checkpoint }` at its exact position | — | → `UNSUPPORTED` |
| Checkpoint | — | `compact` adds `checkpoint: Checkpoint` (`kind: "native-checkpoint"`, `version: 1`, provider, connectionId, model, opaque `payload`) | only `item` |
| Reasoning | `reasoningEffort` (unchanged) → `req.reasoning: ReasoningResolution` | `reasoning: { requested, applied, fallbackReason, source, profile? }` | value passed through untouched |
| Quota | — | `quota: { windows[{ name, usedPercent, windowMinutes?, resetAt? }], source }` | absent |
| Failures | — | thrown `Error` with `code`, `status`, `retryable`, `replaySafe`, `failure: FailureInfo` | existing errors |

`models.inference.checkInput` validates all of this **before any network request**: an
aborted signal → `CANCELLED`; a checkpoint whose provider, connection or model
differs, or that is malformed, → `INVALID_INPUT`; `state` without `runId`, or
bound to another provider, connection, session or run, → `INVALID_INPUT`.
`models.stream` also drops a returned `state` that does not match the request.
Use a new `runId` per logical run (one user turn including its tool
continuations). Keep the `state` only in memory for that run, and do not persist it.

Reasoning: for opted-in providers `models.inference.resolveReasoning` uses the model's
cached discovery metadata (`ModelInfo.reasoning`, read from `models_cache`, so
inference never triggers discovery). Otherwise it falls back to the
provider's documented profile. `auto` or omitted resolves to the default. An
unsupported level goes to the nearest supported level at or below it, else the
lowest one above it, with a `fallbackReason`. An unknown preference or invalid
metadata → `INVALID_INPUT`; no metadata and no profile → `CAPABILITY_UNAVAILABLE`.

`FailureInfo` = `{ code, classification, upstreamStatus?, retryAfterMs?, acceptance: none|rejected|accepted|uncertain, retryable, replaySafe }`.
Codes: `LOGIN_REQUIRED`, `QUOTA_EXHAUSTED`, `RATE_LIMITED`, `PROVIDER_ERROR`,
`INVALID_INPUT`, `TRANSPORT`, `CANCELLED`, `UNSUPPORTED`, `CAPABILITY_UNAVAILABLE`.
The SDK never retries. Replay a request only when `replaySafe` is true.
Messages never contain upstream bodies, tokens, state or checkpoint payloads.
Token `usage` and `quota` are kept separate. A missing counter stays absent and is never reported as 0.

Model lists are cached per connection in Postgres (`models_cache`, `models_cached_at`).
The cache never expires: `models.listModels` serves it without network access, asks the
provider only with `refresh: true` (the **Update models** button) or when nothing is
cached, and keeps the old list when discovery fails. `models.refreshAll`, started hourly
by `models/$start` (disable with `MODELS_REFRESH=off`), refreshes every enabled connection.

The settings GET payload carries inert provider marks in `providerLogos` (by provider id,
built with `frontendBridge.iconData`). The `custom` provider has no brand mark: its connections
always show a generic plug icon, whatever endpoint they use.

The owner toggles models with `models.setModelEnabled({ id, model, enabled })`
(API op `setModelEnabled`). Disabled models stay in `listModels` with
`disabled: true`. No legacy model-policy settings are consulted.

### Global provider switch — `models.disabledProviders`

The owner can take a whole provider out of service (cost control, an outage, a paused
subscription) with one switch per provider in Settings → Models. Connection cards are
grouped under provider headers (logo, label, switch); providers without connections get
a header row too.

- **State**: the declared global setting `models.disabledProviders`
  (`src/models/$setting_disabledProviders.ts`, `type: "json"`, default `[]`) holds a JSON
  array of provider ids. Validation checks shape only (non-empty strings); ids of
  unregistered providers are kept, so an unloaded plugin provider returns disabled.
  Connections, their enabled flags, disabled-model sets and secrets are never touched.
- **Reader**: `models.disabledProviders()` returns a normalized `Set<string>`, reading
  through settings on every call without caching. Enforcement points call it directly;
  batch projections (`modelCatalogue`, `modelUsage`, `refreshAll`, `modelDefault`) read it
  once per request.
- **Enforcement**: the central guard `models.inference.assertProviderEnabled({ provider })`
  throws `Provider <id> is disabled` with code `PROVIDER_DISABLED` (409, not retryable,
  listed in `agent.retryCodes().never`). It runs in `assertModelEnabled` (stream, compact,
  call, countTokens), in `resolveRoute` right after parsing — before the connection lookup,
  winning over `CONNECTION_NOT_FOUND`/`CONNECTION_DISABLED`/`MODEL_DISABLED_BY_USER` — and
  before `connections.resolve` in provider actions. `connections.create` is rejected;
  `test`/`usage` return status `disabled`; `listModels` serves cache/manual ids even on
  refresh; `refreshAll` skips the provider. This is an admission check: operations admitted
  before the disable write may finish; existing streams are not cancelled; the next request
  rechecks and fails.
- **API**: GET `/models/api` and the `providers` action return `ProviderSettingsView[]`
  (`ProviderView & { enabled, enabledLocked }`), computed per request; `models.providers()`
  itself stays a synchronous declaration catalogue. The owner-only `setProviderEnabled`
  action (`{ provider, enabled }`) serializes read-modify-write in a promise-chain mutex
  (`ctx.state.models.disabledProvidersQueue`), is idempotent, and keeps unknown ids.
  A setting fixed by an instance file (`$settings_models.json`) fails with 409
  `SETTING_FIXED` and the file path (`fixedBy`); the views carry `enabledLocked: true`
  and the UI renders the switch read-only.
- **Pickers**: `frontendBridge.modelCatalogue` flags the provider's models `disabled: true`
  and its groups `enabled: false, unavailable: false`, so every picker hides them without
  unavailable-catalogue notices; `modelUsage` omits its connections; `settings.modelDefault`
  skips them. Disabled providers are absent from the Add-connection selector.

## Built-in Codex provider

`$modelProvider_codex.ts` connects a ChatGPT subscription through the Codex
backend. It has one optional field, `clientVersion`. Without it,
`models.provider.codex.codexVersion` sends the documented SDK default **0.157.1** (the floor
that exposes the GPT-6 catalogue). The SDK never runs the codex CLI, a shell
or an account-file lookup. The provider allows the `direct`, `socks` and
`ssh-tunnel` transports.

**Ownership.** The whole Codex path — conversion (`models.provider.codex.codexInput`), SSE
framing (`models.transport.parseSSE`), version, reasoning profile, failure
classification (`models.provider.codex.codexFailure`) and quota extraction
(`models.provider.codex.codexQuota`) — lives in `models`. It calls no `llm`, `llms`, `agent`
or `session` function. Allowed infrastructure: `procs.db`, `secrets.*Local`
(key from `secrets.localEncryptionKey`), `socksProxy`, `sshProvider`
and `codexTunnel.openProduction` as SSH-tunnel transport. Every byte goes
through `conn.fetch`. `src/models/codexParity.test.ts` replaces legacy
namespaces with throwing stubs and statically checks the sources.

**Inference.** The request includes `store:false`, `stream:true`,
`text.verbosity: "medium"`, `prompt_cache_key = promptCacheKey || sessionId`,
`reasoning: { effort: applied ("off" → "none"), summary: "auto" }`, and tools
with `parallel_tool_calls:true`. Headers: `originator: codex_cli_rs`,
`version`, `OpenAI-Beta: responses=experimental`, `session_id` and
`x-client-request-id` = `sessionId`. Assistant tool calls become
`function_call` items, and tool results become `function_call_output` items.
Images become `input_image`, with tool images in a following user message;
PDFs become `input_text`. Unparseable tool arguments arrive as
`{ __unparsed }`.

Sticky routing: with `runId`, the first `x-codex-turn-state` response header of
the run is returned as `state.data.turnState` and replayed on every later
request of that run. Without `runId`, or on a new run, none is sent.

Reasoning profile `codex-2026-07` (used only when discovery reports no
`supported_reasoning_levels`/`default_reasoning_level`):
`gpt-6*` → low…xhigh; `gpt-5*`, `codex-*` → off…high, plus xhigh for gpt-5.2+
and codex-max. The default is medium. Other models without metadata fail with
`CAPABILITY_UNAVAILABLE`.

**Checkpoints.** `compact` sends the transcript plus `compaction_trigger` with
the remote "memento" `x-codex-turn-metadata`. It accepts exactly one non-empty
`encrypted_content` item and a response id, otherwise it fails. The result's
`checkpoint` is plain JSON. Replay it as `{ type: "checkpoint", checkpoint }`
at the position it replaces. It becomes the native `compaction` input item
there. Legacy `codex_compaction` transcript records are rejected; legacy
conversion is not provided.

**Failures.** HTTP 401 → `LOGIN_REQUIRED` (and `needsLogin`).
`usage_limit_reached`/`usage_not_included`/`quota_exceeded`/`credits_depleted`
→ `QUOTA_EXHAUSTED`. Other 429s → `RATE_LIMITED` (retryable). 5xx →
`PROVIDER_ERROR`; other 4xx → `INVALID_INPUT`. Retry timing comes from
`resets_at`, `resets_in_seconds` or `Retry-After`. HTTP errors are `rejected`
and replay-safe. A `response.failed` event is `accepted`. A stream without a
terminal event, a malformed event, a dropped connection or an abort
mid-request is `uncertain`. None of these are replay-safe. Quota windows
come from the stream `rate_limits` payload, else
`x-codex-{primary,secondary}-used-percent/window-minutes/reset-at` headers,
with no extra request.

**Rollout and revert.** The production source path is exclusively `models.*`.
Runtime retirement requires a fresh process after regenerating declarations and
routes; a hot reload cannot prove old namespaces disappeared. Validate deployment
separately from isolated worktree tests. Historical sources remain in `legacy/`.
The agent-owned migration backs up active routes and `kv.last-model`; its `down`
restores those backups, but never restores cleared archived model selections.
Restored archived sessions require explicit selection (`MODEL_NOT_SELECTED`).
No inference path falls back to the retired runtime.

Login is the OpenAI device-code flow implemented natively over HTTP
(`models.provider.codex.codexLogin`). No codex CLI is started and nothing runs on SSH instances,
so every login request goes through the selected transport. Actions:

- `login`: returns `{ flowId, status, verificationUri, userCode, expiresAt }` and polls in the background;
- `loginStatus`: returns `{ loggedIn, needsLogin, expiresAt, flow }`;
- `cancelLogin`;
- `logout`: deletes the tokens without any network request.

The code-for-token exchange is never retried, and a flow expires after 15 minutes.
Flows are process-local.

Tokens are stored encrypted in `local_secrets` as `models/<id>.codex-auth` with
compare-and-swap revisions (`models.provider.codex.codexAuth`). Refresh happens 60 s before
expiry, through the transport, with one shared refresh per connection. A
rejected refresh or a backend 401 sets `needsLogin`, and `test` then reports
`login-required`. Models come from `/backend-api/codex/models`, usage windows
from `/backend-api/wham/usage`, and streaming and compaction from
`/backend-api/codex/responses`.

## Built-in Qwen subscription provider

`$modelProvider_qwen.ts` ("Qwen Subscription") connects a chat.qwen.ai member plan
for Qwen Code. It has no credential fields: create the connection, press **Log in**,
open the `chat.qwen.ai/authorize?user_code=…&client=cli` link and approve the code.
Helpers live in `models/provider/qwen` (namespace `models.provider.qwen`); every
URL, the public client id `qwen-code-cli` and the scope are in `constants`.

- **Login** (`login`): OAuth device authorization grant (RFC 8628) against
  `https://auth.qwen.ai/api/oauth/*`, no PKCE, all requests through `conn.fetch`.
  `authorization_pending` keeps polling, `slow_down` adds 5 s, 429/5xx/network back
  off, `expires_in` ends the flow. After success `userinfo` is read best-effort: the
  plan (`member_type`) shows in status and a default account name (`qwen`) becomes
  the email.
- **Tokens** (`auth`): one encrypted secret `models/<id>.qwen-auth`, CAS revisions,
  refresh 30 s before expiry, single-flight per connection, rotated refresh token in
  the same write; a rejected refresh means `LOGIN_REQUIRED`.
- **Logout** (`logout`): under the per-connection `lock` it cancels the login flow and
  deletes tokens, so a late poll response cannot restore them; then a best-effort
  revoke with a 5 s timeout.
- **Inference**: protocol route `openai-chat` at
  `https://api.qwen.ai/compatible-mode/v1`; discovery from `/models` (context window,
  image input noted in the description). A 401 invalidates the access token without
  replay; `failure` maps 402/403 plan and 429 quota errors to `QUOTA_EXHAUSTED` and
  other 429 to `RATE_LIMITED`. `protocol/common/streamFetch` adds a valid
  `Retry-After` to classified failures when the classifier gives no hint.
- Usage (`usage`, no network; Qwen has no usage endpoint): the plan from userinfo, and
  after a 402 `insufficient_quota` a full `Weekly credits` window until
  `quota.reset_at` (one hour when absent; process-local). The endpoints and client id are
  unofficial Qwen Code values and may change; check Qwen's terms before use. The
  discontinued free-tier flow, DashScope keys and `~/.qwen` files are not supported.

## Field schemas and transports

Each `FieldSpec` has a unique safe `key`, `label`, `type`, optional `required`,
`help`, and `placeholder`. Supported types:

- `text` / `url`: optional string `default`.
- `select`: nonempty `options: { value, label }[]` with unique values; an optional
  default must match an option.
- `secret`: **no default**. Never put a credential in help, placeholders or labels.
- `number` / `boolean`: optional default of the matching type (finite for numbers).

The loader validates declaration shape, rejects secret defaults and malformed
optional callbacks. Connection-value validation and encrypted storage belong to
the later connection-management layer, not this catalogue.

`transports` is a nonempty list of distinct `direct`, `socks`, `ssh-tunnel` values.
`TransportSpec` is `{ kind: "direct" }`, `{ kind: "socks", proxyId }` or
`{ kind: "ssh-tunnel", instance }`. The latter two reference saved infrastructure,
not inline proxy credentials. Transport execution, validation, abort/timeout and
no-direct-fallback guarantees are implemented in the separate transport block.

## Ownership and reload

The loader resolves ownership from the declaring entry's mounted `root`,
`rootDir` and absolute path, checked against `procs.modules.list({})`. A namespace
name alone is not an identity. Metadata-free development reloads must match a
trusted boot entry. Unmounted paths and path escapes are rejected.

- The first mounted owner claims a provider id.
- Another owner cannot replace it, even if both files share a module path.
- `custom` is reserved for `core`, even before its declaration loads.
- The same owner may reload its declaration, replacing the definition.
- Invalid declarations throw an error naming the file, without replacing the
  previous definition or clearing other registered providers. A batch stops on
  the invalid declaration; it does not silently skip errors.

At boot, `$loader_modelProvider.ts` registers the kind automatically. Reload an
existing namespace with `await ctx.fns.procs.repl.load({ name: "yourNamespace" })`;
`modelProvider` is a hot-reloadable declarative kind. Reloading replaces found
entries; removing/renaming a declaration does **not** reconcile stale registry
entries. Plugin mount/unmount lifecycle is separate from this SDK foundation.

## Catalogue

`await ctx.fns.models.providers({})` returns a sorted `ProviderView[]` with only
`id`, `label`, optional `description`/`icon`, copied field schemas, allowed
transports and `{ name, label }[]` action metadata. It exposes neither executable
callbacks, ownership bookkeeping, connection values nor secret references.
Unknown internal properties are not spread into the result, and secret defaults
are stripped defensively. Provider authors remain responsible for keeping their
explicit public metadata free of secrets.

## UI slot `modelProviders`

A plugin can replace the schema-driven form for its own provider. Grant the id in
`package.json` and register a component from `ui/index.tsx` (React and the
public `@mauzcode/ui` entry only):

```json
{ "procs": { "ui": { "modelProviders": ["acme"] } } }
```

```tsx
import type { UiExtension, ExtensionModelProviderProps } from '@mauzcode/ui';
function AcmeForm({ provider, connection, onSaved, onCancel }: ExtensionModelProviderProps) { /* … */ }
export default { id: 'acme', apiVersion: 1, modelProviders: [{ provider: 'acme', component: AcmeForm }] } satisfies UiExtension;
```

Props: `context`, `provider` (`ModelProviderView`), optional `connection`
(`ModelConnectionView`, secret-free: `secrets` holds only booleans), `onSaved(connection)`
and `onCancel()`. The component saves through `POST /models/api` with SDK
`requestJson` (cookie-bound CSRF). Ids must be kebab-case and never `custom`.
The component is used only when the grant lists the id and the bundle is
approved; an ungranted entry is ignored and the schema form is used; two
extensions granting the same id is a registry error. Grants are part of the
approval comparison, so adding one sends the bundle back for review. UI
grants/approval never replace backend owner checks or CSRF protection, and plugin
UI approval does not sandbox backend code.

## Verification

```sh
bun test ./src/models/ --timeout 20000
bunx tsc --noEmit
```

After adding types or declarations, regenerate types with
`await ctx.fns.procs.dev.genTypes({})`. The loader, ownership, schema validation,
secret-free projection and documentation example are covered by unit tests;
boot/reload tests cover actual declaration discovery and replacement.
