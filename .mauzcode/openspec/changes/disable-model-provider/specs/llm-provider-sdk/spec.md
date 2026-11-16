## ADDED Requirements

### Requirement: Core-owned provider enablement
Provider enablement SHALL be owned by the core, derived from the global `models.disabledProviders` setting. Provider declarations SHALL NOT implement, store or override enablement: the declaration contract is unchanged, and a provider that declares nothing about enablement is fully governed by the core switch.

#### Scenario: Declaration contract unchanged
- **WHEN** an existing provider declaration (core or plugin) is loaded after this change
- **THEN** it registers without any enablement field or check, and the core switch still governs its connections

### Requirement: Provider enablement reporting
The declaration catalogue `models.providers()` SHALL stay synchronous and unchanged in shape; the effective state SHALL be exposed by the models settings API, which reports per provider `enabled` and `enabledLocked` computed on every request.

#### Scenario: Settings API reflects the switch
- **WHEN** the owner disables provider `qwen` and the models settings API is read
- **THEN** the `qwen` entry reports `enabled: false` with its declared metadata unchanged, and other providers report `enabled: true`

#### Scenario: Declaration catalogue unchanged
- **WHEN** a caller reads `models.providers()` after this change
- **THEN** it receives the same synchronous secret-free catalogue as before, without an enablement field

#### Scenario: Read-through state
- **WHEN** the setting changes between two settings API reads
- **THEN** the second read reports the new state without a restart or cache expiry
