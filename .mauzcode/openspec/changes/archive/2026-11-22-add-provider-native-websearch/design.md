# Design

## Context

`plugins/websearch/src/websearch/search.ts` currently ignores session context, chooses a public engine and normalizes its results. `answer` calls `search`, then `read`, then a separately selected answer model. `$websearchProvider` already checks declaration ownership; the plugin manifest also owns settings, including a Brave secret reference. Models providers separately receive a `ResolvedConnection` with scoped credentials and `conn.fetch`. The run loop knows which provider produced a tool call; a later look at the chat's selected model is not proof of that fact.

## Goals / Non-Goals

- Preserve one explicit retrieval API for agents, one normalized listing of links, and two independent extension points: ordinary search engines and model-bound search operations.
- Do not inject a hosted search tool into Responses, add a new native agent tool, expose a global `codex` engine, read pages using a subscription, or change how `answer` chooses its synthesis model. Ordinary OpenSERP's internal DuckDuckGo/Bing behavior is not cross-provider fallback and does not change.

## Decisions

### 1. Move ownership, not user settings

Core `src/websearch` owns `search`, `providers`, `read`, `fetch`, `answer`, the normalizer, shared types and the declaration loader. Keep the official `websearch` plugin ID, its three ordinary engines and its existing setting descriptors/ownership where needed by the plugin configuration UI. Keep stable keys (`websearch.defaultEngine`, `websearch.fetchModel`, `websearch.braveApiKey`, `websearch.openserpEndpoint`) and environment overrides; never copy a credential. Separate public functions from plugin implementation functions by exact registered name. Remove the old copy in the same change; do not let loader precedence choose between duplicate registrants. Public compatibility entry points delegate in one direction only. Third-party `$websearchProvider_<id>` declarations retain owner validation, reload/unmount behavior and result shape.

Preserve the logical websearch grant for the promoted facade rather than adding `websearch.*` to Standard's core allow list. Account for the current namespace-based `agentPreset.origin` and plugin-owned setting checks; use explicit facade membership, not a broad namespace exception for new helpers. Enforce effective grants/denies where the facade is entered, including the search stage of `answer`: nested runtime calls do not automatically repeat the top-level preset check. Keep frozen snapshots, inherited intersections, discovery and `websearch`-disabled installations compatible. The loader being present in core is not permission to spend an account.

Use the same exact-name membership for authorization and discovery. For the mounted `websearch` plugin, `plugins.search`, `plugins.read`, `plugins.docs` and `plugins.functions` combine its physically contributed functions with the logical facade, deduplicate by name and apply the effective preset. A preset that denies all engine handlers must still find `websearch.search` if it is allowed. Do not register aliases, claim the whole namespace or change physical ownership for settings, loading or unloading.

### 2. Choose the source once

| Caller / arguments | Link source |
| --- | --- |
| Explicit ordinary `engine` | That public engine, regardless of model; unknown IDs fail |
| No engine; the issuing inference had native search | Only that provider registration, model and connection |
| No engine; ordinary caller outside tool dispatch, or issuing inference had no native search | Stored ordinary engine (`google-browser` on a fresh install); adding native support later does not change this step |
| No engine; native search was present at inference, but the registration was reloaded, replaced or removed, or its binding is unavailable, stale or cancelled | Safe error; neither a replacement handler nor an ordinary engine receives the query |

Check permissions before credential lookup. Use the existing result schema and normalizer; report `native:<provider-id>` in `engine`. A colon cannot occur in registered kebab-case public engine IDs. This is output provenance, not an input selector. `providers`, `providerIds` and Settings enumerate only ordinary engines. Neither status discovery nor explicit ordinary selection needs model credentials.

### 3. Bind authority to the inference that emitted the tool call

At the actual inference transport handoff, capture the responding route, connection, verified account binding (if available) and an immutable record of whether that registration declared native search. Use a server-owned registration generation, not the provider ID alone; reload, replacement or remount gets a fresh generation even at the same ID. Associate this record only with tool calls from that response. Never reconstruct it from the current model or registry. For an implicit source choice, an originally absent operation stays absent, while an originally present operation with missing proof or a stale generation fails closed.

