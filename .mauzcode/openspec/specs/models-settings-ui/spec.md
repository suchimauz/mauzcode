# models-settings-ui Specification

## Purpose
Defines the "Models" settings tab where the owner manages LLM connections, and the UI extension slot through which plugins contribute provider-specific connection forms.

## Requirements

### Requirement: Models settings tab
The settings dialog SHALL show a "Models" tab as the only model connection settings surface. The legacy "LLM Connections", LLMs and model-policy settings surfaces MUST NOT be shown.

#### Scenario: Owner opens settings
- **WHEN** the owner opens settings
- **THEN** the "Models" tab is listed and opens its panel, and no "LLM Connections" or legacy model-policy tab is listed

### Requirement: Connection list
The Models tab SHALL list connections with account name, provider label and icon, transport, enabled state and the usage report (status and, when present, quota windows and balance).

#### Scenario: Connection with quota windows
- **WHEN** a connection's usage report contains quota windows
- **THEN** each window is shown with its label, used percent and reset time

#### Scenario: Connection with status only
- **WHEN** a connection's usage report has no windows
- **THEN** only its status and reason are shown

### Requirement: Add and edit connections
The Models tab SHALL let the owner pick a provider type from the catalogue (built-in and plugin providers), fill the account name, the provider fields and the transport, test, save, edit and remove a connection; removal MUST require explicit confirmation. The Add connection control and its expanded creation form SHALL precede the existing connection list in visual and DOM/keyboard order for all providers, without duplicating the creation block or changing the first-connection expanded state.

#### Scenario: Add a custom connection
- **WHEN** the owner picks Custom, fills the account name, URL, protocol and key and saves
- **THEN** the new connection appears in the list without a page reload

#### Scenario: Remove requires confirmation
- **WHEN** the owner clicks remove on a connection
- **THEN** nothing is deleted until the owner confirms

#### Scenario: Existing connections
- **WHEN** the owner opens Models with existing connections
- **THEN** a single Add connection control appears above the connection list, not after it, and precedes connection-card controls in keyboard navigation order

#### Scenario: Expanded creation form
- **WHEN** the owner opens Add connection and selects any built-in or plugin provider
- **THEN** the provider picker and creation form remain above the existing connections, with the existing validation and save/cancel behavior

#### Scenario: First connection
- **WHEN** the owner opens Models with no connections
- **THEN** the existing expanded first-connection creation flow remains available at the beginning of the content with no duplicate creation block

### Requirement: Schema-driven forms
When a provider has no custom UI component, its form SHALL be generated from its field schema; secret fields MUST be write-only and show only whether a value is set.

#### Scenario: Editing a connection with a stored key
- **WHEN** the owner edits a connection whose API key is set
- **THEN** the key input is empty, marked as set, and leaving it empty keeps the stored key

### Requirement: Plugin provider components
A plugin UI SHALL be able to contribute a React component for its own provider through a `modelProviders` extension entry, which is used only when the plugin's package grants that provider id and the plugin UI bundle is approved.

#### Scenario: Granted plugin component
- **WHEN** an approved plugin UI declares a `modelProviders` entry for provider `acme` and its package grants `acme`
- **THEN** the Models tab uses that component for `acme` connections

#### Scenario: Ungranted component
- **WHEN** a plugin UI declares a `modelProviders` entry for an id its package does not grant
- **THEN** the entry is ignored and the schema-driven form is used

#### Scenario: Duplicate provider component
- **WHEN** two extensions declare a component for the same provider id
- **THEN** the registry rejects the duplicate as it does for other extension slots

### Requirement: Accessible settings UI
The Models tab SHALL be keyboard operable, label every form control, follow the active theme and respect reduced motion.

#### Scenario: Keyboard-only use
- **WHEN** the owner navigates the Models tab with the keyboard only
- **THEN** every action (add, edit, test, save, remove, confirm) is reachable and has a visible focus state

### Requirement: Per-model enable switches
The connection's model list in the Models tab SHALL show an accessible switch for every model, with vertical spacing between rows, and the model's shared display name next to its id for every provider. Clicking anywhere on a model row MUST toggle its switch. Disabled models MUST stay visible, dimmed and labelled `Disabled`.

#### Scenario: Row click toggles
- **WHEN** the owner clicks the text of a model row
- **THEN** that model's switch changes

#### Scenario: Names for every provider
- **WHEN** a claude connection lists `claude-sonnet-4-5` without a provider label
- **THEN** its row shows "Claude Sonnet 4.5" next to the id, as codex rows show their provider labels

### Requirement: Saving model switch changes
Toggles MUST only change a local draft. While the draft differs from the stored state the tab SHALL show `Save (N)` and `Reset`, and no request MUST be sent until Save. Save MUST announce errors and show the stored state afterwards.

