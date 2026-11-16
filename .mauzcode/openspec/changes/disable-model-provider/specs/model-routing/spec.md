## MODIFIED Requirements

### Requirement: Route resolution
Resolving a route SHALL return the connection id, provider, account name, model id, the provider's inference descriptors (system preamble, price vendor) and native compaction support, plus context window and output limit when the model catalogue, an owner override or a public catalogue reports them, with the effective context limit and its source. Resolution MUST use only stored state and cached or bundled catalogue data, never a provider request or the network.

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

#### Scenario: Disabled provider
- **WHEN** a route names a globally disabled provider
- **THEN** resolution fails with code `PROVIDER_DISABLED`, not retryable, and no provider request is sent
- **AND** the provider check runs right after parsing the route, before the connection lookup and before connection resolution, so no credential refresh is attempted and the code wins over `CONNECTION_NOT_FOUND`, `CONNECTION_DISABLED` and `MODEL_DISABLED_BY_USER`

#### Scenario: Catalogue-derived limit
- **WHEN** a model without provider size is described by a public catalogue section of its provider
- **THEN** the result carries that context window and output limit with source `catalog`