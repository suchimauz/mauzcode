## MODIFIED Requirements

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

## ADDED Requirements

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
