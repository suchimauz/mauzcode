# model-defaults-and-pricing Specification

## Purpose
Provide model selection for callers that name no model, the background localization model, public token price estimates for model routes, and an aggregated usage view with alert thresholds over all model connections.

## Requirements

### Requirement: Model selection without a default setting
There SHALL be no default-model setting. When an agent is created or a one-shot caller runs without a model, the system MUST use the last used model when it resolves, otherwise the first enabled model of the earliest enabled connection, and otherwise fail with `NO_MODEL`. The legacy `llm.defaultModel` setting and the `MODEL` environment variable MUST NOT be read.

#### Scenario: Create agent without a model
- **GIVEN** the last used model is `codex/su4imauz:gpt-6-astra` and it resolves
- **WHEN** an agent is created without a model
- **THEN** the agent's model is `codex/su4imauz:gpt-6-astra`

#### Scenario: Last used model no longer resolves
- **GIVEN** the last used model names a removed connection
- **WHEN** an agent is created without a model
- **THEN** it gets the first enabled model of the earliest enabled connection

#### Scenario: No usable model
- **GIVEN** no enabled connection has an enabled model
- **WHEN** an agent is created without a model
- **THEN** creation fails with `NO_MODEL` and no agent is stored

### Requirement: Localization model setting
A `models.localizationModel` setting SHALL select the model route used to generate multilingual retrieval text for documentation and plugins. A value that is not a valid route MUST be rejected when set. When it is empty, the model chosen by the selection rule above MUST be used.

#### Scenario: Invalid localization model
- **WHEN** the owner sets `models.localizationModel` to `claude-code:claude-opus-5`
- **THEN** the setting is rejected with a validation error

#### Scenario: Empty localization model
- **WHEN** localization runs with `models.localizationModel` empty
- **THEN** it calls the model chosen without a default setting

### Requirement: Token price lookup
The system SHALL return public pay-as-you-go prices per million tokens (input, output, cache read, cache write, USD) for model routes, keyed by route. It matches the model id against a public price catalogue under the price vendor declared by the route's provider. When the provider declares no price vendor, or the model is absent from that vendor's catalogue, the route MUST map to null (shown as unknown) without failing the lookup; prices MUST NOT be borrowed from other vendors.

#### Scenario: Known claude model
- **WHEN** prices are requested for `claude/2yfl55fsh:claude-opus-5-5`
- **THEN** the result contains Anthropic's public prices for that model

#### Scenario: Unknown model
- **WHEN** prices are requested for a model absent from the catalogue
- **THEN** that route maps to null and other routes are still priced

#### Scenario: Provider without a price vendor
- **WHEN** prices are requested for a route on a `custom` connection
- **THEN** that route maps to null even if another vendor lists the same model id

### Requirement: Aggregated usage view
The system SHALL report usage for every enabled model connection, including quota windows or balance when the provider reports them and status only otherwise. It MUST classify each window as normal, warning, critical or alert using the `models.usageWarnPercent`, `models.usageCriticalPercent` and `models.usageAlertPercent` settings (defaults 30, 60 and 75). One failing connection MUST NOT hide the others.

#### Scenario: Window above alert threshold
- **WHEN** a codex connection reports a window at 80 % used
- **THEN** the usage view marks that window as alert

#### Scenario: One connection fails
- **WHEN** one connection's usage request fails
- **THEN** that connection is reported unavailable and all other connections are still reported

#### Scenario: Quota endpoint keeps its shape
- **WHEN** the UI requests `/api/v1/quotas`
- **THEN** it receives `{ updatedAt, accounts }` built from model connections and their usage, with no legacy `llms` call

### Requirement: Provider icons from declarations
Provider marks shown in the UI SHALL come from the icons declared by registered model providers. No hard-coded list of legacy provider ids MUST be used.

#### Scenario: Icons for registered providers
- **WHEN** the UI requests provider icons
- **THEN** it receives a mark for each registered model provider (claude, codex, custom) and none for legacy-only providers
