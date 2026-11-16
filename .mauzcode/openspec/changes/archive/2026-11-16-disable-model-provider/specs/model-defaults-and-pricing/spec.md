## MODIFIED Requirements

### Requirement: Model selection without a default setting
There SHALL be no default-model setting. When an agent is created or a one-shot caller runs without a model, the system MUST use the last used model when it resolves, otherwise the first enabled model of the earliest enabled connection whose provider is not globally disabled, and otherwise fail with `NO_MODEL`. The legacy `llm.defaultModel` setting and the `MODEL` environment variable MUST NOT be read.

#### Scenario: Create agent without a model
- **GIVEN** the last used model is `codex/su4imauz:gpt-6-astra` and it resolves
- **WHEN** an agent is created without a model
- **THEN** the agent's model is `codex/su4imauz:gpt-6-astra`

#### Scenario: Last used model no longer resolves
- **GIVEN** the last used model names a removed connection
- **WHEN** an agent is created without a model
- **THEN** it gets the first enabled model of the earliest enabled connection whose provider is not disabled

#### Scenario: Last used model of a disabled provider
- **GIVEN** the last used model belongs to a globally disabled provider
- **WHEN** an agent is created without a model
- **THEN** selection skips it and uses the first enabled model of the earliest enabled connection of an enabled provider

#### Scenario: No usable model
- **GIVEN** no enabled connection of an enabled provider has an enabled model
- **WHEN** an agent is created without a model
- **THEN** creation fails with `NO_MODEL` and no agent is stored