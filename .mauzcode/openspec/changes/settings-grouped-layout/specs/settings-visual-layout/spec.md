## Purpose

Define the shared visual language of the Settings dialog: a grouped-list presentation used by every built-in section, consistent navigation styling, and the guarantee that restyling never removes existing controls, accessibility or theme support.

## ADDED Requirements

### Requirement: Grouped list presentation

Built-in Settings sections SHALL present their options as inset groups: an optional uppercase group title above, a rounded group surface containing rows separated by hairlines, and an optional footnote below. Rows SHALL place the label on the leading side and the control, value, status badge or disclosure chevron on the trailing side, with a minimum row height of 44px.

#### Scenario: Group renders title, rows and footnote
- **WHEN** a section renders a group with a title, three rows and a footnote
- **THEN** the title appears above a single rounded surface, the rows are separated by hairlines inside it, and the footnote appears below it

#### Scenario: Trailing control alignment
- **WHEN** a row contains a label and a switch
- **THEN** the label is on the leading side and the switch on the trailing side of the same row

### Requirement: Expandable rows

A row that leads to more detail SHALL show a disclosure chevron and expand its details in place directly below the row when activated. The disclosure SHALL be a single button that covers the row's leading content and chevron and reports its state with `aria-expanded` and `aria-controls`. Trailing interactive controls (switches, buttons) MUST be siblings of the disclosure button, never nested inside it, and activating them MUST NOT toggle the row.

#### Scenario: Expand a row with the keyboard
- **WHEN** the owner focuses a row with a disclosure chevron and presses Enter or Space
- **THEN** its details appear directly below it and the control reports the expanded state

#### Scenario: Trailing switch does not toggle the row
- **WHEN** a collapsed connection row has an enable switch and the owner toggles the switch
- **THEN** the connection is enabled or disabled, the row stays collapsed, and the switch is not a descendant of the disclosure button

### Requirement: Models section layout

The Models tab SHALL keep Add connection before existing connections and SHALL show one group per provider: a header row with logo, label, disabled badge when applicable and the global enable switch, then one row per connection with account name, status badge, transport, client version with its source, quota summary and enable switch.

#### Scenario: Provider group with connections
- **WHEN** a provider has two connections
- **THEN** its group shows the provider header row followed by two connection rows, each with status, transport, client version and an enable switch

### Requirement: Models connection details

Expanding a connection row SHALL show, in order: usage status with reason, quota meters, plan and balance; the provider login panel when supported; Re-detect when allowed; the model list with last update time, Update models, per-model switches, context limit and draft save; then Test, Edit and Remove. A granted plugin provider component SHALL replace the schema-driven edit form there.

#### Scenario: Connection details
- **WHEN** the owner expands a connection row
- **THEN** usage, quota windows, plan or balance when present, login panel when supported, model list with Update models, Test, Edit and Remove are shown below it, and Remove still requires confirmation

#### Scenario: Plugin provider form
- **WHEN** the provider has a granted plugin component and the owner chooses Edit in the expanded row
- **THEN** the plugin component is rendered instead of the schema-driven form

### Requirement: Models connection expansion

At most one connection row SHALL be expanded at a time. The model list SHALL be requested when the row is expanded and only for a registered provider; for an unregistered provider the details SHALL show a note instead of the model list and Edit SHALL be disabled with an accessible reason.

#### Scenario: Unregistered provider
- **WHEN** the owner expands a connection whose provider is not registered
- **THEN** no model list request is sent, a note explains that the provider is unavailable, and Edit is disabled with a reason while Remove stays available

#### Scenario: One expanded connection
- **WHEN** one connection row is expanded and the owner expands another
- **THEN** the first row collapses and the second shows its details

### Requirement: Voice section layout

The Voice tab SHALL show three groups in order: "Default route" with the voice model selector, "Connections" with one row per voice connection and an add row, and "Errors" with Error ID lookup and access to recent errors. Expanding a voice connection row SHALL show its test result and Edit, Test and Remove controls; Remove still requires confirmation.

#### Scenario: Voice groups order
- **WHEN** the Voice tab loads with one voice connection
- **THEN** the Default route, Connections and Errors groups appear in that order and the Connections group contains that connection and an add row

### Requirement: Agent presets section layout

The Agent presets tab SHALL show one row per preset with name, identifier, Built-in or Custom badge and a "Default for new sessions" marker for the default preset. At most one row SHALL be expanded at a time; expanding a row SHALL show the description, allow, deny, plugins and excluded sections as chips (empty lists as "none", `*` with its everything label), the additional prompt, the sort order and the update metadata. The panel MUST keep the read-only rules of `agent-presets-settings-ui`.

