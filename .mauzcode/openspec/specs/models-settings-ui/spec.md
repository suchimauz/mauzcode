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
The Models tab SHALL list connections as rows with account name, provider label and icon, transport, enabled state and a usage summary (status and, when present, the most used quota window). Expanding a row SHALL show the full usage report: status with reason, every quota window and balance. Wherever other requirements of this capability refer to a connection card, they SHALL apply to the connection row together with its expanded details.

#### Scenario: Connection with quota windows
- **WHEN** a connection's usage report contains quota windows
- **THEN** its collapsed row shows the status and a quota summary
- **AND** after expanding the row each window is shown with its label, used percent and reset time

#### Scenario: Connection with status only
- **WHEN** a connection's usage report has no windows
- **THEN** its row shows only its status, and the expanded details show the status and reason

### Requirement: Add and edit connections
The Models tab SHALL let the owner choose a built-in or plugin provider, enter an account name, provider fields and transport, and test, save, edit or remove connections. Removal MUST require explicit confirmation. Creation MUST follow the placement and provider-availability requirements below.

#### Scenario: Add a custom connection
- **WHEN** the owner picks Custom, fills the account name, URL, protocol and key and saves
- **THEN** the new connection appears in the list without a page reload

#### Scenario: Remove requires confirmation
- **WHEN** the owner clicks remove on a connection
- **THEN** nothing is deleted until the owner confirms

### Requirement: Connection creation placement
The Add connection control and expanded provider-selection and creation form SHALL precede existing connections in visual and DOM/keyboard order for all providers. The creation block MUST NOT be duplicated, and the existing first-connection expanded state MUST be preserved.

#### Scenario: Existing connections
- **WHEN** the owner opens Models with existing connections
- **THEN** a single Add connection control appears above the connection list, not after it, and precedes connection-card controls in keyboard navigation order

#### Scenario: Expanded creation form
- **WHEN** the owner opens Add connection and selects any built-in or plugin provider
- **THEN** the provider picker and creation form remain above the existing connections, with the existing validation and save/cancel behavior

#### Scenario: First connection
- **WHEN** the owner opens Models with no connections
- **THEN** the existing expanded first-connection creation flow remains available at the beginning of the content with no duplicate creation block

### Requirement: Enabled providers in connection creation
The provider selector MUST NOT offer disabled providers. When every provider is disabled, the creation form SHALL show a note instead of an empty selector.

#### Scenario: Disabled provider hidden from creation
- **WHEN** the owner opens Add connection while provider `codex` is disabled
- **THEN** `codex` is absent from the provider selector and the other providers remain selectable

#### Scenario: All providers disabled
- **WHEN** every registered provider is disabled
- **THEN** the creation form shows a note that no provider is enabled instead of an empty selector

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
Every model picker (new session, chat header, agent model switch) SHALL group models by connection, labelling each group with provider and connection/account name. Distinct connections MUST remain separate even with matching account names and MUST retain SSH host context. Models MUST retain catalogue labels, reasoning levels and unchanged selection routes. Globally disabled providers' models MUST be absent, with no unavailable-catalogue notices for their groups.

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

#### Scenario: Disabled provider is not a notice
- **WHEN** a picker loads while a provider is globally disabled
- **THEN** its connections' models are absent and no unavailable-catalogue notice is shown for them

### Requirement: Provider enable switch
The Models tab SHALL group connection cards under a header per registered provider showing the provider mark, label and an accessible enable switch reflecting the provider catalogue's `enabled` state. Providers without connections SHALL also get a header row with the switch. A hint SHALL explain that a disabled provider hides its models and that active sessions using them stop with an error.

#### Scenario: Provider without connections
- **WHEN** a registered provider has no stored connections
- **THEN** its header row with logo, label and switch is still shown

### Requirement: Provider switch toggling
Toggling the provider switch SHALL send the owner-only `setProviderEnabled` action and refresh the panel; failures SHALL be announced and the stored state shown. When the value is fixed by an instance settings file, every switch SHALL be disabled with an accessible hint and no request sent.

#### Scenario: Toggle a provider off
- **WHEN** the owner turns off the `codex` provider switch
- **THEN** one `setProviderEnabled` request is sent, the panel reloads and the `codex` header shows the disabled state

