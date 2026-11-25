# Spec Delta

## ADDED Requirements

### Requirement: Cached Antigravity group choices
The catalogue SHALL preserve a stable group identity, display name, supported effort choices, their exact native IDs and sufficient provider order/default information to resolve `auto` for the same connection. Native member IDs MUST remain distinct from reasoning wire values. Cache-only consumers, including the chat picker and `list_models`, SHALL offer the same enabled groups, standalone models and levels, without rediscovery.

#### Scenario: Picker and delegation after restart
- **GIVEN** an account has published Neon with `low`, `medium`, `high` and `xhigh`, and Flash with only `low`, `medium` and `high`
- **WHEN** the picker and `list_models` read the catalogue after a restart
- **THEN** both list one route per group with those levels, no `minimal` on Flash and no duplicate member rows; neither read contacts the provider
- **AND** resolving Neon with `xhigh` from that snapshot identifies the same native ID as before the restart, not a wire value to send as a thinking parameter

#### Scenario: Disabled member or group
- **WHEN** an owner disables one native member that backs a group's level
- **THEN** cache-only readers omit that choice and `auto` cannot select it, even without refreshing upstream
- **AND** disabling a whole group or its last eligible member makes the group unavailable; a legacy native route cannot bypass a group or member disable

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
