## MODIFIED Requirements

### Requirement: Connection list
The Models tab SHALL list connections as rows with account name, provider label and icon, transport, enabled state and a usage summary (status and, when present, the most used quota window). Expanding a row SHALL show the full usage report: status with reason, every quota window and balance. Wherever other requirements of this capability refer to a connection card, they SHALL apply to the connection row together with its expanded details.

#### Scenario: Connection with quota windows
- **WHEN** a connection's usage report contains quota windows
- **THEN** its collapsed row shows the status and a quota summary
- **AND** after expanding the row each window is shown with its label, used percent and reset time

#### Scenario: Connection with status only
- **WHEN** a connection's usage report has no windows
- **THEN** its row shows only its status, and the expanded details show the status and reason

### Requirement: Disabled provider presentation
While a provider is disabled its header SHALL carry a disabled badge, its connection rows SHALL be visually dimmed, and Test, Update models and provider login controls in the expanded details MUST be blocked without sending requests. The connection-level enable switch and edit/remove controls SHALL remain operable, and stored connections and secrets MUST NOT change when the provider is toggled. Blocking in the UI is presentation only; the backend refuses the same operations independently.

#### Scenario: Disabled provider cards
- **WHEN** the owner disables a provider with two connections
- **THEN** both rows stay listed, dimmed under the disabled header, with the connection switches still operable
- **AND** in their expanded details Test, Update models and Login are blocked

#### Scenario: Re-enable restores controls
- **WHEN** the owner re-enables the provider
- **THEN** the badge disappears and the blocked controls work again without any connection change
