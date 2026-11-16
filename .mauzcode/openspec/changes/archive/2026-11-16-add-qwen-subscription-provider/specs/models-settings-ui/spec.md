## MODIFIED Requirements

### Requirement: Add and edit connections
The Models tab SHALL let the owner pick a provider type from the catalogue (built-in and plugin providers), fill the account name, the provider fields and the transport, test, save, edit and remove a connection; removal MUST require explicit confirmation. The Add connection control and its expanded provider-selection and creation form SHALL appear at the beginning of the tab's connection-management content, before the existing connection list in both visual and DOM/keyboard navigation order. This placement SHALL apply to all providers, without duplicating the creation block or changing the existing first-connection expanded state.

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
