## Purpose
Defines how the chat message editor handles line breaks, the visible caret and clearing the draft, so typing behaves the same on desktop browsers and touch keyboards.

## ADDED Requirements

### Requirement: Caret moves to a new line immediately
When the user inserts a line break, the visible caret SHALL appear at the start of the new line at once, without waiting for further input. This SHALL hold at the end of the draft, in the middle of the text and in an empty draft, and the input SHALL grow to show the new line.

#### Scenario: Shift+Enter at the end of the draft
- **WHEN** the draft is `hello` with the caret at its end and the user presses Shift+Enter
- **THEN** the input grows by one line and the visible caret is at the start of the second line before any other key is pressed.

#### Scenario: Shift+Enter in an empty draft
- **WHEN** the draft is empty and the user presses Shift+Enter
- **THEN** the visible caret is on the second line immediately.

#### Scenario: Line break in the middle
- **WHEN** the caret is between `hello` and `world` and the user presses Shift+Enter
- **THEN** `world` moves to the second line and the visible caret is before `world`.

### Requirement: Line breaks from touch keyboards
A line break entered from an on-screen keyboard SHALL insert exactly one newline into the draft and SHALL be visible immediately, with the caret on the new line. Enter on a touch device SHALL insert a line break and SHALL NOT send.

#### Scenario: Return key on a phone keyboard
- **WHEN** the user types `hi` on a phone and taps the keyboard's return key
- **THEN** the draft becomes `hi` followed by one newline, the second line is visible and the caret is on it before any further typing.

### Requirement: Clearing the draft leaves it empty
Removing all draft content SHALL leave an empty draft: no leftover empty line, the placeholder visible, the input at its one-line height, and nothing sendable.

#### Scenario: Select all and delete a multi-line draft
- **WHEN** the draft has several lines and the user presses Ctrl+A (Cmd+A) and then Backspace or Delete
- **THEN** the draft is empty, the placeholder is shown, the input is one line high and the send button is disabled.

#### Scenario: Select all and delete a draft ending with a newline
- **WHEN** the draft ends with a line break and the user selects all and deletes
- **THEN** the result is the same empty draft, with no extra empty line to remove.
