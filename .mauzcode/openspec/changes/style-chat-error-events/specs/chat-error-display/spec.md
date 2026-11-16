## Purpose

Defines how failed-run error events appear in the chat transcript so that errors are recognizable, readable and consistent with the rest of the chat design.

## ADDED Requirements

### Requirement: Error events render as a dedicated error row
The chat transcript SHALL render each `error` event as a compact error row that is visually distinct from assistant answers and uses the theme's error color tokens in light and dark themes.

#### Scenario: Provider connection disabled
- **WHEN** the transcript contains an error event with text `Connection Asoft LLM Gate is disabled`
- **THEN** it is shown as an error row with an error icon and that text
- **AND** it is not rendered as an assistant message bubble

### Requirement: Long error text is collapsible
The error row SHALL show only the first line of the error text by default and SHALL let the person expand and collapse the full text with a keyboard-accessible control.

#### Scenario: Multi-line stack trace
- **WHEN** an error event text contains several lines
- **THEN** the row shows the first line and a disclosure control
- **AND** activating the control reveals the full text, preserving line breaks

#### Scenario: Single-line error
- **WHEN** the error text is a single short line
- **THEN** no disclosure control is shown

### Requirement: Error text can be copied
The error row SHALL provide a copy action that copies the full error text to the clipboard and reports success or failure.

#### Scenario: Copy succeeds
- **WHEN** the person activates the copy action
- **THEN** the full error text is written to the clipboard and the action shows a copied state

### Requirement: Error rows are announced accessibly
The most recent error row in the transcript SHALL be exposed to assistive technology as an alert, while older error rows SHALL NOT be re-announced.

#### Scenario: New error arrives
- **WHEN** a run fails and a new error event is appended
- **THEN** screen readers announce its text once

### Requirement: User stops are not shown as failures
An error event whose text indicates that the run was stopped by the user SHALL be rendered as a neutral notice, not as an error row.

#### Scenario: Stopped by user
- **WHEN** an error event text starts with `stopped by user`
- **THEN** it is shown as a neutral transcript notice without error coloring
