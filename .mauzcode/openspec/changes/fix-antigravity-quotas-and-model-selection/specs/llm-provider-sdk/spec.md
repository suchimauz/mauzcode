## MODIFIED Requirements

### Requirement: Variant-backed reasoning levels
A cached model MAY declare reasoning variants: a level-to-native-ID map in provider order with an optional default member. For such a model `models.stream` SHALL normalize the preference against the levels of currently eligible members with the existing rules, then pass the chosen member's native ID as the model and no separate effort value. Members disabled by the owner MUST NOT be chosen, except where the provider declares group-level availability: then owner availability applies to the group as a whole, stored member disables of a proven member do not remove its level, and only the provider's own eligibility limits the levels. Antigravity declares group-level availability. Providers without variants SHALL be unchanged.

#### Scenario: Saved level above the group's range
- **GIVEN** a group whose eligible members back `low`, `medium` and `high`
- **WHEN** a chat with a saved `xhigh` preference sends a request on that group
- **THEN** the provider receives the native ID of the `high` member, the resolution reports `xhigh` requested and `high` applied with a fallback reason, and the saved preference is unchanged

#### Scenario: Off without a non-thinking member
- **WHEN** the preference is `off` and the group has no member backing `off`
- **THEN** the lowest available member is chosen by the existing nearest-level rule and no thinking-disable or effort field is sent

#### Scenario: Auto with and without a default member
- **WHEN** the preference is `auto` or omitted
- **THEN** the declared default member is used when it is eligible, otherwise the first eligible member in provider order

#### Scenario: Owner disables the member for a level
- **WHEN** on a provider without group-level availability the owner disables the member backing `high` and a request asks for `high`
- **THEN** that level is no longer supported for normalization and the nearest remaining eligible member is chosen; the disabled native ID is never sent

#### Scenario: Legacy member disable under group-level availability
- **GIVEN** an Antigravity group whose stored settings still disable the member backing `high`, while not every eligible member is disabled
- **WHEN** a request on that group asks for `high`
- **THEN** the `high` member's native ID is sent, as the picker and `list_models` offer `high`; when every eligible member is disabled or the group ID is disabled, the request fails `MODEL_DISABLED_BY_USER` before any provider request

#### Scenario: Explicit unsupported level at an entry point
- **WHEN** a delegation explicitly requests a level that no eligible member of the target group backs
- **THEN** delegation rejects it with its existing unsupported-effort failure before creating a child, using the same variant levels the picker shows