#### Scenario: Turn a model off
- **WHEN** the owner clicks a model row and then Save
- **THEN** exactly one change is sent for that model and it is shown as Disabled

#### Scenario: Toggling without saving
- **WHEN** the owner toggles models but does not press Save
- **THEN** no request is sent, and Reset restores the stored state

#### Scenario: Save fails
- **WHEN** saving fails
- **THEN** an error message is announced

### Requirement: Update models
The model list SHALL show when it was last fetched and offer an `Update models` button. Opening the list MUST read the cache; only the button MUST ask the provider.

#### Scenario: Update the cached list
- **WHEN** the owner presses Update models
- **THEN** the provider is asked, the list and its update time are replaced, or a failure is shown while the old list stays

### Requirement: Readable status reasons
Connection status SHALL show test and usage reason codes as human-readable text, keeping the raw code available as a tooltip; unknown codes MUST be shown unchanged.

#### Scenario: Provider not loaded
- **WHEN** a check reports `unknown-provider`
- **THEN** the card says the provider is not loaded and suggests restarting MauzCode

### Requirement: Provider logos
Connection cards and the add-connection form SHALL show the mark from the shared model mark resolver as an inert image: the brand logo of known providers, and for custom connections always the distinct generic plug icon, regardless of their endpoint or protocol.

#### Scenario: Codex connection
- **WHEN** a codex connection is listed
- **THEN** its card shows the OpenAI mark

#### Scenario: Claude connection
- **WHEN** a claude connection is listed
- **THEN** its card shows the Claude mark

#### Scenario: Custom connection
- **WHEN** a custom connection is listed, whatever its protocol
- **THEN** its card shows the generic plug icon instead of a brand logo

### Requirement: Provider login panel
For a connection whose provider requires login the Models tab SHALL offer a login panel matching the provider's flow kind, with live status, a cancel button, logout with confirmation and an indication when login is required. The device-code flow (codex) SHALL show the verification link and a copyable one-time code; the authorization-code flow (claude) SHALL show the authorization link, local callback status and a paste field that keeps its value on a submission error.

#### Scenario: Login flow
- **WHEN** the owner starts login on a codex connection
- **THEN** the link and code are shown, status updates until it succeeds, fails or expires, and the connection is refreshed on success

#### Scenario: Authorization-code login
- **WHEN** the owner starts login on a claude connection, opens the link and pastes the returned code
- **THEN** the code is submitted, status updates until it succeeds, fails or expires, and the connection is refreshed on success

#### Scenario: Rejected code
- **WHEN** the pasted code is rejected
- **THEN** a safe error is shown, the flow stays pending and the owner can paste again

#### Scenario: Logout needs confirmation
- **WHEN** the owner chooses logout
- **THEN** the tokens are removed only after confirmation

### Requirement: Legacy settings links lead to Models
UI links that pointed at legacy LLM pages or the LLM Connections tab SHALL open the Models tab instead. The Codex account reset and MauzCode node settings controls MUST be removed.

#### Scenario: Open connections from SSH instances
- **WHEN** the owner follows the connections link in the SSH instances panel
- **THEN** the Models tab opens

#### Scenario: Applications list
- **WHEN** the owner opens Applications
- **THEN** no `/llms` page is listed or linked

#### Scenario: No legacy account controls
- **WHEN** the owner opens settings
- **THEN** no Codex account reset or node URL control is shown

### Requirement: Model pickers use model connections
Every model picker (new session, chat header, agent model switch) SHALL group selectable models by connection, with both provider and connection/account name in each group label. Distinct connections MUST remain distinct even when account names match; SSH host context MUST be preserved. Each model retains its catalogue label and reasoning levels, and selecting a model stores its unchanged model route.

#### Scenario: New session picker
- **GIVEN** enabled claude, codex and custom connections
- **WHEN** the owner opens the new-session model picker
- **THEN** available models are grouped under provider-and-account labels, and choosing one creates the agent with its route

#### Scenario: Matching account names across providers
- **GIVEN** claude and codex connections both named `personal`
- **WHEN** the owner opens any model picker
- **THEN** separate groups identify `claude · personal` and `codex · personal` rather than two account-only headings or a merged group

#### Scenario: Remote connections
- **GIVEN** local and SSH connections with the same provider and account name
- **WHEN** their selectable models are displayed
- **THEN** the groups remain separate and remote headings retain their SSH host context alongside provider and account

#### Scenario: Connection catalogue unavailable
- **WHEN** an enabled connection's model list cannot be loaded
- **THEN** the picker still lists the other enabled connections and shows that connection as unavailable with its provider and account name
