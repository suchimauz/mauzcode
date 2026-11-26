## ADDED Requirements

### Requirement: Reset requested effort on a committed model change
For every provider, a successful owner model switch that changes the model (provider or provider-native model slug) SHALL set that agent's requested effort to `auto` together with its new route in persistent and live state. An inference run resumed by the switch MUST use the new pair, with `auto` resolved against the new model. Same-route selections and rejected or rolled-back switches MUST preserve the previous pair. Switching MUST NOT depend on a second effort mutation by the client.

#### Scenario: Two models both support high
- **GIVEN** a chat explicitly requests `high` and both old and new models support `high`
- **WHEN** the owner switches to a different model using the picker or another covered entry point
- **THEN** the first read after success and a later reload both report requested effort `auto`; inference uses the target model's default, not the old explicit level
- **AND** the owner can explicitly select `high` again on the new model
- **AND** the result is the same through the chat model picker, each agent model HTTP endpoint and the model-switch runtime operation, including its provider-scope fan-out

#### Scenario: Select the same route
- **WHEN** the owner opens the picker or reselects the same canonical route with an explicit effort already chosen
- **THEN** neither the saved nor the live preference changes

#### Scenario: Refused or rolled-back change
- **WHEN** a switch is refused, loses the concurrent-change check, or cannot complete the existing unpark operation
- **THEN** the failed operation does not commit its proposed route or an isolated `auto` reset; a rollback restores the pair it replaced without overwriting a later successful edit

### Requirement: Account-only switches and route rewrites keep effort
A switch that keeps the provider and model slug and only moves an agent to another connection of that provider SHALL keep a requested effort that the target model's cached catalogue lists as supported and SHALL set `auto` otherwise, including when the target catalogue is cold or reports no reasoning levels. Determining support MUST NOT trigger model discovery. Renaming a connection, route migrations and session persistence MUST NOT change requested effort.

#### Scenario: Credential and provider-scope switches
- **GIVEN** an agent requests `high` on a model slug
- **WHEN** a switch moves it to another connection of the same provider with the same model slug
- **THEN** it keeps `high` when the target connection's model supports `high`, and requests `auto` when it does not
- **AND** in a provider-scope switch each agent actually moved follows the same rule, and no agent left on its existing route loses its preference

#### Scenario: Target support is unknown
- **WHEN** an agent requesting `high` moves to the same model slug on another connection whose cached catalogue is cold or lists no reasoning levels for it
- **THEN** the switch stores `auto` with the new route and no provider request is made to decide it

#### Scenario: Connection rename is not a model change
- **WHEN** the owner renames a connection and saved routes are rewritten to the new account name
- **THEN** every affected agent keeps its requested effort
