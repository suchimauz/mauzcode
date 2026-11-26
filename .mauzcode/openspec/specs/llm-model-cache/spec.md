# llm-model-cache Specification

## Purpose
Keep each model connection's discovered model list in a persistent, non-expiring cache that is refreshed only on demand or by the hourly background refresh.

## Requirements

### Requirement: Persistent model list cache
The models module SHALL store each connection's discovered model list in Postgres together with the time it was fetched. The cache MUST NOT expire. A cached list valid for the current connection and, for Codex, account generation MUST be served offline unless refresh is requested. Discovery is allowed on an explicit refresh or a cold ordinary listing, never on cache-only reads. Writing the cache MUST NOT change the connection's `updatedAt`.

#### Scenario: Cached list served offline
- **WHEN** a connection has a cached list and models are listed without refresh
- **THEN** the cached list and its fetch time are returned and the provider is not called

#### Scenario: Failed refresh keeps the cache
- **WHEN** an explicit refresh fails
- **THEN** the last successful list still valid for the current account generation is returned with a safe error and stays stored; if none is valid, only manual IDs or an empty list are returned

#### Scenario: Nothing cached
- **WHEN** a connection with no cache is listed outside cache-only mode and its provider supports discovery
- **THEN** the provider is asked and the result is stored; on failure the manual model ids are returned

### Requirement: Hourly background refresh
The models module SHALL refresh the cached lists of all enabled connections whose provider supports discovery and is not globally disabled every hour while the server runs, and SHALL allow disabling this with `MODELS_REFRESH=off`. Connections of disabled providers MUST be skipped without any provider request. Failures MUST be reported without secrets and MUST retain only a previous cache valid for the current generation.

#### Scenario: Hourly refresh
- **WHEN** an hour passes after start
- **THEN** every enabled discoverable connection of an enabled provider has its cache refreshed and failures are logged

#### Scenario: Disabled provider skipped
- **WHEN** the hourly refresh runs while a provider is globally disabled
- **THEN** its connections' caches are left untouched and no request is sent to that provider

### Requirement: Cached protocol and reasoning metadata
The model cache SHALL keep, for each discovered model, a native shared protocol id when the provider reported one from the closed shared protocol set, and the reasoning metadata's supported levels, optional default, optional native wire values and optional thinking-disable flag when they are well-formed. Malformed values SHALL be dropped from the cached entry without dropping the model.

#### Scenario: Protocol kept
- **WHEN** discovery reports a model with protocol `openai-responses`
- **THEN** the cached entry and the model listing carry that protocol

#### Scenario: Unknown protocol dropped
- **WHEN** discovery reports a model with a protocol outside the shared set
- **THEN** the model is cached without a protocol

#### Scenario: Reasoning without a default
- **WHEN** discovery reports supported levels with wire values but no default
- **THEN** the cached reasoning keeps the levels and wire values and has no default

### Requirement: Connection-scoped response controls in the catalogue
The model cache and cache-only catalogue readers SHALL preserve validated response controls independently for each connection and model, including an optional supported verbosity default. They MUST NOT retain arbitrary provider fields, infer controls for manual IDs or borrow them from another connection. A missing or malformed optional field MUST NOT remove the model or its other valid capabilities.

#### Scenario: Read back two copies of the same slug
- **GIVEN** two independently refreshed connections with the same model slug but different tiers
- **WHEN** the model picker reads their cached catalogues
- **THEN** each route retains its own tiers, including after a process reload, with no network request

#### Scenario: Cold cache and legacy entries
- **WHEN** the picker opens with no cached catalogue, only manual model IDs, or a descriptor cached before response controls existed
- **THEN** it makes no discovery request and advertises no speed or verbosity overrides for those entries
- **AND** a later successful normal refresh can populate the controls without a cache migration

#### Scenario: Bad verbosity default does not disable speed
- **WHEN** a descriptor has valid tiers and verbosity choices but a default outside those choices
- **THEN** a cache round trip retains the model, the tiers and the valid choices, but not the invalid default

