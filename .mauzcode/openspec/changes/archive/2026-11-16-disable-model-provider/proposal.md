# Proposal

## Why

The owner can disable individual models and individual connections, but there is no way to take a whole provider out of service. When a provider should not be used at all (cost control, an outage, a paused subscription), the owner must disable every connection one by one, and new connections of that provider can still be created. A single provider-level switch expresses the intent once and applies to every current and future connection of that provider.

## What Changes

- Add a global owner switch per registered model provider in Settings → Models. Connection cards are grouped under a provider header (logo, label, switch); providers without connections also get a header row.
- Store the disabled set in one declared global setting `models.disabledProviders` (JSON array of provider ids). No database migration; connections, their enabled flags and secrets are untouched.
- Report the effective state at the settings API: `/models/api` GET and the `providers` action return each provider with `enabled` and `enabledLocked` (setting fixed by an instance file). `models.providers()` stays a synchronous declaration catalogue with no call-site changes. The provider declaration SDK (`$modelProvider_*.ts`) is unchanged — providers never implement disablement themselves.
- Enforce centrally through one guard `models.inference.assertProviderEnabled`, called from `assertModelEnabled` and from every other network path (route resolution before connection lookup/resolution, provider actions such as Login, model discovery): any inference (stream, compact, one-shot call, token counting), route resolution or provider action through a connection of a disabled provider fails immediately with `PROVIDER_DISABLED` (`Provider <id> is disabled`), not retryable, before any provider or network request. A session already using such a model fails on its next request. Operations that passed their availability check before the disable write succeeded may finish; existing streams are not cancelled. `PROVIDER_DISABLED` joins the never-retryable failure codes.
- Hide the provider's models from every picker: the shared model catalogue marks them disabled and their groups not enabled, without contacting the provider; the existing frontend selection policy already removes such entries. Default model selection skips disabled providers.
- Connection test and usage for a disabled provider return status `disabled` without network requests; model discovery returns only the cache; the usage widget omits such connections; the hourly background cache refresh skips disabled providers. Creating a new connection of a disabled provider is rejected; listing, editing, removing and re-enabling stay available.
- Add owner-only POST action `setProviderEnabled { provider, enabled }` to `/models/api` (same-origin, CSRF, JSON, bounded body); writes are serialized; a file-fixed setting returns 409 `SETTING_FIXED`, mapped from a structured error code added to `settings.set`, not from message text. Stored ids of unregistered providers are kept and ignored.
- Out of scope: per-user provider disablement, per-agent overrides, deleting or auto-disabling connections, provider-declared self-disable logic, changes to the provider SDK declaration contract.

This change authorizes specification artifacts only. Source changes and implementation require separate approval.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `llm-model-availability`: provider-level disabling joins per-connection model and connection disabling; enforcement extends to `PROVIDER_DISABLED`; the availability policy includes the provider state.
- `models-settings-ui`: provider group headers with an accessible enable switch, disabled-provider presentation and blocked network actions, add-connection provider filtering.
- `llm-provider-sdk`: enablement is owned by the core, not by provider declarations; the declaration catalogue is unchanged.
- `llm-connections`: creation and provider actions reject disabled providers; test and usage report `disabled` and discovery serves the cache, all without network requests; the settings API reports `enabled`/`enabledLocked`.
- `model-routing`: route resolution fails with `PROVIDER_DISABLED` for a disabled provider.
- `model-defaults-and-pricing`: default model selection skips connections of disabled providers.
- `models-module-boundaries`: the public facade admits the `models.disabledProviders` reader; `models.providers` keeps its synchronous contract.
- `llm-model-cache`: the hourly background refresh skips connections of disabled providers.

## Impact

Future implementation touches `src/models` (new `$setting_disabledProviders.ts` and `disabledProviders.ts`, new `ProviderSettingsView.ts`, new `inference/assertProviderEnabled.ts`, `inference/assertModelEnabled.ts`, `inference/resolveRoute.ts`, `connections/action.ts`, `connections/create.ts`, `connections/test.ts`, `connections/usage.ts`, `catalog/listModels.ts`, `catalog/refreshAll.ts`, `api.ts`), `src/agent/retryCodes.ts`, `src/frontendBridge/modelCatalogue.ts`, `src/frontendBridge/modelUsage.ts`, `src/settings/modelDefault.ts`, `frontend/src/lib/modelConnections.ts`, `frontend/src/components/settings/ModelsPanel.tsx`, backend and frontend tests, and the settings documentation. No database schema or migration changes; no provider declaration changes; stored connections and secrets are never modified by the switch.