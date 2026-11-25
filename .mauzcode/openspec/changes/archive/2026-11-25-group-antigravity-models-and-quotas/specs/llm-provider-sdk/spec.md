# Spec Delta

## ADDED Requirements

### Requirement: Variant-backed reasoning levels
A cached model MAY declare reasoning variants: a level-to-native-ID map in provider order with an optional default member. For such a model `models.stream` SHALL normalize the preference against the levels of currently eligible members with the existing rules, then pass the chosen member's native ID as the model and no separate effort value. Members disabled by the owner MUST NOT be chosen. Providers without variants SHALL be unchanged.

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
- **WHEN** the owner disables the member backing `high` and a request asks for `high`
- **THEN** that level is no longer supported for normalization and the nearest remaining eligible member is chosen; the disabled native ID is never sent

#### Scenario: Explicit unsupported level at an entry point
- **WHEN** a delegation explicitly requests a level that no eligible member of the target group backs
- **THEN** delegation rejects it with its existing unsupported-effort failure before creating a child, using the same variant levels the picker shows

### Requirement: Unavailable variant model
When a variant-backed route has no eligible member, or the provider requires a cached catalogue and the route's model is absent from it, `models.stream` SHALL fail with code `MODEL_UNAVAILABLE`, classification `invalid_input`, acceptance `none`, not retryable and replay-safe, before any provider request. It MUST NOT send the route's model key upstream or substitute another model.

#### Scenario: Every member disabled or removed
- **WHEN** the owner disables all members of a group, or a successful refresh removes all of them, and a request is made on that group's route
- **THEN** the call fails `MODEL_UNAVAILABLE` naming the route, no network request is sent, and the saved route and preference are unchanged

#### Scenario: Route missing from the catalogue
- **WHEN** a provider that requires a cached catalogue receives a route whose model is neither a cached group nor a cached standalone model, including a cold cache
- **THEN** the call fails `MODEL_UNAVAILABLE` before any request and does not trigger discovery
