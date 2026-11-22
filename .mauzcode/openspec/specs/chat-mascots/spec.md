# chat-mascots Specification

## Purpose
Defines which pets a chat can have, how a pet is assigned to a chat and kept, and how the pet's animation shows what the agent is doing.

## Requirements

### Requirement: Mascot catalogue
The system SHALL offer exactly these mascots: `crab`, `deepy`, `whalegirl`, `dundun`, `tabby`, `shiba`, `maneki`, `daruma`, `tuerye`, `calico`, `cloudling`, `clawd` and `claude`. It MUST NOT offer `desksprite`, `bitty`, `tmuxai`, `planet` or `rainbow-terminal-cat`.

#### Scenario: Picker lists the catalogue
- **WHEN** the person activates the mascot of a new session
- **THEN** a menu opens showing "Random" followed by the 13 mascots and none of the removed pets

#### Scenario: Removed pet is rejected
- **WHEN** a client submits a new session with `mascot: "bitty"`
- **THEN** the server answers HTTP 400 and creates no session

### Requirement: Persistent mascot assignment
Every chat SHALL have one mascot from the catalogue, stored with the agent. A new chat without an explicit choice, or with "random", SHALL get a uniformly random mascot. Saving, renaming, reloading and forking MUST NOT change an existing chat's mascot. The stored value MUST be one of the catalogue values.

#### Scenario: Random assignment
- **WHEN** many chats are created without a mascot choice
- **THEN** each gets a catalogue mascot and all 13 occur

#### Scenario: Invalid stored value
- **WHEN** something tries to store a mascot outside the catalogue
- **THEN** the database rejects the write

### Requirement: Removed pets are replaced
A chat whose stored mascot is a removed pet SHALL be reassigned once to a random catalogue mascot. Chats with a catalogue mascot MUST keep theirs.

#### Scenario: Upgrade with a removed pet
- **WHEN** the schema upgrade runs and a chat has `desksprite`
- **THEN** the chat gets a catalogue mascot, and a chat with `deepy` still has `deepy`

#### Scenario: Repeated upgrade
- **WHEN** the upgrade runs a second time
- **THEN** no mascot changes

### Requirement: Activity-driven animation
The mascot SHALL show a distinct animation for each kind of agent activity its artwork provides: idle, thinking, running a command, editing files, reading, searching, browsing, delegating, planning, compacting, finishing, error and sleeping. An activity that a pet has no artwork for MUST fall back to that pet's closest general working or idle animation.

#### Scenario: Running a shell command
- **WHEN** the agent's active tool is `bash`
- **THEN** a Tokibean pet shows its command animation and Calico shows its building animation

#### Scenario: Thinking
- **WHEN** the agent is thinking with no active tool
- **THEN** the mascot shows its thinking animation

#### Scenario: Activity without artwork
- **WHEN** Calico's agent is browsing the web
- **THEN** Calico shows its general working animation instead of an empty frame

### Requirement: Run outcome reaction
When a run ends, the mascot SHALL briefly show a done reaction, or an error reaction if the run failed, and then return to idle. After a long idle period it SHALL show its sleeping animation, if it has one, until activity resumes or the person interacts with it.

#### Scenario: Successful run ends
- **WHEN** a running chat stops without an error
- **THEN** the mascot shows its done animation for a few seconds and then its idle animation

#### Scenario: Failed run ends
- **WHEN** a running chat stops with an error
- **THEN** the mascot shows its error animation

### Requirement: Local, inert mascot artwork
Mascot artwork and renderers SHALL be served from the MauzCode bundle with no network requests. Image-based mascots MUST be shown as images, so scripts embedded in artwork never run.

#### Scenario: Offline rendering
- **WHEN** the browser has no internet access
- **THEN** every mascot still renders

### Requirement: Reduced motion
When the person prefers reduced motion, the mascot SHALL show a still picture and SHALL NOT play looping animations.

#### Scenario: Reduced motion is on
- **WHEN** `prefers-reduced-motion: reduce` matches
- **THEN** the mascot shows one still frame

### Requirement: Mascot interaction
In an existing chat the mascot SHALL offer a keyboard-reachable control that plays a short reaction while the chat is idle. The control MUST be disabled while the agent runs. The artwork itself SHALL be hidden from assistive technology.

#### Scenario: Keyboard poke
- **WHEN** the person focuses the mascot control in an idle chat and presses Enter
- **THEN** the mascot plays a reaction and then returns to idle

#### Scenario: Poke disabled while running
- **WHEN** the agent of an existing chat is running
- **THEN** the mascot control is disabled

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
