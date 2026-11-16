# Tasks

## 1. Implementation gate

- [x] 1.1 Obtain separate approval to implement; the owner explicitly requested implementation ("disable-model-provider реализуй … openspec apply").
- [x] 1.2 Re-read AGENTS.md, docs/settings.md, docs/runtime-authoring.md, docs/testing.md and the Apple Design skill before touching code.

## 2. Setting and reader

- [x] 2.1 Add `src/models/$setting_disabledProviders.ts` (json, default `[]`, validate shape only: array of non-empty strings; unknown ids allowed).
- [x] 2.2 Add `src/models/disabledProviders.ts` reader returning a normalized `Set<string>`, read-through on every call; batch callers read it once per request.
- [x] 2.3 Add `types.models.ProviderSettingsView` (`ProviderView & { enabled; enabledLocked }`); keep `models.providers()` synchronous and unchanged.

## 3. Backend enforcement (every network path)

- [x] 3.1 Add `models.inference.assertProviderEnabled({ provider })` throwing `PROVIDER_DISABLED` (`Provider <id> is disabled`, 409, not retryable, not replay-safe); call it first in `assertModelEnabled`.
- [x] 3.2 In `models.inference.resolveRoute`, check the parsed provider right after `parseRoute`, before `connections.list`/`connections.resolve`; map to the non-retryable failure path.
- [x] 3.3 Add `PROVIDER_DISABLED` to `agent.retryCodes().never`.
- [x] 3.4 In `models.connections.action`, refuse with `PROVIDER_DISABLED` before `connections.resolve`.
- [x] 3.5 In `models.catalog.listModels`, treat a disabled provider like a disabled connection (cache/manual fallback, also on refresh).
- [x] 3.6 Short-circuit `models.connections.test` and `models.connections.usage` to status `disabled` without network requests.
- [x] 3.7 Skip disabled providers in `models.catalog.refreshAll`; reject `models.connections.create` with 409 `PROVIDER_DISABLED`.

## 4. Catalogue, defaults and API

- [x] 4.1 In `frontendBridge.modelCatalogue`, report disabled-provider groups as `enabled:false, unavailable:false` and their models `disabled:true`; read cache only.
- [x] 4.2 In `frontendBridge.modelUsage`, omit connections of disabled providers.
- [x] 4.3 In `settings.modelDefault`, skip connections of disabled providers.
- [x] 4.4 In `models.api`: GET and `providers` return `ProviderSettingsView[]`; add owner-only `setProviderEnabled` (registered id + boolean, promise-chain mutex in `ctx.state.models` around read-modify-write, with rejection recovery on the stored queue tail, file-fixed → 409 `SETTING_FIXED`); update the docstring contract.

- [x] 4.5 Give the existing fixed-setting error in `settings.set` a stable `SETTING_FIXED` code and structured file-path metadata while preserving its message; map that code in `models.api`, never match error text or classify unrelated storage errors as fixed-setting failures.

## 5. Settings UI

- [x] 5.1 Add `enabled`/`enabledLocked` to the frontend provider view type and `setProviderEnabled` to `frontend/src/lib/modelConnections.ts`.
- [x] 5.2 Group Models panel connections under provider headers (logo, label, accessible switch); include providers without connections.
- [x] 5.3 Disabled-provider presentation: badge, dimmed cards, Test/Update models/Login blocked, connection switch still operable; hint that active sessions will fail; locked switch with hint when `enabledLocked`.
- [x] 5.4 Hide disabled providers from the AddConnection selector; note when all providers are disabled; toggle runs through `actions.run` + reload.

## 6. Acceptance coverage

- [x] 6.1 Backend test `src/models/providerDisabled.test.ts` with a stubbed `fetch` that fails on any request and instrumented provider methods asserting zero invocations while disabled: stream/compact/call/countTokens, resolveRoute (before `connections.resolve`, precedence over CONNECTION_NOT_FOUND), action(login), listModels(refresh), test/usage `disabled`, refreshAll skip; re-enable restores; retryCodes.never; unknown ids kept; concurrent toggles both persisted; a rejected write reaches its caller but does not block a later successful toggle.
- [x] 6.2 Extend `src/frontendBridge/modelCatalogue.test.ts`: disabled-provider models flagged, group not enabled, no provider list call.
- [x] 6.3 API tests: setProviderEnabled owner-only + CSRF + validation; file-fixed → 409 `SETTING_FIXED` and `enabledLocked`; GET providers carry `enabled`; create rejected for a disabled provider; modelUsage omits disabled providers.
- [x] 6.4 Frontend tests (`bun run frontend:test -- <path>`): settings-models (switch render, POST, reload, blocked actions, locked switch), model-picker/model-group (models of disabled providers never offered).
- [x] 6.5 Run the touched backend and frontend suites and `code.quality`; fix findings.

- [x] 6.6 Deterministic race tests using barriers, not sleeps: an operation admitted before disablement may finish (including an existing stream); an availability check reading after the successful toggle blocks provider invocation; the next inference request rechecks. No cancellation of in-flight work is promised.
- [x] 6.7 Test structured `SETTING_FIXED` from `settings.set`, its API mapping and path metadata; unrelated storage failures must retain their identity and must not become `SETTING_FIXED`.

## 7. Documentation

- [x] 7.1 Document the provider switch and `models.disabledProviders` in the settings/models documentation.