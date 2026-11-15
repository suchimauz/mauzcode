# Spec Delta

## Purpose

Allow trusted plugins to add their own explicitly granted tabs to the Settings dialog, shown with the plugin's title and icon, without taking over navigation or weakening server authorization.

## ADDED Requirements

### Requirement: Granted settings tab contribution
The public UI extension contract SHALL allow a plugin to declare named settings tabs with a title, optional description and component. The host SHALL show a tab only when its identifier has an explicit matching plugin UI grant. Existing extensions without settings tabs SHALL remain compatible.

#### Scenario: Granted tab is visible
- **GIVEN** a loaded eligible plugin declares a settings tab and its manifest grants that tab
- **WHEN** the user opens Settings
- **THEN** the navigation lists a separate tab with the plugin's title after the built-in tabs, and selecting it renders the plugin's component with host context.

#### Scenario: Missing grant
- **GIVEN** a plugin declares a tab without its matching grant
- **WHEN** the extension registry is constructed
- **THEN** that tab is not shown in Settings.

#### Scenario: Existing extension remains valid
- **GIVEN** an existing extension declares no settings tabs
- **WHEN** it loads under the updated SDK
- **THEN** its previously granted contributions retain their behavior.

### Requirement: Plugin icon for settings tabs
The navigation entry of a plugin settings tab SHALL use the plugin's declared icon (`procs.icon`, a validated Phosphor class). A missing, invalid or unloadable icon SHALL fall back to the standard plugin icon. Plugins SHALL NOT supply markup or URLs for the icon.

#### Scenario: Plugin declares an icon
- **GIVEN** a plugin with a granted settings tab declares a valid icon
- **WHEN** Settings is shown
- **THEN** its tab is shown with that icon.

#### Scenario: Plugin has no valid icon
- **GIVEN** a plugin with a granted settings tab declares no valid icon
- **WHEN** Settings is shown
- **THEN** its tab uses the standard plugin icon.

### Requirement: Host ownership and plugin lifecycle
The host SHALL own the Settings navigation, tab heading, icon and error isolation; there SHALL be no shared catch-all plugins tab. Plugins SHALL contribute only their tab content through the public SDK, without private shell imports or shell DOM mutation. Disabled, unloaded or otherwise ineligible plugin UIs SHALL not retain an active tab.

#### Scenario: Plugin is unloaded
- **GIVEN** a plugin settings tab is open
- **WHEN** the host receives the plugin lifecycle update removing that plugin
- **THEN** its navigation entry disappears, its content is unmounted and its resources are cleaned up, and the host shows that the tab is unavailable.

#### Scenario: Plugin supplies its own UI
- **GIVEN** a plugin exposes a granted tab through its UI entry
- **WHEN** its eligible bundle is loaded
- **THEN** Settings hosts it without an RTK-specific component in core or a second React runtime.

### Requirement: Settings grants participate in UI trust decisions
Settings tab grants SHALL be validated and included in the same compilation, manifest and approval identity checks as other UI grants. Adding this capability SHALL NOT bypass the existing human bundle approval requirement for non-official plugins.

#### Scenario: Unapproved third-party bundle
- **GIVEN** a non-official plugin has no applicable human-approved UI bundle
- **WHEN** it declares a settings tab
- **THEN** the tab does not execute merely because it has a settings grant.

#### Scenario: Granted surface changes
- **GIVEN** a third-party UI has an existing approval
- **WHEN** its settings tab grants change
- **THEN** the previous approval is not silently reused for the changed grant set.

### Requirement: Accessible presentation and independent backend authority
Settings tabs SHALL receive the existing theme, read-only and agent context. They SHALL preserve semantic theme tokens, keyboard access, accessible status/error feedback and reduced-motion preferences. Backend settings operations SHALL independently enforce authentication, ownership and CSRF for writes; UI visibility and read-only flags SHALL NOT authorize a write.

#### Scenario: Read-only viewer
- **GIVEN** the host supplies read-only context
- **WHEN** a settings tab is displayed
- **THEN** its controls do not offer mutations and the backend still rejects unauthorized direct writes.

#### Scenario: Accessible status
- **GIVEN** a settings action succeeds or fails
- **WHEN** the tab updates
- **THEN** the result is available as accessible text rather than only color or motion.
