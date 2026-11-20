# chat-composer-layout Specification

## Purpose
Defines how the composer of an existing chat arranges its controls and usage metrics so that they stay readable and reachable on phones and narrow desktop windows.

## Requirements

### Requirement: Status row above the input
The composer of an existing chat SHALL show a status row directly above the message input. Active mode indicators, such as the planning badge, SHALL sit at its left edge and the pet mascot at its right edge. When no mode is active, the row SHALL show only the mascot and SHALL NOT add height beyond the mascot.

#### Scenario: Planning mode is active
- **WHEN** the chat is in planning mode
- **THEN** the planning badge appears at the left of the row above the input, the mascot stays at its right, and the badge no longer appears below the input.

#### Scenario: No active mode
- **WHEN** no mode indicator is active
- **THEN** the status row holds only the mascot and the composer keeps the height it has with the mascot alone.

### Requirement: Add button inside the input
The add-attachment button SHALL be the leading control inside the message input, before the text. It SHALL keep its accessible name, its menu and its disabled state, and on a coarse pointer it SHALL keep a touch target of at least 44 by 44 CSS pixels.

#### Scenario: Open the add menu
- **WHEN** the user activates the add button inside the input
- **THEN** the same add menu opens as before and the draft text and caret are unchanged.

### Requirement: Controls row below the input
Directly below the input, the composer SHALL show one controls row with the model picker at its left edge and the voice controls at its right edge. When space is short, the model name SHALL truncate with an ellipsis before any voice control shrinks or hides.

#### Scenario: Narrow composer
- **WHEN** the composer is 320 CSS pixels wide
- **THEN** the model picker and all voice controls stay on one row without overlap, and the model label is truncated with an ellipsis.

### Requirement: Metrics row below the controls
Below the controls row, the composer SHALL show one metrics row: the context meter (percent, then used and total tokens) at the left; cost, input tokens, output tokens and cache hit at the right. Token counts SHALL use compact notation such as `184k` and `9.4k`. The whole row SHALL be one control that opens the context details panel.

#### Scenario: Open details from the metrics row
- **WHEN** the user activates the metrics row
- **THEN** the context details panel opens and the row reports its expanded state to assistive technology.

#### Scenario: Compact token counts
- **WHEN** the session used 184,220 input and 9,412 output tokens
- **THEN** the row shows `184k` and `9.4k`, and the exact numbers stay available in the accessible name and the details panel.

### Requirement: Narrow-width metric priority
The metrics row SHALL never scroll sideways or wrap. As width shrinks it SHALL hide, in this order, the cache hit and then the used and total tokens of the context meter. The context percent, cost and input and output tokens SHALL stay visible down to a 320 CSS pixel composer.

#### Scenario: Phone width
- **WHEN** the composer is 375 CSS pixels wide
- **THEN** the metrics row shows the context percent, cost and both token counts on one line, with no horizontal scrolling.
