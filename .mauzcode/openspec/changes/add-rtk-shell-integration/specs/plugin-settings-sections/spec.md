# Spec Delta

## Purpose

Allow trusted plugins to expose explicitly granted settings sections in a shared host-owned settings surface without taking over navigation or weakening server authorization.

## ADDED Requirements

### Requirement: Granted settings section contribution
The public UI extension contract SHALL allow a plugin to declare named settings sections with a title and component. The host SHALL render a section only when its identifier has an explicit matching plugin UI grant. Existing extensions without settings sections SHALL remain compatible.

#### Scenario: Granted section is visible
- **GIVEN** a loaded eligible plugin declares a settings section and its manifest grants that section
- **WHEN** the user opens Plugin Settings
- **THEN** the host renders the section with the plugin's component and host context.

#### Scenario: Missing grant
- **GIVEN** a plugin declares a section without its matching grant
- **WHEN** the extension registry is constructed
- **THEN** that section is not exposed in Plugin Settings.

#### Scenario: Existing extension remains valid
- **GIVEN** an existing extension declares no settings sections
- **WHEN** it loads under the updated SDK
- **THEN** its previously granted contributions retain their behavior.

### Requirement: Host ownership and plugin lifecycle
The host SHALL provide a shared Plugin Settings page in Settings. Plugins SHALL contribute only their section content through the public SDK, without private shell imports or shell DOM mutation. Disabled, unloaded or otherwise ineligible plugin UIs SHALL not retain an active section.

#### Scenario: Plugin is unloaded
- **GIVEN** a plugin settings section is mounted
- **WHEN** the host receives the plugin lifecycle update removing that plugin
- **THEN** its section is unmounted and its resources are cleaned up.

#### Scenario: Plugin supplies its own UI
- **GIVEN** a plugin exposes a granted section through its UI entry
- **WHEN** its eligible bundle is loaded
- **THEN** the shared page hosts it without an RTK-specific component in core or a second React runtime.

### Requirement: Settings grants participate in UI trust decisions
Settings section grants SHALL be validated and included in the same compilation, manifest and approval identity checks as other UI grants. Adding this capability SHALL NOT bypass the existing human bundle approval requirement for non-official plugins.

#### Scenario: Unapproved third-party bundle
- **GIVEN** a non-official plugin has no applicable human-approved UI bundle
- **WHEN** it declares a settings section
- **THEN** the section does not execute merely because it has a settings grant.

#### Scenario: Granted surface changes
- **GIVEN** a third-party UI has an existing approval
- **WHEN** its settings section grants change
- **THEN** the previous approval is not silently reused for the changed grant set.

### Requirement: Accessible presentation and independent backend authority
Settings sections SHALL receive the existing theme, read-only and agent context. They SHALL preserve semantic theme tokens, keyboard access, accessible status/error feedback and reduced-motion preferences. Backend settings operations SHALL independently enforce authentication, ownership and CSRF for writes; UI visibility and read-only flags SHALL NOT authorize a write.

#### Scenario: Read-only viewer
- **GIVEN** the host supplies read-only context
- **WHEN** a settings section is displayed
- **THEN** its controls do not offer mutations and the backend still rejects unauthorized direct writes.

#### Scenario: Accessible status
- **GIVEN** a settings action succeeds or fails
- **WHEN** the section updates
- **THEN** the result is available as accessible text rather than only color or motion.
