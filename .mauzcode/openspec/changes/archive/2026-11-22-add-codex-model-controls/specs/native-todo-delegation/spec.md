## MODIFIED Requirements

### Requirement: Child model validation before creation
The model and reasoning effort of a delegation SHALL be validated against the effective route, including an inherited route, before any child is created. An unknown or non-canonical route, a disabled provider, a disabled connection, a disabled model or an effort level the target model does not support MUST fail the delegation with an error naming the rejected value, and MUST NOT create a child, todo list or queued turn.

#### Scenario: Disabled model
- **WHEN** an agent delegates with `model` set to a route whose model the owner disabled
- **THEN** the call fails, the error names the route, and no child agent exists afterwards

#### Scenario: Bare model id
- **WHEN** an agent delegates with `model` set to a model id without provider and account
- **THEN** the call fails and no child agent exists afterwards

#### Scenario: Unsupported effort
- **WHEN** an agent delegates with a `reasoningEffort` level that the target model does not support
- **THEN** the call fails and no child agent exists afterwards

#### Scenario: Maximum effort on an inherited route
- **WHEN** the caller omits `model` and selects `max` on a parent route advertising only `xhigh` with native alias `max`
- **THEN** delegation rejects `max` without creating or queueing anything; the SDK's nearest-level fallback is not used for delegation
- **AND** if the inherited route actually advertises SDK `max`, the child starts with `max`
