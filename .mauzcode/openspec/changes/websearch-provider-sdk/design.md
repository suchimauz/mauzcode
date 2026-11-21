## Context

`plugins/websearch/src/websearch/search.ts` implements two engines inline behind `engine: 'google-browser' | 'openserp'`, and `$setting_defaultEngine.ts` is a static enum. `websearch.answer` passes `engine` through. MauzCode already has declaration-based provider SDKs (`$voiceProvider_*` with `$loader_voiceProvider.ts`, `$plugin_provider_*` with `$loader_plugin.ts`): a non-reserved loader kind owned by a module, validation per file, registry kept in `ctx.state`, owners pruned on unmount. Settings descriptors are collected by `$loader_setting.ts`; enum options are static and validated in `settings/browserApi.ts`, shown in `frontend/src/core-ui/settings.tsx` and `PluginConfiguration.tsx`.

## Goals / Non-Goals

**Goals:**
- Other plugins can add a search method without editing websearch.
- Brave Search API works out of the box once a key is set.
- The user chooses the default provider in Settings; an agent can choose a provider per call.
- Existing behaviour and result shape stay unchanged for `google-browser` and `openserp`.

**Non-Goals:**
- Automatic fallback between providers, result merging or reranking across providers.
- Per-chat or per-agent default overrides (global setting only).
- Changing `websearch.fetch` / `websearch.read` (page reading still uses the browser).
- Brave endpoints other than web search (news, images, summarizer).

## Decisions

### D1. Declaration file with handler names
A provider is declared by `$websearchProvider_<id>.ts` in any mounted module, default-exporting `types.websearch.ProviderDeclaration`:

```ts
export default {
    apiVersion: 1,
    label: "Brave Search",
    description: "Brave Search API; needs an API key, no browser.",
    handlers: { search: "websearch.braveSearch", status: "websearch.braveStatus" },
    settings: ["websearch.braveApiKey"],
} satisfies types.websearch.ProviderDeclaration;
```

- Id is the file name suffix and must be kebab-case (`/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/`).
- Handlers are runtime procedure names `<namespace>.<fn>` whose namespace is one of the namespaces of the declaring owner (the mounted module/plugin that contains the file); callers can never supply a function name. Ownership is checked at registration; existence of the function is checked at call time, because load order may register the declaration before its handler module.
- A missing handler at call time fails with `websearch.search: <id>: handler unavailable`; `websearch.providers` reports such a provider as not configured with reason `handler unavailable`.
- `settings` lists setting keys used for configuration hints and error messages.
- Alternative rejected: inline `search(ctx, opts)` in the declaration — mixes code into metadata, bypasses runtime function docs/typecheck and differs from existing provider SDKs.

### D2. Loader owned by websearch
`plugins/websearch/src/websearch/$loader_websearchProvider.ts` (kind `websearchProvider`, not reserved). It follows the `$loader_voiceProvider` pattern: `collectEmpty = true`; each declaration read in try/catch; failures produce a fixed diagnostic `{ rel, message }` logged as `websearch.provider.rejected`; duplicates keep the first registration and reject the rest; providers of unmounted owners are removed; a full boot pass removes deleted files. Registry lives at `ctx.state.websearch.providers[id] = { id, owner, abs, label, description, handlers, settings }`.

