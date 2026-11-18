## ADDED Requirements

### Requirement: Child model choice is outside presets
Choosing a model or reasoning effort for a delegated child SHALL NOT be governed by presets and MUST NOT change the child's function access. A `presetId` given together with a model MUST still only narrow the delegating agent's access.

#### Scenario: Model with narrowing preset
- **WHEN** an agent delegates with an enabled `model` and a `presetId` narrower than its own preset
- **THEN** the child runs on that model and its access equals the narrowed preset
