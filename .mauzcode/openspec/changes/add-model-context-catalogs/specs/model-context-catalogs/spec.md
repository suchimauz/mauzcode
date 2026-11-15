## Purpose

Define how public model catalogues (models.dev and the bundled pi-ai catalogue) supply context and output limits for models whose provider does not report them, including source order, per-provider sections and offline behaviour.

## ADDED Requirements

### Requirement: Catalogue context limits
When neither an owner override nor provider metadata gives a model's context limit, the system SHALL use the public model catalogues before the 200,000-token fallback: first the cached models.dev snapshot (`limit.context`), then the bundled pi-ai model catalogue (`contextWindow`). Only exact model ids in the provider's catalogue sections SHALL match. A catalogue-derived limit SHALL report source `catalog` and its catalogue value; owner overrides and provider metadata keep precedence.

#### Scenario: Z.ai model without listed size
- **GIVEN** a `zai-coding` connection whose cached model list has `glm-5.3` without a context window
- **WHEN** its context limit is resolved
- **THEN** the effective limit is 1,000,000 with source `catalog`

#### Scenario: Provider metadata wins
- **WHEN** the provider listing reports a context window for a model also present in a catalogue
- **THEN** the provider value is effective with source `provider`

#### Scenario: Override wins
- **WHEN** the owner saved an override for a catalogue-described model
- **THEN** the override is effective with source `override`

#### Scenario: Unknown model
- **WHEN** no catalogue section of the provider contains the model id
- **THEN** the effective limit is 200,000 with source `fallback`

### Requirement: Catalogue sections per provider
A provider SHALL be able to declare ordered models.dev and pi-ai catalogue sections for its models. When it declares none, its price vendor SHALL be the only section; a provider with neither SHALL get no catalogue lookup.

#### Scenario: Declared sections
- **WHEN** `glm-5.1` is absent from models.dev `zai-coding-plan` but present in `zai`
- **THEN** the `zai` value is used

#### Scenario: Custom connection
- **WHEN** a `custom` connection model has no provider size
- **THEN** no catalogue is consulted and the fallback applies

### Requirement: Offline catalogue lookup
Catalogue lookup MUST NOT send provider requests and MUST NOT wait for the network. It SHALL read the current models.dev snapshot, starting a background refresh when none is cached, and otherwise use the bundled pi-ai data. Failure of either catalogue SHALL be treated as missing data.

#### Scenario: Cold start without network
- **WHEN** models.dev was never fetched and is unreachable
- **THEN** resolution returns at once using pi-ai data, or the fallback

### Requirement: Catalogue output limit
When the provider gives no output limit, route resolution SHALL report the catalogue output limit (models.dev `limit.output`, else pi-ai `maxTokens`) of the same matched entry.

#### Scenario: Output limit from catalogue
- **WHEN** `zai-coding/acc:glm-5.3` is resolved and the provider listing has no output limit
- **THEN** the route reports an output limit of 131,072