### D3. Handler contract
- `search({ query, limit })` → `{ results: SearchResult[]; sourceEngine?: string }` (`sourceEngine` widens from `'duckduckgo' | 'bing'` to `string`; OpenSERP still reports those two values). `query` is trimmed and non-empty, `limit` is clamped to 1..20 by core.
- `status({})` (optional) → `{ configured: boolean; reason?: string }`. Missing handler means configured. Every status call — in `websearch.providers` and before each search — is bounded to 2 s; a throwing status counts as not configured with reason `status check failed`, a slow one with reason `status check timed out`. `reason` is cut to 200 characters.
- Core `websearch.search` resolves the provider, checks status, calls the handler, then normalizes: drops non-http(s) or credential-bearing URLs, removes URL fragments and duplicates, strips tags from `title`/`description`, fills missing optional fields with null/[], cuts to `limit`, measures `durationMs`. Result shape `{ query, engine, sourceEngine?, results, durationMs }` stays as today.
- Normalization applies to every provider, including `google-browser`, which previously passed URLs through unfiltered. This is a deliberate, small behaviour change: invalid, fragment-only-different and duplicate URLs are no longer returned. A test pins it.
- Safe errors are whitelist-based. Because project files cannot import each other, the SDK provides a runtime helper `websearch.providerError({ message })` that returns an `Error` with `name = "WebsearchProviderError"`; handlers throw it with fixed short messages. Core recognizes the error by that name. Core prefixes `websearch.search: <id>: ` to the message of such an error (cut to 200 characters); any other thrown value becomes `request failed`. Core never inspects error text for URLs or keys and never logs raw error text.
- Built-in handlers use `websearch.providerError` for their fixed messages (`HTTP <code>`, `invalid response shape`, `no usable results`, `request timed out`, `invalid API key`, `rate limited`, OpenSERP's combined `duckduckgo: …; bing: …`).

### D4. Selection rules
1. `engine` given → use it. 2. Otherwise `websearch.defaultEngine` (default `google-browser`).
- Unknown id → `websearch.search: unknown engine <id> (available: a, b, c)`.
- Not configured → `websearch.search: engine <id> is not configured (<reason>; set websearch.braveApiKey)` using declared `settings`. No fallback to another provider.
- `engine` type changes from a union to `string`; docs list built-in ids. `websearch.answer` passes `engine` unchanged.

### D5. Dynamic enum options in core settings
An enum descriptor may declare `optionsFrom: "<module>.<fn>"`, a runtime function returning `string[]`.
- Safety: `<module>` must equal the module that declares the setting; otherwise the descriptor's `optionsFrom` is ignored with a warning (`settings.optionsFrom.rejected`) and static `options` apply. The function is called with `{}` only, never with caller input.
- Bound: each call has a 1 s timeout; the result must be an array of at most 200 non-empty strings of at most 100 characters, otherwise it is treated as a failure. Failure, timeout or a missing function → static `options` (or an empty list when none).
- One shared helper (`settings.enumOptions({ module, key })`) resolves options; all consumers use it.
- Consumers: declared list (`settings/declared.ts`), browser API list and save validation (`settings/browserApi.ts`), file values (`settings/files.ts`, whose `invalid()` becomes async-aware or receives resolved options), and `plugins/configuration.ts`. `settings.set` today validates only through `descriptor.validate`; it SHALL additionally reject a global enum value outside the resolved options, so agents and the UI share one rule.
- File values: a `$settings_*.json` enum value is checked against the resolved options; if `optionsFrom` fails at that moment, static options apply, so a file value naming a plugin provider may be dropped with an error until the function works — the error message says so. `websearch.defaultEngine` uses `optionsFrom: "websearch.providerIds"` with static `options: ["google-browser", "openserp", "brave"]` as fallback. A stored value no longer in the options is shown with an "unavailable" marker and fails on use per D4. Alternative rejected: free-text string setting with `validate` — no dropdown in Settings.

### D6. Discovery
`websearch.providers({})` → `Array<{ id, label, description, owner, configured, reason?, isDefault }>`, sorted with the default first, then by id. Status handlers run in parallel with the 2 s bound from D3. `websearch.providerIds({})` returns ids only for `optionsFrom`.

### D7. Built-in providers
- `google-browser`: current `browser.googleSearch` call, no status handler.
- `openserp`: current DuckDuckGo→Bing logic, timeouts and `sourceEngine`; status checks only that the endpoint setting parses (no network).
- `brave`: see spec `websearch-brave-provider`; status `configured` only when `websearch.braveApiKey` resolves to a non-empty value. `publishedAt` uses `page_age` (ISO 8601) when it parses as a date, normalized to an ISO string; the human-readable `age` (e.g. "2 days ago") is not put into `publishedAt`, so the field keeps one format. `extra_snippets` may be absent on some Brave plans; then `extraSnippets` is `[]`.

## Risks / Trade-offs

- [Core settings change touches all plugins] → `optionsFrom` is optional and additive; static `options` path unchanged; tests cover both.
- [`optionsFrom` names arbitrary code] → restricted to the declaring module, called with `{}`, 1 s bound, validated output.
- [`settings.set` gains enum validation] → existing stored values are not revalidated; only new writes are checked. Static enums already reject invalid values in the browser API, so behaviour for UI users is unchanged.
- [Slow third-party status handler] → 2 s bound on every status call, including before search.
- [Removing a plugin leaves a stale default] → explicit error naming the missing provider and Settings marker instead of silent switch.
- [Third-party handler returns bad data] → core normalization and validation; invalid result items are dropped, not passed through.
- [API key leakage] → key read via secret setting, sent only as a header, never logged or included in errors.
- [Brave quota/cost] → used only when selected; 10 s timeout, single request, no retries.

## Migration Plan

No data migration. Existing `websearch.defaultEngine` values (`google-browser`, `openserp`) remain valid ids. Rollback: revert the plugin and settings changes; stored values remain compatible.

## Open Questions

None.