### Requirement: Account-bound Codex catalogue
A Codex catalogue SHALL be scoped to the authenticated account on its connection. Logout, account replacement or loss of verifiable identity MUST invalidate the old account's catalogue for cache readers and inference. A failed refresh MUST NOT fall back to another account's data, and a refresh started under an old binding MUST NOT publish or return its results as current. Legacy cache entries without an account binding MUST NOT authorize speed or verbosity overrides.

#### Scenario: Account changes while a refresh is in flight
- **GIVEN** a connection has a cached catalogue for account A and another refresh for A is pending
- **WHEN** the connection signs into B and A's refresh finishes late
- **THEN** neither the picker nor inference uses A's catalogue, even if B's refresh fails or both accounts use the same model slug
- **AND** only a successful refresh bound to B can expose B's overrides; a cache-only read does not start one

Within one account generation, an earlier refresh MUST NOT replace or return as current a snapshot already published by a later-started refresh, or change preferences based on the superseded result.

#### Scenario: Overlapping manual and background refreshes
- **GIVEN** a background refresh starts before a manual refresh on the same account generation
- **WHEN** the manual refresh publishes a catalogue without Fast and the background refresh then completes with Fast
- **THEN** the cache and both callers' current views exclude Fast, saving Fast is rejected, and the older completion neither changes preferences nor emits another reset notice

#### Scenario: Ordinary token renewal
- **WHEN** the token is renewed for the same verified Codex account without logout
- **THEN** its cached catalogue remains usable without discovery

### Requirement: Preserve reasoning discovery authority
A cache round trip SHALL preserve distinct supported `xhigh` and `max` levels and distinguish absent reasoning metadata from an explicit Codex list with no recognized levels. Cache readers MUST NOT turn the latter into permission to apply a fallback profile.

#### Scenario: No usable levels is not missing discovery
- **WHEN** a refreshed entry with an explicitly unusable reasoning list is reloaded from the cache
- **THEN** its reasoning stays unavailable, even for a model with a documented profile
- **AND** a legacy entry with absent reasoning metadata retains its previous fallback behavior

### Requirement: Only authoritative Codex catalogues revoke preferences
A successful HTTP status alone MUST NOT publish a Codex catalogue. Only a complete, well-formed model-list envelope may replace a valid snapshot and reconcile preferences. Missing, null, non-array or incomplete model lists MUST be treated as failed discovery. A malformed optional control on an otherwise identifiable model is handled independently from an invalid envelope.

#### Scenario: Broken response versus legitimate removal
- **GIVEN** a verified account has a published catalogue and a closed chat with Fast and high verbosity
- **WHEN** refresh returns HTTP 200 with an absent or null models field, an invalid list item without a usable model identity, or a truncated list
- **THEN** the valid snapshot and both preferences remain, the caller receives a safe refresh error and no notice is created
- **AND** a complete valid response with an empty models array is published and clears overrides for removed models once

### Requirement: Cached Antigravity group choices
The catalogue SHALL preserve a stable group identity, display name, provider-eligible efforts, exact native IDs, order and default for the same connection. Member IDs MUST remain distinct from reasoning wire values. Chat, draft and delegation cache-only readers SHALL agree on enabled groups, standalone models and levels without rediscovery. Owner availability SHALL apply to the group as a whole, not its efforts.

#### Scenario: Picker and delegation after restart
- **GIVEN** an account has published Neon with `low`, `medium`, `high` and `xhigh`, and Flash with only `low`, `medium` and `high`
- **WHEN** the picker and `list_models` read the catalogue after a restart
- **THEN** both list one route per enabled group with those levels, no `minimal` on Flash and no duplicate member rows; neither read contacts the provider
- **AND** resolving Neon with `xhigh` uses the exact native ID from that snapshot without a separate reasoning parameter

#### Scenario: Disabled member or group
- **WHEN** an owner disables a group and later enables it again
- **THEN** while off, neither its route nor a legacy member route can be used to generate; when on, all provider-eligible levels are restored and the declared default or first eligible member supplies `auto`

