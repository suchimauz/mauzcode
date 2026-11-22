# websearch-provider-sdk Specification

## Purpose
Plugins can register web search providers that users select in Settings or agents select per request. All providers return results in the same format, and searches never silently switch providers.

## Requirements

### Requirement: Declarative provider registration
A mounted module SHALL declare a web search provider with a file `$websearchProvider_<id>.ts` default-exporting `{ apiVersion: 1, label, description, handlers: { search, status? }, settings? }`, where `<id>` is kebab-case. The websearch loader SHALL register valid declarations and SHALL reject an invalid or duplicate declaration with a fixed diagnostic while still registering every other declaration in the same batch.

#### Scenario: Plugin adds a provider
- **WHEN** a mounted plugin `acme` contains a valid `$websearchProvider_acme-search.ts` with `handlers.search = "acme.search"`
- **THEN** `acme-search` appears in `websearch.providers` and can be selected as an engine

#### Scenario: Broken declaration is isolated
- **WHEN** one declaration has no `handlers.search` and another is valid
- **THEN** the broken one is rejected with a diagnostic naming its file and the valid one is registered

#### Scenario: Duplicate id
- **WHEN** two mounted modules declare the same provider id
- **THEN** the first registration is kept and the second is rejected with a diagnostic

#### Scenario: Owner unmounted
- **WHEN** the plugin that declared a provider is unmounted
- **THEN** the provider is removed from the registry without a restart

### Requirement: Handler ownership
Provider handlers SHALL be runtime function names `<namespace>.<fn>` whose namespace belongs to the declaring owner. Ownership SHALL be checked at registration; handler existence SHALL be checked at call time.

#### Scenario: Foreign handler
- **WHEN** a declaration names a handler that belongs to another module
- **THEN** the declaration is rejected

#### Scenario: Handler not loaded yet
- **WHEN** a valid declaration names an owned handler that is not registered as a runtime function at call time
- **THEN** the declaration stays registered, `websearch.providers` reports it as not configured with reason `handler unavailable`, and a search with it fails with `handler unavailable`

### Requirement: Built-in providers
The websearch plugin SHALL ship `google-browser`, `openserp` and `brave` as providers declared through the same SDK. `google-browser` and `openserp` SHALL keep their previous result shape, including the OpenSERP DuckDuckGo-then-Bing fallback, its time budgets and `sourceEngine`. The only intended behaviour change is that shared normalization now also applies to `google-browser` results.

#### Scenario: Existing engine unchanged
- **WHEN** an agent calls `websearch.search({ query, engine: "openserp" })` with a working OpenSERP service
- **THEN** the result has the same shape and `sourceEngine` value as before the change

#### Scenario: Google results are normalized
- **WHEN** `browser.googleSearch` returns two results whose URLs differ only by `#fragment` and one with a non-HTTP(S) URL
- **THEN** `websearch.search` with `engine: "google-browser"` returns one result for the pair, without the fragment, and drops the non-HTTP(S) one

### Requirement: Default and per-call engine selection
`websearch.search` and `websearch.answer` SHALL use the `engine` argument when given, otherwise the `websearch.defaultEngine` setting, whose default is `google-browser`. The setting SHALL offer the currently registered provider ids as its options in Settings and SHALL reject an unregistered id when saved. An unknown engine SHALL fail with an error listing available ids.

#### Scenario: Default from settings
- **WHEN** `websearch.defaultEngine` is `brave` and the caller omits `engine`
- **THEN** the search uses the `brave` provider

#### Scenario: Per-call override
- **WHEN** the default is `google-browser` and the caller passes `engine: "openserp"`
- **THEN** the search uses `openserp` and reports `engine: "openserp"`

#### Scenario: Fresh install
- **WHEN** the setting was never changed
- **THEN** the default engine is `google-browser`

#### Scenario: Unknown engine
- **WHEN** the caller passes `engine: "nope"`
- **THEN** the call fails with an error that names `nope` and lists registered ids

#### Scenario: Settings lists plugin providers
- **WHEN** a plugin registers provider `acme-search`
- **THEN** the Default web search engine select in Settings offers `acme-search`

### Requirement: No silent fallback for unconfigured providers
Before searching, websearch SHALL check the selected provider's optional status handler, bounded to 2 seconds; a status check that throws or times out SHALL count as not configured. A provider reported as not configured SHALL cause a clear error naming the provider, the reason and its declared settings. Websearch SHALL NOT switch to another provider on configuration or search failure.