#### Scenario: Expand a preset
- **WHEN** the owner expands the default preset row
- **THEN** its rules are shown as chips with its prompt and metadata, and no edit controls appear

### Requirement: SSH Instances section layout

The SSH Instances tab SHALL show a group with one row per instance showing name, user@host:port, verification status and the tool probe summary, followed by an add row. The add form SHALL open below the list.

#### Scenario: Instance row summary
- **WHEN** an instance has been tested with python3 and codex available and claude missing
- **THEN** its row shows the verified status and the probe summary for all three tools

### Requirement: SSH instance details

Expanding an instance row SHALL show, in order: the instance's own public key with a copy action and the authorized_keys hint, the setup steps while the host key is unverified, Test connection, Verify or Replace host key, Edit connection and Remove; trust, edit and remove forms SHALL open inside the row. An unverified instance SHALL start expanded.

#### Scenario: Per-instance public key
- **WHEN** two instances exist and the owner expands each row
- **THEN** each row shows its own public key and copy action

#### Scenario: Unverified instance starts expanded
- **WHEN** a newly added instance has no verified host key
- **THEN** its row is expanded with the public key and setup steps visible

### Requirement: Notifications section layout

The Notifications tab SHALL show a "Push on this device" switch row with an explanatory subtitle, and a "Connected devices" group with one row per device, marking the current device. Turning the switch off and removing a device MUST still require confirmation. While the disable confirmation is open the switch SHALL stay on; Cancel SHALL close the confirmation with the switch still on.

#### Scenario: Disable push on this device
- **WHEN** the owner turns the switch off
- **THEN** a confirmation appears, the switch stays on, and the subscription is removed only after confirming

#### Scenario: Cancel disabling
- **WHEN** the disable confirmation is open and the owner chooses Cancel
- **THEN** the confirmation closes, the switch is on and no request is sent

### Requirement: Push switch states

Turning the push switch on SHALL subscribe this device. The switch SHALL be off and disabled while push is unavailable in the browser or not configured on the server, with the reason as its subtitle; it SHALL be disabled while the permission request or subscription is in progress; when permission is denied or subscribing fails it SHALL return to off and the error SHALL be announced.

#### Scenario: Push unavailable
- **WHEN** the page is not served over HTTPS
- **THEN** the switch is off and disabled and its subtitle explains why push is unavailable

#### Scenario: Permission denied
- **WHEN** the owner turns the switch on and the browser denies notification permission
- **THEN** the switch returns to off and the blocked-permission message is announced through a status or alert role

### Requirement: Push permission request

When the owner turns the push switch on, the browser permission request SHALL start synchronously in the switch's activation handler, before any network or service-worker await.

#### Scenario: Permission requested in the gesture
- **WHEN** the owner turns the switch on while permission is not yet granted
- **THEN** the permission request starts before any network request or service-worker await of that activation

### Requirement: Updates section layout

The Updates tab SHALL show a status card with the update state and message, current and target revisions, a primary action and a secondary "Check upstream" action, followed by a key/value summary of upstream and working tree state. Update and restart MUST still require explicit confirmation.

#### Scenario: Update available
- **WHEN** an update is available
- **THEN** the card shows the current and target revisions, an enabled "Update and restart…" action that opens a confirmation, and "Check upstream"

### Requirement: SOCKS5 section layout

The SOCKS5 tab SHALL show a group with one row per proxy showing label, address, login and check status with a check action, followed by an add row; add and edit forms SHALL open below the list and keep saved credentials unchanged when left blank.

#### Scenario: Edit proxy without changing credentials
- **WHEN** the owner edits a proxy and leaves login and password empty
- **THEN** the form states that saved credentials will not change and saving keeps them

### Requirement: Navigation styling

The Settings navigation SHALL use monochrome icons, mark the active section with an accent bar in addition to the selected background, and separate plugin tabs from built-in tabs with a divider. The compact section selector and the unavailable-plugin notice SHALL be kept.

#### Scenario: Plugin tabs separated
- **WHEN** at least one plugin settings tab is granted
- **THEN** a divider appears between the last built-in tab and the first plugin tab

### Requirement: Preserved controls, accessibility and themes

The restyling MUST NOT remove any existing control, state message, confirmation or plugin extension point of the Settings sections. All sections SHALL use existing light and dark theme tokens (including the system dark theme), keep visible focus, semantic headings and status/alert roles, and disable non-essential motion under reduced motion.

#### Scenario: Dark theme
- **WHEN** the dark theme is active, explicitly or through the system preference
- **THEN** group surfaces, separators and text use the dark theme tokens with readable contrast

#### Scenario: Reduced motion
- **WHEN** the user prefers reduced motion
- **THEN** switch and row expansion transitions are not animated
