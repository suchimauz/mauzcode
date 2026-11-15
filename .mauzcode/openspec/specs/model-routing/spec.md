# model-routing Specification

## Purpose
Define the single model route string that agents, settings and callers use to address one model of one stored model connection, and how such a route resolves to that connection without contacting a provider.

## Requirements

### Requirement: Route string format
A model route SHALL have the form `<provider>/<accountName>:<modelId>`, where provider is a registered model provider id, accountName is the connection's account name and modelId is the provider-native model id. Parsing MUST split at the first `/` and the first following `:`, so modelId may itself contain `/` or `:`. Formatting a parsed route MUST reproduce the same string.

#### Scenario: Parse a codex route
- **WHEN** the route `codex/su4imauz:gpt-6-astra` is parsed
- **THEN** provider is `codex`, accountName is `su4imauz` and modelId is `gpt-6-astra`

#### Scenario: Model id with separators
- **WHEN** the route `custom/Asoft LLM Gate:org/model:v2` is parsed
- **THEN** accountName is `Asoft LLM Gate` and modelId is `org/model:v2`

#### Scenario: Malformed route
- **WHEN** a route has no `/` before `:`, or has an empty provider, account or model
- **THEN** parsing fails with code `INVALID_ROUTE`

### Requirement: Unique connection identity
A model connection SHALL be uniquely identified by its provider and account name. An account name MUST NOT contain `/` or `:`. Creating or renaming a connection to an account name with these characters, or to a provider and account name pair already used by another connection, MUST fail with a validation error, and nothing is stored. A successful rename MUST publish a rename event so that modules storing routes can update them.

#### Scenario: Separator in account name
- **WHEN** the owner creates or renames a connection to `team:main` or `team/main`
- **THEN** it fails with a validation error and nothing is stored

#### Scenario: Duplicate account name
- **GIVEN** a `claude` connection named `2yfl55fsh`
- **WHEN** the owner creates another `claude` connection named `2yfl55fsh`
- **THEN** creation fails with a validation error and the first connection is unchanged

#### Scenario: Same name on another provider
- **WHEN** the owner creates a `codex` connection named `2yfl55fsh`
- **THEN** creation succeeds

#### Scenario: Rename updates agent routes
- **GIVEN** an active agent on `codex/su4imauz:gpt-6-astra`
- **WHEN** the owner renames the connection `su4imauz` to `main`
- **THEN** the agent's model and the stored last used model become `codex/main:gpt-6-astra`, and `models.localizationModel` is updated the same way

### Requirement: Route resolution
Resolving a route SHALL return the matching connection id, provider, account name, model id, the provider's inference descriptors (system preamble, price vendor) and whether the provider supports native compaction, plus context window and output limit when the model catalogue, an owner override or a public model catalogue reports them, with the effective context limit and its source. Resolution MUST read current stored state and cached or bundled catalogue data, and MUST NOT send any provider request or wait for the network.

#### Scenario: Resolve an enabled model
- **GIVEN** an enabled `codex` connection `su4imauz`
- **WHEN** `codex/su4imauz:gpt-6-astra` is resolved
- **THEN** the result names that connection, model `gpt-6-astra` and native compaction support

#### Scenario: Unknown connection
- **WHEN** a route names a provider and account with no stored connection
- **THEN** resolution fails with code `CONNECTION_NOT_FOUND` and no provider request is sent

#### Scenario: Disabled connection or model
- **WHEN** a route names a disabled connection or a model disabled on its connection
- **THEN** resolution fails with code `CONNECTION_DISABLED` or `MODEL_DISABLED_BY_USER` respectively, not retryable, and no provider request is sent

#### Scenario: Catalogue-derived limit
- **WHEN** a model without provider size is described by a public catalogue section of its provider
- **THEN** the result carries that context window and output limit with source `catalog`

### Requirement: Legacy routes are rejected
A route in a legacy format SHALL fail resolution with code `LEGACY_ROUTE`, not retryable, and with a message that names the route and asks the owner to choose a model. Legacy formats include an `ssh/<host>:` prefix, a bare `<provider>:<model>` without an account, and providers that are not registered model providers. No provider request MUST be sent.

#### Scenario: SSH-prefixed legacy route
- **WHEN** `ssh/aeza-criminal-amarant:codex/su4imauz:gpt-6-astra` is resolved
- **THEN** resolution fails with code `LEGACY_ROUTE` and no provider request is sent

#### Scenario: Unregistered provider
- **WHEN** `anthropic-oauth/whims-hue_7v:claude-opus-5-5` is resolved
- **THEN** resolution fails with code `LEGACY_ROUTE`
