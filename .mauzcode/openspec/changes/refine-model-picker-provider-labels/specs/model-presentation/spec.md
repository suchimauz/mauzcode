## ADDED Requirements

### Requirement: Provider-qualified selected model in chat
The chat's selected-model control SHALL visibly show both the shared human-readable model name and its connection provider, without requiring the picker to be opened or a tooltip to be hovered. Provider identity MUST describe the route's provider, not a brand inferred from the model name. The control's accessible text MUST include both. Presentation MUST NOT alter the stored route or shared model name.

#### Scenario: Selected model caption
- **WHEN** a chat has a selected model from a codex connection
- **THEN** its closed model control displays the human-readable model name and `codex`

#### Scenario: Same model through different providers
- **WHEN** the owner switches between routes with the same model display name but different providers
- **THEN** the selected-model provider caption updates to identify the selected route's provider

#### Scenario: Custom provider serving another brand
- **WHEN** a custom connection serves a model whose name identifies another vendor
- **THEN** the provider caption identifies `custom`, not the vendor inferred from the model name

#### Scenario: Previously selected model becomes disabled
- **WHEN** the selected model or its connection is disabled and the catalogue is refreshed
- **THEN** the closed chat control retains the current model name and provider without silently switching the stored route, while the disabled route is absent from picker choices

#### Scenario: Selected route missing from catalogue
- **WHEN** the current route has no matching catalogue entry
- **THEN** the chat still shows the shared fallback model name and provider obtained from the route
