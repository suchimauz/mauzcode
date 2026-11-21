# Tasks

## 1. Core settings: dynamic enum options

- [ ] 1.1 Add a shared resolver `settings.enumOptions({ module, key })` for enum descriptors with optional `optionsFrom`: own-module function only (foreign → warning `settings.optionsFrom.rejected`), called with `{}`, 1 s timeout, output limited to ≤200 non-empty strings ≤100 chars, fallback to static `options` on missing/foreign/slow/failing/invalid; verify with tests for dynamic options, failing, slow, foreign and invalid-output functions and unchanged static enums
- [ ] 1.2 Use the resolver in `settings/declared.ts`, `settings/browserApi.ts` (list and save validation), `settings/files.ts` (`$settings_*.json` enum validation) and `plugins/configuration.ts`; verify a file value naming a plugin-provided option is accepted
- [ ] 1.3 Make `settings.set` reject a global enum value outside the resolved options (in addition to `descriptor.validate`); existing stored values are not revalidated; verify with a test for an agent setting `websearch.defaultEngine` to an unknown id
- [ ] 1.4 Mark a stored enum value that is not in the resolved options as unavailable in the Settings UI (`core-ui/settings.tsx`, `PluginConfiguration.tsx`); verify by rendering or route test

## 2. Provider SDK

- [ ] 2.1 Add `types.websearch.ProviderDeclaration`, `SearchResult` and handler types (`sourceEngine?: string`) in the websearch plugin, and the runtime helper `websearch.providerError({ message })` returning an `Error` named `WebsearchProviderError`
- [ ] 2.2 Implement `$loader_websearchProvider.ts` (validation, kebab-case id, handler namespace owned by the declaring owner, duplicates, owner pruning, full-pass cleanup, fixed diagnostics; handler existence not required at registration); verify with tests for valid, broken, duplicate, foreign-handler, not-yet-loaded handler and unmount cases
- [ ] 2.3 Implement `websearch.providers` and `websearch.providerIds` with parallel status checks bounded to 2 s each and `handler unavailable` reporting; verify with tests including a throwing, a slow and a missing status/search handler

## 3. Built-in providers on the SDK

- [ ] 3.1 Move Google Browser search into a handler and `$websearchProvider_google-browser.ts`; verify with a test that fragment-duplicates and non-HTTP(S) URLs are now normalized away
- [ ] 3.2 Move OpenSERP search into handler + status and `$websearchProvider_openserp.ts`, throwing its fixed messages via `websearch.providerError`; verify existing OpenSERP tests pass unchanged
- [ ] 3.3 Add `$setting_braveApiKey.ts` (secret, env `WEBSEARCH_BRAVE_API_KEY`), Brave search and status handlers and `$websearchProvider_brave.ts`; verify with mocked-fetch tests for request params and header, mapping (ISO `publishedAt` from `page_age` only, missing `extra_snippets` → `[]`), empty results, invalid shape, 401/403, 429, other HTTP, timeout and that the key never appears in errors

## 4. Search core and selection

- [ ] 4.1 Rewrite `websearch.search` to resolve engine (argument → setting), reject unknown ids with the available list, check status bounded to 2 s with no fallback, check handler existence, call the handler, normalize results and wrap errors by whitelist (`WebsearchProviderError` passes, anything else → `request failed`); verify with tests for default, per-call, unknown, unconfigured, slow status, missing handler, removed default, ordinary vs safe errors and normalization
- [ ] 4.2 Change `$setting_defaultEngine.ts` to `optionsFrom: "websearch.providerIds"` with static fallback options and default `google-browser`
- [ ] 4.3 Change `websearch.answer` engine type to string and pass it through; widen `sourceEngine` to `string` in `websearch.search`; verify existing answer tests

## 5. Docs and packaging

- [ ] 5.1 Add `websearch.braveApiKey` to `package.json` configuration settings and mention Brave in the description
- [ ] 5.2 Update `SKILL.md`: provider list, default selection, per-call `engine`, `websearch.providers`, no-fallback rule and a short example of a third-party provider declaration

## 6. Verification

- [ ] 6.1 Run websearch and settings tests, strict documentation validation for new/changed runtime functions and one project typecheck; record pre-existing errors separately
- [ ] 6.2 Manually check Settings shows the provider select and Brave key field, and a live Brave search works when a key is available
- [ ] 6.3 Run `openspec validate websearch-provider-sdk --strict`
