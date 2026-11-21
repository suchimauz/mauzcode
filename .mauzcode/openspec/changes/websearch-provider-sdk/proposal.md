## Why

`websearch.search` hard-codes two engines (`google-browser`, `openserp`) in one function and a fixed enum setting, so adding a backend means editing the plugin, and other plugins cannot contribute their own search methods. Brave Search API is a common browser-free, service-free option that should work out of the box once a key is configured.

## What Changes

- Introduce a Web Search provider SDK: any mounted module or plugin declares a search provider in one declarative file `$websearchProvider_<id>.ts` that names runtime handler functions (no inline code). The websearch plugin's loader validates and registers providers and isolates a broken or duplicate declaration from the others.
- Move the existing `google-browser` and `openserp` engines onto the SDK as built-in providers with unchanged result shape and behaviour.
- Add a built-in `brave` provider for the Brave Search API, configured by a secret API key setting `websearch.braveApiKey`; it needs no browser and no operator-run service.
- Make the default engine a setting whose allowed values are the currently registered providers, selectable in Settings. Core settings gain a small `optionsFrom` extension for dynamic enum options. The default stays `google-browser` so existing installs keep their behaviour.
- Keep per-call selection: an agent may pass `engine` to `websearch.search` / `websearch.answer` to use a specific provider regardless of the default.
- A selected provider that is not configured (for example `brave` without a key) fails with a clear error naming the provider and the missing setting; websearch never silently switches to another engine.
- Add `websearch.providers` that lists registered providers with label, description, owner, configuration status and whether each is the default.
- `engine` values become registered provider ids instead of a closed TypeScript union (not breaking for existing ids).

## Capabilities

### New Capabilities
- `websearch-provider-sdk`: declaration contract, registry, configuration status, default and per-call engine selection, shared result shape and error rules for pluggable web search providers.
- `websearch-brave-provider`: Brave Search API provider — key handling, request limits, result normalization and failure behaviour.

### Modified Capabilities
<!-- none: websearch has no existing spec -->

## Impact

- `plugins/websearch`: `search.ts` split into SDK core + provider handlers; new `$loader_websearchProvider.ts`, `$websearchProvider_google-browser.ts`, `$websearchProvider_openserp.ts`, `$websearchProvider_brave.ts`, `providers.ts`, `providerIds.ts`, `providerError.ts`, `$setting_braveApiKey.ts`; `$setting_defaultEngine.ts` uses `optionsFrom`; `answer.ts` engine type; `package.json`, `SKILL.md` and tests.
- Core `settings` (new shared `settings.enumOptions` resolver; declared list, browser API, `$settings_*.json` file validation, new enum validation in `settings.set`) and `plugins/configuration.ts`: support own-module, bounded `optionsFrom` on enum descriptors, falling back to static `options`.
- `google-browser` results now pass through shared URL normalization (invalid, fragment and duplicate URLs dropped) — a small intended behaviour change.
- New outbound HTTPS dependency on `api.search.brave.com`, used only when the `brave` provider is selected.