#### Scenario: Brave without key
- **WHEN** the selected engine is `brave` and `websearch.braveApiKey` is empty
- **THEN** the call fails with an error naming `brave` and `websearch.braveApiKey`, and no other engine is called

#### Scenario: Default provider removed
- **WHEN** the stored default names a provider whose plugin is no longer mounted
- **THEN** a call without `engine` fails with an unknown-engine error that names the stored id and lists registered ids, and no other provider is called

#### Scenario: Slow status before search
- **WHEN** the selected provider's status handler does not answer within 2 seconds
- **THEN** the call fails with `status check timed out` for that engine and the search handler is not called

### Requirement: Shared result shape and normalization
Every provider result SHALL be returned as `{ query, engine, sourceEngine?, results, durationMs }` with each result having `title`, `url`, `description`, `descriptionHtml`, `publishedAt`, `language`, `site` and `extraSnippets`. Websearch core SHALL clamp `limit` to 1..20, drop results with non-HTTP(S) or credential-bearing URLs, remove fragments and duplicate URLs, strip markup from title and description, fill missing optional fields with null or empty arrays and cut results to `limit`.

#### Scenario: Provider returns bad items
- **WHEN** a provider returns a `javascript:` URL, a duplicate URL and a valid result
- **THEN** only the valid result is returned

### Requirement: Safe errors
Provider failures SHALL surface as messages prefixed with `websearch.search: <id>: `. Only errors created through `websearch.providerError` SHALL pass their message through (cut to 200 characters); any other thrown value SHALL become `request failed`. Errors and logs SHALL NOT include raw error text from other errors, response bodies, API keys or request URLs.

#### Scenario: Provider transport error
- **WHEN** a provider handler throws an ordinary `Error` (for example a fetch error whose text contains the request URL)
- **THEN** the caller receives `websearch.search: <id>: request failed`

#### Scenario: Provider safe error
- **WHEN** a provider handler throws `websearch.providerError({ message: "rate limited" })`
- **THEN** the caller receives `websearch.search: <id>: rate limited`

### Requirement: Provider discovery
`websearch.providers` SHALL list every registered provider with `id`, `label`, `description`, `owner`, `configured`, optional `reason` and `isDefault`, with the default first. Each status check SHALL be bounded to 2 seconds; one that throws or exceeds its bound SHALL report the provider as not configured instead of failing the list.

#### Scenario: Agent picks a configured engine
- **WHEN** an agent calls `websearch.providers({})` with no Brave key set
- **THEN** `brave` is listed with `configured: false` and `google-browser` with `isDefault: true`

### Requirement: Dynamic enum options for settings
A setting descriptor of type `enum` MAY declare `optionsFrom` naming a runtime function that returns allowed string values. Settings listing, plugin configuration, browser save validation, `settings.set` for global values and `$settings_*.json` file validation SHALL use the resolved values and SHALL fall back to static `options` when resolution fails. Descriptors without `optionsFrom` SHALL behave as before.

#### Scenario: Options function fails
- **WHEN** the `optionsFrom` function throws
- **THEN** Settings shows the static `options` and saving validates against them

#### Scenario: Agent sets an unregistered default
- **WHEN** an agent calls `settings.set` for `websearch.defaultEngine` with `nope`
- **THEN** the call is rejected with an error listing the allowed values

#### Scenario: Settings file names a plugin provider
- **WHEN** a `$settings_*.json` file sets `websearch.defaultEngine` to `acme-search` and `acme-search` is registered
- **THEN** the file value is accepted

#### Scenario: Static enum unchanged
- **WHEN** a setting declares only static `options`
- **THEN** listing and validation behave exactly as before

### Requirement: Bounded options resolution
An `optionsFrom` function SHALL belong to the module that declares the setting, SHALL be called with `{}` only and SHALL be bounded to 1 second. Its result SHALL be an array of at most 200 non-empty strings of at most 100 characters. A missing, foreign, slow, failing or invalid-output function SHALL count as a failed resolution.

#### Scenario: Foreign options function
- **WHEN** a setting of module `acme` declares `optionsFrom: "other.list"`
- **THEN** the function is not called, a warning is logged and static `options` apply

#### Scenario: Slow options function
- **WHEN** the `optionsFrom` function does not answer within 1 second
- **THEN** static `options` apply