#### Scenario: Toggle failure
- **WHEN** the `setProviderEnabled` request fails
- **THEN** an error is announced and the switch shows the stored state

#### Scenario: Switch locked by an instance file
- **WHEN** the API reports `enabledLocked: true`
- **THEN** every provider switch is rendered disabled with an accessible hint that the value is fixed by an instance settings file, and no request is sent

### Requirement: Disabled provider presentation
While a provider is disabled its header SHALL carry a disabled badge, its connection rows SHALL be visually dimmed, and Test, Update models and provider login controls in the expanded details MUST be blocked without sending requests. The connection-level enable switch and edit/remove controls SHALL remain operable, and stored connections and secrets MUST NOT change when the provider is toggled. Blocking in the UI is presentation only; the backend refuses the same operations independently.

#### Scenario: Disabled provider cards
- **WHEN** the owner disables a provider with two connections
- **THEN** both rows stay listed, dimmed under the disabled header, with the connection switches still operable
- **AND** in their expanded details Test, Update models and Login are blocked

#### Scenario: Re-enable restores controls
- **WHEN** the owner re-enables the provider
- **THEN** the badge disappears and the blocked controls work again without any connection change

### Requirement: Connection client version display
For each connection whose provider reports a client version, the Models tab SHALL show the effective version and a human-readable source (connection override, detected CLI, built-in fallback or built-in default) next to the provider and transport line of the connection card, with the provider detail as a tooltip. Connections of providers without a report SHALL show no version.

#### Scenario: Claude connection with detected version
- **GIVEN** a claude connection with detection enabled on a host where `claude --version` prints `2.1.300`
- **WHEN** the owner opens the Models tab
- **THEN** the card shows `v2.1.300` with a source saying it was detected from `claude --version`

#### Scenario: Codex connection with detected version
- **GIVEN** a codex connection with detection enabled on a host where `codex --version` prints `codex-cli 0.160.0`
- **WHEN** the owner opens the Models tab
- **THEN** the card shows `v0.160.0` with a source saying it was detected from `codex --version`

#### Scenario: Codex connection with default version
- **GIVEN** a codex connection without override and with detection disabled
- **WHEN** the owner opens the Models tab
- **THEN** the card shows the SDK default version with the source "built-in default"

#### Scenario: Override changes the display
- **WHEN** the owner saves a client version override on a claude or codex connection
- **THEN** after the card reloads it shows the override version with the source "connection override"

#### Scenario: Provider without version report
- **WHEN** the Models tab shows a connection whose provider does not report a client version
- **THEN** its card shows no version and the client version is not requested for it

### Requirement: Exclusive override and detection in the form
The connection form SHALL NOT allow a client version override and "Detect CLI version" at the same time: while the override field is not empty the checkbox SHALL be unchecked and disabled.

#### Scenario: Typing an override
- **GIVEN** the claude connection form with "Detect CLI version" checked
- **WHEN** the owner types a client version override
- **THEN** the checkbox becomes unchecked and disabled, and saving sends detection disabled

### Requirement: Client version re-detect
A connection card with CLI detection enabled SHALL offer a re-detect control that refreshes the provider's local detection and shows the new result. The control SHALL be disabled while running and SHALL NOT be shown when an override is set or detection is disabled.

#### Scenario: Re-detect after CLI update
- **GIVEN** a claude connection showing a cached detected version and a newer `claude` installed
- **WHEN** the owner presses re-detect
- **THEN** the card shows the newer version with source detected

### Requirement: Lazy client version loading
The client version SHALL be loaded per connection after the Models overview is shown; the overview MUST NOT wait for it. While loading the card SHALL show a version placeholder; after a load failure it SHALL show the provider and transport line without a version and without an error toast.

#### Scenario: Version lookup fails
- **WHEN** loading the client version fails for a connection
- **THEN** the card still shows provider and transport without a version and no error toast is raised

### Requirement: Client version API action
The owner-only Models API SHALL provide a client version action for one connection, with an optional refresh flag, that requires a valid CSRF token and returns only the secret-free report, or no report when the provider has none.

#### Scenario: Unauthorized version request
- **WHEN** the client version action is called without owner access or without a valid CSRF token
- **THEN** it is refused and no provider code runs
