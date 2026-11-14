## REMOVED Requirements

### Requirement: Isolation from legacy model policy
**Reason**: The legacy model policy and legacy routes are retired. Per-connection model availability is now the only model policy.
**Migration**: Re-disable any legacy-disabled routes as disabled models on the corresponding connection in the Models settings tab.

## ADDED Requirements

### Requirement: Sole model availability policy
Per-connection disabled models and connection enablement SHALL be the only policy that decides whether a model may be selected or called. Model pickers MUST hide or mark disabled models and connections, and every agent turn, model change, compaction and one-shot call MUST refuse them before any provider request.

#### Scenario: Disabled model in a picker
- **WHEN** the owner opens the new-session model picker after disabling `gpt-6-sol` on a codex connection
- **THEN** `gpt-6-sol` cannot be selected

#### Scenario: One-shot call to a disabled model
- **WHEN** a one-shot call targets a disabled model
- **THEN** it fails with `MODEL_DISABLED_BY_USER` and no provider request is sent