At tool dispatch bind the record to the agent, run, individual tool call, effective preset and cancellation. Nested `tools.eval` → `websearch.answer` → `websearch.search` shares that invocation. Keep credentials out of the scope and transcript. Revoke it when the tool ends; detached work, independent dispatch and children cannot inherit it. Outside tool dispatch the public facade ignores caller-supplied IDs and can use only ordinary engines. Work carrying a revoked native invocation instead fails; it must not be reclassified as an ordinary caller.

Opt-in providers supply a native search operation and account-binding evidence; providers that omit the capability need no SDK changes. For SDK-managed API keys, pin an opaque credential revision that changes on every replacement, including replacement under the same connection ID. For provider-managed login, the provider must attest an opaque account generation at inference and the revision of the credentials used to send. A verified renewal may preserve the generation; logout/login or account replacement cannot. Missing proof never means that the operation was absent. Do not obtain a new credential or perform an extra network request merely to discover the capability.

Give the callback a search-scoped connection, model, query, bounded limit and cancellation/deadline, not the ordinary `ResolvedConnection`. Its credential reads and transport are bound to a private SDK invocation. Check the binding before reading credentials. At the final transport handoff, after any async credential or proxy work, recheck the active invocation, enabled provider, exact registration, enabled model and connection, route and credential tuple. Serialize that check and dispatch against credential replacement so the checked tuple is the one sent. A callback-start check alone leaves a race. Native requests use only this transport.

Keep the executable callback private to the SDK dispatcher: the ordinary connection resolver must not return an unrestricted native callback alongside the connection. A direct or retained call through a definition or adapter helper with a plain connection must fail before credential access or search I/O. This is a supported API boundary, not a sandbox for arbitrary plugin code.

### 4. Codex wire behavior

Use a separate POST to the fixed `https://chatgpt.com/backend-api/codex/alpha/search` endpoint observed in [DSH's pinned adapter](https://github.com/WSL043/dsh-codex-subscription/blob/05690e4045030bf8d4a85dbd5049d866ea6cd014/src/codex-search.js#L95-L119). Select live search rather than cached-only retrieval: an explicit public-web lookup can ask for current sources. Always send the JSON boolean `settings.external_web_access: true` with the selected model, query and `commands.search_query`. It is not a per-call or Settings option; do not retry in cached mode. Send no transcript or user-selected destination. Parse JSON `results[]` entries (`url`, `title`, optional `snippet` and publication date). An empty array is valid; a missing/non-array `results`, invalid JSON, an over-limit body or interruption is an error. Apply ordinary URL, markup and limit rules; do not extract links from answer text.

Use existing Codex auth and account-generation checks, the request-bound transport, proxy cancellation and guarded 401 handling. Verify the issuing account and latest valid credential tuple at handoff; verified renewal for the same generation can use a fresh tuple, but a replacement or logout/login cannot inherit the search. Suppress a late failure's writes when the credential revision or account generation has moved on. Model credentials remain in the provider adapter. Account-isolated transports have exact method/path checks at more than one layer: enable only this fixed POST where supported, preserving all existing limits, redirect restrictions, isolation and refusal paths. A rejected tunnel/route must never lead to a direct request. Use one bounded search attempt in the initial adapter, with a finite total deadline and a streamed byte ceiling even without `Content-Length`.

## Risks / Trade-offs

- Alpha endpoint drift → pin redacted mock fixtures to the source revision, reject unknown envelopes and expose a short actionable error. Mock evidence does not establish current service availability. No live acceptance or paid queries in this change.
- In-flight model/account changes or asynchronous tool calls → use deterministic barriers between inference, step entry, auth, transport handoff and response; count requests to both accounts and the ordinary engine. Cancellation can stop subsequent work, not undo a request already handed off.
- Relocation could silently broaden grants or break plugin configuration → test a clean install and an upgraded installation, wildcard/denied/disabled presets, settings validation and third-party reload. Never weaken plugin setting ownership or introduce a blanket core grant.

## Migration Plan

1. Land the core facade/loader and plugin relocation as a single upgrade; retain setting IDs, secret references and logical grants. Verify the ordinary-only path before enabling the optional Models operation.
2. Add invocation binding and the optional additive SDK field; enable it first for Codex with mock-backed acceptance. Update provider-author examples and agent-facing search instructions. No data or credential backfill.
3. Removing the Codex operation restores ordinary routing for new inferences only; calls already issued with native support fail on the changed registration without sending. Alternatively restore the previous plugin/core version together. Existing stored defaults and presets remain usable because no native ID is persisted as an engine choice.
