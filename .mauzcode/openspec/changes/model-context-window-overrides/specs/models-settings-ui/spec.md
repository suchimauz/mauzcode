## ADDED Requirements

### Requirement: Per-model context limit editor
Each listed model SHALL show its effective token limit and source (owner, provider or fallback), with a labelled numeric field, explicit Save, Reset to default and draft discard actions. Edits SHALL remain local until saved; reset SHALL remove the override on save. Controls SHALL support keyboard access, themes and reduced motion. The UI SHALL explain that this local budget setting cannot increase provider capacity.

#### Scenario: Display automatic fallback
- **WHEN** a model has neither provider context metadata nor an owner override
- **THEN** its row shows 200,000 tokens with a fallback source and an empty override field

#### Scenario: Save a custom limit
- **WHEN** the owner enters 128000 and explicitly saves the context setting
- **THEN** the stored effective limit is shown as 128,000 tokens with an owner source
- **AND** no availability setting is changed by this action

#### Scenario: Reset versus discard
- **GIVEN** the stored owner override is 128000
- **WHEN** the owner selects Reset to default and then discards the draft
- **THEN** the stored override remains 128000
- **WHEN** the owner selects Reset to default and saves
- **THEN** the override is removed and the latest provider or fallback value is displayed

#### Scenario: Invalid or failed save
- **WHEN** the field is invalid or a save fails
- **THEN** an accessible error is displayed, the draft remains editable and the stored effective value is not misrepresented as changed

### Requirement: Context drafts survive catalogue operations
Refreshing a catalogue MUST NOT silently discard unsaved context-limit drafts. The UI SHALL retain drafts independently of refreshed rows, including drafts for temporarily absent models, and offer an explicit discard action. Stored limits and unsaved draft values MUST be distinguishable.

#### Scenario: Refresh with a draft
- **WHEN** an owner refreshes models while a context-limit draft exists
- **THEN** the draft remains available and the refreshed provider default does not overwrite it

## MODIFIED Requirements

### Requirement: Per-model enable switches
The connection's model list in the Models tab SHALL show an accessible switch for every model, with vertical spacing between rows, and the model's shared display name next to its id for every provider. Clicking the model's availability label area SHALL toggle its switch. Independent controls, including context-limit fields and actions, MUST NOT toggle availability. Disabled models MUST stay visible, dimmed and labelled `Disabled`.

#### Scenario: Row click toggles
- **WHEN** the owner clicks the model text in its availability label area
- **THEN** that model's switch changes

#### Scenario: Names for every provider
- **WHEN** a claude connection lists `claude-sonnet-4-5` without a provider label
- **THEN** its row shows "Claude Sonnet 4.5" next to the id, as codex rows show their provider labels

#### Scenario: Editing context does not toggle availability
- **WHEN** the owner focuses a context field, types a value or activates its save or reset action
- **THEN** the model's availability switch and its draft state are unchanged
