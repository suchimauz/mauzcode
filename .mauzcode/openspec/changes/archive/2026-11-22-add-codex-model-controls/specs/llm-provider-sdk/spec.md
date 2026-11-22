## ADDED Requirements

### Requirement: Optional response control descriptors
A model descriptor SHALL be able to report typed speed choices (`standard`, `fast`, `ultrafast`) and output verbosity choices (`low`, `medium`, `high`) independently, with an optional advertised default verbosity. Omitted capabilities MUST NOT imply support. Existing providers and callers MUST NOT be required to supply new fields or use a new inference entry point.

#### Scenario: Capability belongs to a route, not a model name
- **WHEN** the same model slug advertises Fast on one connection and only Standard on another
- **THEN** callers see different supported choices for the two routes, not their union

#### Scenario: Unmodified provider
- **WHEN** a provider returns a descriptor without response controls
- **THEN** the descriptor remains valid and existing calls continue without a control lookup or forced wire options

### Requirement: Distinct maximum reasoning level
The SDK SHALL recognize `max` as an ordered level above `xhigh` across public reasoning inputs, outputs and normalization. A model MUST NOT acquire `max` merely because its existing `xhigh` maps to the native string `max`. `ultra` MUST NOT be an SDK reasoning level.

#### Scenario: Model advertises both top levels
- **WHEN** a model lists `xhigh` and `max` and a caller selects `max`
- **THEN** the requested and applied levels are both `max`; `xhigh` remains a separate choice

#### Scenario: Native alias is not a new SDK capability
- **GIVEN** an existing provider supports up to SDK `xhigh` and maps it to native `max`
- **WHEN** its catalogue is listed and `xhigh` is requested
- **THEN** the list does not gain `max`, and the existing wire value remains `max`
- **AND** an SDK caller requesting `max` on that route follows the existing nearest-supported-level rule rather than changing that provider's profile

### Requirement: Descriptors alone do not enable chat controls
Typed descriptors SHALL be readable for any provider. They MUST NOT by themselves opt a provider into Codex option names, chat consent or billing semantics. In this change only the Codex adapter has a defined chat dispatch contract; other providers MUST retain their existing option handling and MUST NOT gain selectable speed or verbosity controls in chat.

#### Scenario: Third-party provider reports display metadata
- **WHEN** a non-Codex provider reports Fast in its descriptor without implementing the Codex dispatch contract
- **THEN** SDK catalogue consumers can read the descriptor, but the picker offers no Fast switch and a chat request forwards no Codex options
