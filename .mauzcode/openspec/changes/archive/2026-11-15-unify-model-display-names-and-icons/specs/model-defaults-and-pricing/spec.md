## MODIFIED Requirements

### Requirement: Provider icons from declarations
Provider marks shown in the UI SHALL come from the shared model mark resolver: the provider's brand mark when MauzCode has one, otherwise the generic plug icon for custom providers, otherwise the icon declared by the registered model provider. No hard-coded list of legacy provider ids MUST be used to decide which providers are listed.

#### Scenario: Icons for registered providers
- **WHEN** the UI requests provider icons
- **THEN** it receives a mark for each registered model provider (claude → Anthropic, codex → OpenAI, custom → plug) and none for legacy-only providers
