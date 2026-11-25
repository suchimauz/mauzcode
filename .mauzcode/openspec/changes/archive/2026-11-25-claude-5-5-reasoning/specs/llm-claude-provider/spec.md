## MODIFIED Requirements

### Requirement: Thinking and output limits
Messages requests SHALL set `max_tokens` to 16384 and `stream: true`. For reasoning effort `auto` no thinking field SHALL be sent. For low, medium, high or xhigh the request SHALL send `thinking: { type: "adaptive" }` and `output_config.effort` with xhigh mapped to `max`. For `off` the request SHALL send `thinking: { type: "disabled" }`, except for Claude 5 models (Opus, Sonnet, Haiku and Fable), where no thinking field is sent.

#### Scenario: High effort
- **WHEN** reasoning effort is `xhigh`
- **THEN** the body has adaptive thinking and effort `max`

#### Scenario: Off on Claude 5
- **WHEN** reasoning effort is `off` for a Claude 5 Opus, Sonnet, Haiku or Fable model
- **THEN** the body has no `disabled` thinking field

## ADDED Requirements

### Requirement: Claude 5 effort levels
The catalogue SHALL offer effort levels `low`, `medium` and `high` for every Claude 5 model (Opus, Sonnet, Haiku and Fable) and SHALL NOT offer `off`. It SHALL additionally offer `xhigh` for Opus and Fable models and for Sonnet and Haiku models from version 5.5 on. A requested `off` SHALL be applied as `low`, and `auto` SHALL leave effort to the model.

#### Scenario: Current catalogue
- **WHEN** models are listed for a claude connection
- **THEN** `claude-fable-5-2`, `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5` each offer `low`, `medium`, `high` and `xhigh`

#### Scenario: Earlier Sonnet 5
- **WHEN** effort `xhigh` is requested for `claude-sonnet-5`
- **THEN** `high` is applied and the result is marked as downgraded

#### Scenario: Off downgrades
- **WHEN** effort `off` is requested for `claude-haiku-5-5`
- **THEN** `low` is applied and the request carries adaptive thinking with effort `low`