#### Scenario: Separate account snapshots
- **WHEN** two connections advertise the same group key with different available members
- **THEN** each connection exposes only its own mapping, order and defaults; logout, revoked access or a new login cannot revive the previous account's choices or quota measurements

### Requirement: Antigravity routes resolve only against the current catalogue
An Antigravity route SHALL resolve only to a group or standalone model in the connection's current cached catalogue. Saved chats, defaults and preferences MUST NOT be migrated or rewritten. A legacy or cold cache MUST NOT fabricate group membership or effort choices and MUST NOT trigger discovery from a read.

#### Scenario: Catalogue cached before groups existed
- **WHEN** the stored catalogue predates group metadata and a chat uses a route from it
- **THEN** a cache-only read offers no effort choices and fetches nothing; after the next successful refresh the picker lists each group once and a route that is no longer a choice fails `MODEL_UNAVAILABLE`

#### Scenario: Failed refresh is not removal
- **WHEN** refreshing a still-signed-in account fails and its last valid catalogue is available
- **THEN** that connection retains its previous valid mapping according to the catalogue cache policy; failure does not delete levels or substitute another account's inventory

### Requirement: Convert legacy Antigravity level disables
With a trustworthy group mapping for that connection, legacy member disables SHALL be converted to group-only availability. An explicit group disable or a disable for every eligible member SHALL keep the whole group off; otherwise the group SHALL offer all provider-eligible levels. Conversion MUST be idempotent and preserve unrelated IDs and availability on every other connection and provider.

#### Scenario: Three legacy configurations
- **WHEN** an explicitly disabled group, another with only some eligible members disabled, and a third with every eligible member disabled are converted
- **THEN** the first and third groups are off by group ID and the second is on with all its eligible levels; obsolete member flags for proven members no longer filter efforts
- **AND** enabling either off group restores all its eligible levels, while standalone IDs retain their own state

#### Scenario: Defer without authoritative membership
- **WHEN** the cache is cold, predates group metadata, or lacks unambiguous evidence that a disabled ID belongs to a group
- **THEN** no membership or disable is inferred from a suffix, account name or empty list; unknown IDs are preserved and no discovery is triggered by a cache-only read
- **AND** a later valid catalogue permits conversion only for confirmed groups on that connection, without rewriting saved chat routes or effort preferences

### Requirement: Legacy conversion timing and consistent readers
Conversion of legacy member disables SHALL run after each successful catalogue refresh of that connection and once at startup for every connection with a trustworthy cached catalogue; cache-only reads MUST NOT write or trigger it. Until stored settings are converted, the pickers, `list_models`, inference and Models settings SHALL apply the same group rule to the stored flags.

#### Scenario: Before stored conversion
- **GIVEN** a connection with a trustworthy group mapping whose stored settings still disable one of a group's three eligible members
- **WHEN** the picker, `list_models`, inference and Models settings read it before any conversion has run
- **THEN** all four offer the group with its three levels and Settings shows one enabled switch; with all three members disabled all four treat the group as off
- **AND** after the next successful refresh or restart the stored flags are converted and the observed availability does not change

### Requirement: Enabling a group clears its legacy member disables
Enabling an Antigravity group ID with a trustworthy mapping SHALL, in the same stored update, remove the legacy disables of that group's proven members on that connection, so the group is available immediately whether or not conversion has run. Disabling the group SHALL store only the group ID. IDs not proven to belong to the group, standalone models and other connections MUST stay unchanged. Without a trustworthy mapping, enabling the group ID SHALL change only that ID.

#### Scenario: Enable a fully disabled group before conversion
- **GIVEN** stored settings disable every eligible member of a group but not the group ID, and conversion has not run
- **WHEN** the owner enables that group in Models settings or through the availability operation
- **THEN** the member disables are removed in the same update, and the picker, `list_models`, inference and Settings offer the group with all its eligible levels
- **AND** a later conversion pass does not turn the group off again
