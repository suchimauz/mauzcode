## MODIFIED Requirements

### Requirement: Mascot catalogue
The system SHALL offer exactly these mascots: `crab`, `deepy`, `whalegirl`, `dundun`, `tabby`, `shiba`, `maneki`, `daruma`, `tuerye`, `calico`, `cloudling`, `clawd` and `claude`. It MUST NOT offer `desksprite`, `bitty`, `tmuxai`, `planet` or `rainbow-terminal-cat`.

#### Scenario: Picker lists the catalogue
- **WHEN** the person activates the mascot of a new session
- **THEN** a menu opens showing "Random" followed by the 13 mascots and none of the removed pets

#### Scenario: Removed pet is rejected
- **WHEN** a client submits a new session with `mascot: "bitty"`
- **THEN** the server answers HTTP 400 and creates no session

### Requirement: Mascot interaction
In an existing chat the mascot SHALL offer a keyboard-reachable control that plays a short reaction while the chat is idle. The control MUST be disabled while the agent runs. The artwork itself SHALL be hidden from assistive technology.

#### Scenario: Keyboard poke
- **WHEN** the person focuses the mascot control in an idle chat and presses Enter
- **THEN** the mascot plays a reaction and then returns to idle

#### Scenario: Poke disabled while running
- **WHEN** the agent of an existing chat is running
- **THEN** the mascot control is disabled

## ADDED Requirements

### Requirement: Pet picker on the new-session mascot
The new-session composer SHALL let the person choose the pet by activating the mascot shown above the message input. It MUST NOT show a separate pet chip in the chip row. The mascot control SHALL have an accessible name that includes the current choice, open the pet menu instead of playing a reaction, and show the selected pet right after a choice. "Random" SHALL remain the default choice and the choice SHALL be submitted as before.

#### Scenario: No pet chip
- **WHEN** the new-session composer opens
- **THEN** the chip row shows no pet chip and the mascot is shown above the input

#### Scenario: Choose a pet from the mascot
- **WHEN** the person clicks the mascot and picks "Calico"
- **THEN** the menu closes, the mascot preview shows Calico and the first submit sends `mascot: "calico"`

#### Scenario: Keyboard flow
- **WHEN** the person focuses the mascot, presses Enter, moves to a pet with the arrow keys and presses Enter
- **THEN** the menu closes, the pet is selected and focus returns to the mascot

#### Scenario: Locked while sending
- **WHEN** the first submit is in progress or pending confirmation
- **THEN** the mascot control is disabled and the pet cannot be changed
