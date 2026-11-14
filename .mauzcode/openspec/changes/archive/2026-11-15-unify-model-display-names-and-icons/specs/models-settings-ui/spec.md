## MODIFIED Requirements

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

### Requirement: Per-model enable switches
The connection's model list in the Models tab SHALL show an accessible switch for every model, with vertical spacing between rows, and the model's shared display name next to its id for every provider. Clicking anywhere on a model row MUST toggle its switch. Disabled models MUST stay visible, dimmed and labelled `Disabled`.

#### Scenario: Row click toggles
- **WHEN** the owner clicks the text of a model row
- **THEN** that model's switch changes

#### Scenario: Names for every provider
- **WHEN** a claude connection lists `claude-sonnet-4-5` without a provider label
- **THEN** its row shows "Claude Sonnet 4.5" next to the id, as codex rows show their provider labels
