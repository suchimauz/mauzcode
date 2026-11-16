## ADDED Requirements

### Requirement: Provider enable switch
The Models tab SHALL group connection cards under a header per registered provider showing the provider mark, label and an accessible enable switch reflecting the provider catalogue's `enabled` state. Providers without connections SHALL also get a header row with the switch. Toggling the switch SHALL send the owner-only `setProviderEnabled` action and refresh the panel; failures SHALL be announced and the stored state shown. A hint SHALL explain that a disabled provider hides its models and that active sessions using them stop with an error.

#### Scenario: Toggle a provider off
- **WHEN** the owner turns off the `codex` provider switch
- **THEN** one `setProviderEnabled` request is sent, the panel reloads and the `codex` header shows the disabled state

#### Scenario: Provider without connections
- **WHEN** a registered provider has no stored connections
- **THEN** its header row with logo, label and switch is still shown

#### Scenario: Toggle failure
- **WHEN** the `setProviderEnabled` request fails
- **THEN** an error is announced and the switch shows the stored state

#### Scenario: Switch locked by an instance file
- **WHEN** the API reports `enabledLocked: true`
- **THEN** every provider switch is rendered disabled with an accessible hint that the value is fixed by an instance settings file, and no request is sent

### Requirement: Disabled provider presentation
While a provider is disabled its header SHALL carry a disabled badge, its connection cards SHALL be visually dimmed, and Test, Update models and provider login controls MUST be blocked without sending requests. The connection-level enable switch and edit/remove controls SHALL remain operable, and stored connections and secrets MUST NOT change when the provider is toggled. Blocking in the UI is presentation only; the backend refuses the same operations independently.

#### Scenario: Disabled provider cards
- **WHEN** the owner disables a provider with two connections
- **THEN** both cards stay listed, dimmed under the disabled header, with Test, Update models and Login blocked and the connection switches still operable

#### Scenario: Re-enable restores controls
- **WHEN** the owner re-enables the provider
- **THEN** the badge disappears and the blocked controls work again without any connection change

## MODIFIED Requirements

### Requirement: Add and edit connections
The Models tab SHALL let the owner pick a provider type from the catalogue (built-in and plugin providers), fill the account name, the provider fields and the transport, test, save, edit and remove a connection; removal MUST require explicit confirmation. The Add connection control and its expanded provider-selection and creation form SHALL appear at the beginning of the tab's connection-management content, before the existing connection list in both visual and DOM/keyboard navigation order. This placement SHALL apply to all providers, without duplicating the creation block or changing the existing first-connection expanded state. Disabled providers MUST NOT be offered in the provider selector; when every provider is disabled the form SHALL show a note instead of an empty selector.

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

#### Scenario: Disabled provider hidden from creation
- **WHEN** the owner opens Add connection while provider `codex` is disabled
- **THEN** `codex` is absent from the provider selector and the other providers remain selectable

#### Scenario: All providers disabled
- **WHEN** every registered provider is disabled
- **THEN** the creation form shows a note that no provider is enabled instead of an empty selector

### Requirement: Model pickers use model connections
Every model picker (new session, chat header, agent model switch) SHALL group selectable models by connection, with both provider and connection/account name in each group label. Distinct connections MUST remain distinct even when account names match; SSH host context MUST be preserved. Each model retains its catalogue label and reasoning levels, and selecting a model stores its unchanged model route. Models of globally disabled providers MUST NOT be offered, and their groups MUST NOT appear as unavailable-catalogue notices.

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