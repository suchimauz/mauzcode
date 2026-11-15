## ADDED Requirements

### Requirement: Plugin providers use shared protocols through the SDK
A provider declared by an official or user plugin SHALL reach shared wire protocols only by declaring a protocol route; it MUST NOT call private model namespaces. Core model code SHALL contain no vendor-specific knowledge of plugin providers.

#### Scenario: Plugin provider streams
- **WHEN** a plugin provider serves models through shared protocols
- **THEN** its source contains no call to a private model namespace and the repository architecture check passes

#### Scenario: Core stays vendor-neutral
- **WHEN** the core models source is searched for the plugin provider's vendor name or endpoints
- **THEN** no match is found
