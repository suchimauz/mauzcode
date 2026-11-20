## MODIFIED Requirements

### Requirement: Add button inside the input
The add-attachment button SHALL be the leading control on the first line of the message input, before the text. Only the first line SHALL leave room for it; wrapped and later lines SHALL use the full text width. It SHALL keep its accessible name, its menu and its disabled state, and on a coarse pointer it SHALL keep a touch target of at least 44 by 44 CSS pixels.

#### Scenario: Open the add menu
- **WHEN** the user activates the add button inside the input
- **THEN** the same add menu opens as before and the draft text and caret are unchanged.

#### Scenario: Long draft wraps under the add button
- **WHEN** the draft wraps to three lines
- **THEN** the add button stays at the start of the first line, and the second and third lines start at the input's left text edge, under the add button.

### Requirement: Metrics row below the controls
Below the input, the composer SHALL show one metrics row: usage at the left (cost, input tokens, output tokens, cache hit) and the context meter at the right (percent, then used and total tokens). Token counts SHALL use compact notation such as `184k` and `9.4k`. Usage and context SHALL be two separate controls, each with its own hover and focus state, and both SHALL open the same context details panel.

#### Scenario: Open details from the metrics row
- **WHEN** the user hovers or activates the usage part, or the context part
- **THEN** the same context details panel opens, only the hovered or activated part is highlighted, and that control reports its expanded state to assistive technology.

#### Scenario: Compact token counts
- **WHEN** the session used 184,220 input and 9,412 output tokens
- **THEN** the row shows `184k` and `9.4k`, and the exact numbers stay available in the accessible names and the details panel.

#### Scenario: Cache hit without a label
- **WHEN** the cache hit ratio is 92%
- **THEN** the usage part shows `92%` without the word "кэш", and its accessible name and tooltip still say that it is the cache hit.

### Requirement: Narrow-width metric priority
The metrics row SHALL never scroll sideways or wrap. As width shrinks it SHALL hide only the used and total tokens of the context meter. The context percent, cost, input and output tokens and cache hit SHALL stay visible down to a 320 CSS pixel composer, on desktop and on touch devices.

#### Scenario: Phone width
- **WHEN** the composer is 375 CSS pixels wide on a touch device
- **THEN** the metrics row shows cost, both token counts and the cache hit at the left and the context percent at the right, on one line, with no horizontal scrolling.

## ADDED Requirements

### Requirement: Input bar with model, voice and send
The message input SHALL end with one bar inside its frame, below the text: the model picker at the left, then the voice controls and the send button at the right. When space is short, the model name SHALL truncate with an ellipsis before any voice control or the send button shrinks or hides. On a coarse pointer every control in the bar SHALL keep a touch target of at least 44 by 44 CSS pixels.

#### Scenario: Desktop input bar
- **WHEN** an editable chat is open on a desktop
- **THEN** the input frame contains the text, and below it, inside the same frame, the model picker on the left and the voice controls followed by send on the right; nothing but the metrics row is shown below the frame.

#### Scenario: Narrow composer
- **WHEN** the composer is 320 CSS pixels wide
- **THEN** the model picker, the voice controls and send stay on one bar line without overlap, and the model label is truncated with an ellipsis.

### Requirement: Empty input area focuses the editor
A primary press on any part of the input frame that is not a control (the gaps and spacer of the input bar, the frame padding) SHALL focus the message editor, keeping its previous caret or, if it had none, placing the caret at the end of the draft. Presses on controls (add, model picker, voice controls, send, attachments) SHALL keep their own behaviour and SHALL NOT move focus to the editor. Secondary-button presses and presses while the input is disabled SHALL do nothing.

#### Scenario: Click between the model and the voice controls
- **WHEN** the editor is not focused and the user clicks the empty space in the input bar
- **THEN** the editor receives focus with the caret at the end of the draft, and typing continues the draft.

#### Scenario: Click on a control in the bar
- **WHEN** the user clicks the model picker in the input bar
- **THEN** the model menu opens as before and the editor does not take focus.

### Requirement: New-session composer matches the chat composer
The new-session composer SHALL use the same input frame and input bar as an existing chat: the add button on the first line, the model picker at the left of the bar and send at its right. Its chip row SHALL stay above the input. Below the input it SHALL show the metrics row with the draft title at the left and an empty context meter at the right.

#### Scenario: Open a new session
- **WHEN** the user opens the new-session composer
- **THEN** the chip row is above the input, the model picker is inside the input's bottom bar, and the row below the input shows the draft title on the left and an empty context meter on the right.

## REMOVED Requirements

### Requirement: Controls row below the input
**Reason**: The model picker and voice controls move into the input bar, so a separate controls row below the input is no longer shown.
**Migration**: See "Input bar with model, voice and send"; the model picker and voice controls keep their behaviour and accessible names in the new bar.
