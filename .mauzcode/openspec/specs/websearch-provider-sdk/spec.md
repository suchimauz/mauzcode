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
`websearch.search` and the search stage of `websearch.answer` SHALL prefer an explicit ordinary `engine`. Without one, they SHALL use only the issuing registration if its inference had native search. Outside tool dispatch or without native support, they SHALL use `websearch.defaultEngine` (initially `google-browser`). Settings SHALL accept only registered ordinary IDs. An unknown `engine` SHALL fail and list ordinary IDs, not select an account or model.

#### Scenario: Default from settings
- **WHEN** `websearch.defaultEngine` is `brave`, the caller is outside model-tool dispatch or the inference that issued the tool call had no native search, and the caller omits `engine`
- **THEN** the search uses `brave`

#### Scenario: A reload cannot redirect a pending native search
- **GIVEN** the inference that issued the tool call had native search and the stored ordinary default is `brave`
- **WHEN** the provider is reloaded without the operation, replaced at the same ID (even with native support), or unmounted before `search` or the search stage of `answer` runs without `engine`
- **THEN** the step fails; neither the former native handler, a replacement handler nor `brave` receives the query

#### Scenario: Adding native search does not upgrade an existing step
- **WHEN** the issuing inference lacked native search and a reload adds it before the tool runs without `engine`
- **THEN** that step still uses only the configured ordinary engine; only a new inference can authorize the new operation

#### Scenario: Per-call override
- **WHEN** the caller passes `engine: "openserp"` in a Codex step even though the ordinary default is `google-browser`
- **THEN** only `openserp` is used and the result reports `engine: "openserp"`

#### Scenario: Fresh install
- **WHEN** the setting was never changed and ordinary default selection applies
- **THEN** the default engine is `google-browser`

#### Scenario: Unknown engine
- **WHEN** the caller passes `engine: "nope"`
- **THEN** the call fails with an error naming `nope` and listing registered ordinary IDs

#### Scenario: Settings lists plugin providers
- **WHEN** a plugin registers `acme-search` and the Codex model provider advertises native search
- **THEN** Settings and `websearch.providers` offer `acme-search` but not the Codex subscription as an ordinary engine

#### Scenario: Native source is not a public selector
- **WHEN** an agent on any model tries to pass the native result identifier as `engine`, or an operator saves it as the default
- **THEN** it is rejected without any model-provider search or credential lookup

#### Scenario: Link search inside an answer
- **WHEN** an authorized Codex step calls `answer` without an engine and selects a different model for answer generation
- **THEN** only link retrieval uses Codex; page reading and answer generation keep their original sources and model selection
- **AND** a standalone `read` or `fetch` does not invoke native search

### Requirement: No silent fallback for unconfigured providers
Before ordinary search, websearch SHALL check the selected provider's optional status handler, bounded to 2 seconds; a throwing or slow status counts as not configured. An unavailable ordinary provider SHALL produce an error naming the provider, reason and declared settings as applicable. Once an ordinary or native source is selected, failure, cancellation or stale authority MUST NOT send the query to another source or account.

#### Scenario: Brave without key
- **WHEN** the selected engine is `brave` and `websearch.braveApiKey` is empty
- **THEN** the call fails with an error naming `brave` and `websearch.braveApiKey`, and no other engine is called

#### Scenario: Default provider removed
- **WHEN** ordinary default selection applies and the stored default names a provider whose plugin is no longer mounted
- **THEN** the call fails with an unknown-engine error naming the stored ID and listing registered IDs; no other provider is called

#### Scenario: Slow status before search
- **WHEN** the selected ordinary provider's status handler does not answer within 2 seconds
- **THEN** the call fails with `status check timed out` for that engine and the search handler is not called

#### Scenario: A native provider refuses a request
- **WHEN** native search was selected but the connection is signed out, the service rejects the request or the caller cancels
- **THEN** the caller receives a safe error; no ordinary engine or other subscription receives the query

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

### Requirement: Core facade and independent search extensions
Core SHALL own the public search, normalization and ordinary provider registration contracts. The official plugin SHALL continue to supply `google-browser`, `openserp` and `brave` through the public search-provider SDK. Existing public function names, provider IDs, stored settings and secret references MUST remain usable without reconfiguration. Unloading one extension MUST NOT unregister another owner's provider or the core facade.

#### Scenario: Upgrade without reconfiguration
- **WHEN** an installation with OpenSERP as its default, a Brave secret reference and a third-party `$websearchProvider` upgrades
- **THEN** ordinary searches and provider discovery retain their previous IDs, settings and result formats with no duplicate registrations or re-entry of credentials

#### Scenario: Extension lifecycle
- **WHEN** an ordinary provider plugin reloads and later unmounts
- **THEN** it is listed exactly once after reload and not listed after unmount; core and other mounted owners remain registered

### Requirement: Normalized model-native sources
Native search SHALL return only structured sources via the existing `websearch.search` response and normalization rules, including limit, safe URLs and deduplication. The `engine` field MUST identify the actual model-native source in a reserved, non-selectable form `native:<provider-id>` and MUST NOT identify the account. A valid empty result set SHALL stay empty; a malformed envelope MUST return a safe error rather than invented results.

#### Scenario: Native result provenance and empty results
- **WHEN** the Codex source returns a valid source list, including an empty list
- **THEN** the result has `engine: "native:codex"` and the normalized list; no links are manufactured from answer text and no second search occurs
