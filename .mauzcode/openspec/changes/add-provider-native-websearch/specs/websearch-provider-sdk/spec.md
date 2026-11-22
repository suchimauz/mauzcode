# Spec Delta

## MODIFIED Requirements

### Requirement: Default and per-call engine selection
`websearch.search` and the search stage of `websearch.answer` SHALL prefer an explicit ordinary `engine`. Otherwise they SHALL use native search only if the issuing inference had it, on that exact provider registration. Outside tool dispatch, or if that inference lacked native search, they SHALL use `websearch.defaultEngine` (factory default `google-browser`). Settings SHALL allow only registered ordinary IDs. An unknown explicit engine SHALL fail and list the ordinary IDs, not select an account or model.

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

## ADDED Requirements

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
