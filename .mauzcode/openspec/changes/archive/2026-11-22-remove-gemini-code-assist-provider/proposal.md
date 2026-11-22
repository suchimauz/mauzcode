# Proposal

## Why

The built-in `gemini` (Google account / Code Assist) provider is no longer wanted: it relies on Google's unofficial Code Assist API with Gemini CLI's client identity, carries account-suspension risk, and embeds a public OAuth client ID and secret in the source that GitHub push protection rejects.

## What Changes

- **BREAKING**: Remove the `gemini` model provider declaration (`src/models/$modelProvider_gemini.ts`) and all helpers in `src/models/provider/gemini/` (OAuth login, token storage, Code Assist setup, streaming, quota, token counting, failures, connection test), including the embedded OAuth client constants.
- Remove the provider's tests (`src/models/gemini.test.ts`) and its `gemini*` entries from the Models runtime `State` type.
- Remove the provider-only same-machine login link: `LoginFlow.callbackAuthorizationUrl` and its Models settings UI branch; drop `gemini` from the list of providers with a native login panel.
- Update provider lists in tests and the Models provider documentation.
- Keep the shared `gemini` wire protocol (`src/models/protocol/gemini`), used by `custom` connections and the OpenCode Go plugin, including thought-signature capture and replay.

## Capabilities

### New Capabilities

### Modified Capabilities
- `llm-gemini-code-assist-provider`: all requirements removed together with the provider.

## Impact

- Code: `src/models/$modelProvider_gemini.ts`, `src/models/provider/gemini/**`, `src/models/gemini.test.ts`, `src/models/State.ts`, `src/models/LoginFlow.ts`, `src/models/internalCompatibility.test.ts`, `src/models/defaultsPricing.test.ts`, `frontend/src/components/settings/ModelsPanel.tsx`, `frontend/src/test/settings-models.test.tsx`, `docs/models-providers.md`.
- Existing `gemini` connections become connections of an unregistered provider; their encrypted `models/<id>.gemini-auth` secret stays until the owner removes the connection.
- No change to the shared protocols, other providers or plugins.
