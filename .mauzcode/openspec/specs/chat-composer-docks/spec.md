# chat-composer-docks Specification

## Purpose
Define the shared visual and interaction anatomy of the panels stacked above the chat composer (todos, triggers, goal, message queue and future docks), so the stack reads as one consistent surface without changing what each dock does.

## Requirements

### Requirement: Common dock anatomy

Every dock above the composer SHALL consist of a header row, an optional expanded body below it and an optional notice line. The header row SHALL place, in order: a leading icon, a disclosure chevron when expandable, a summary that fills the remaining width and truncates with an ellipsis, trailing meta and trailing actions. Icons and header text SHALL have one size and style in all docks.

#### Scenario: Headers align across docks
- **WHEN** the todo, trigger, goal and queue docks are shown together
- **THEN** their leading icons, chevrons and title text start at the same horizontal positions and have the same size, and their header rows have the same height

#### Scenario: Touch-sized header
- **WHEN** the docks are shown on a coarse pointer
- **THEN** every header row and header action is at least 44px tall

#### Scenario: Long summary truncates
- **WHEN** a dock's summary text is wider than the available space
- **THEN** it is truncated with an ellipsis on one line and the trailing meta and actions stay visible

### Requirement: Uniform disclosure

An expandable dock SHALL use one header button covering the icon, chevron and summary, with `aria-expanded` and `aria-controls`. The chevron SHALL be the same in every dock, pointing right when collapsed and down when expanded. A dock with forced expansion SHALL show a disabled, expanded disclosure.

#### Scenario: Forced expansion
- **WHEN** two or more messages are queued and one of them is being edited
- **THEN** the queue header shows the expanded chevron and cannot be activated

#### Scenario: Expand with the keyboard
- **WHEN** the person focuses a collapsed dock header and presses Enter or Space
- **THEN** the body appears below the header, the chevron points down and the header reports `aria-expanded="true"`

#### Scenario: Always-open body
- **WHEN** a dock's body is always visible, such as the queue with one message
- **THEN** its header is static and non-interactive, with no chevron and no `aria-expanded`

### Requirement: Header actions

Trailing header actions MUST be siblings of the disclosure button, never nested in it, and MUST NOT collapse the dock. An action whose result is shown in the body (such as editing the goal) MAY expand the dock.

#### Scenario: Action does not toggle
- **WHEN** the person activates the goal's pause button in the goal dock header
- **THEN** the goal action runs and the dock's expanded state is unchanged

#### Scenario: Edit opens the body
- **WHEN** the person activates the goal's edit button while the goal dock is collapsed
- **THEN** the dock expands and shows the goal form

### Requirement: Uniform meta and badges

Trailing counters and status texts SHALL use one secondary text style with tabular numerals. Pill badges (such as the todo "Paused" mark and trigger kind counts) SHALL share one shape, border, padding and text style.

#### Scenario: Badges look the same
- **WHEN** a paused todo list and armed triggers are shown together
- **THEN** the "Paused" badge and the trigger count badges have the same height, radius, border and font

### Requirement: Status indicators

Status colors SHALL come from the existing semantic tokens, and a status shown by color alone MUST also have an accessible name. A status indicator SHALL be a sibling of the disclosure button in the trailing area, referenced by the button with `aria-describedby`; live regions MUST NOT be nested inside the disclosure button.

#### Scenario: Status dot is announced
- **WHEN** the goal dock shows a colored status dot
- **THEN** the dot is outside the header button, assistive technology announces the goal status by name, and the header button's accessible name stays the goal summary

### Requirement: Uniform body rows

Rows in an expanded dock body SHALL share one minimum height, horizontal padding, hairline separator between rows, leading marker alignment with the first text line, and secondary-line style. The body SHALL be separated from the header by a hairline.

#### Scenario: Rows match across docks
- **WHEN** the todo list, trigger list and message queue are expanded
- **THEN** their rows have the same minimum height, padding and separators, and markers line up with the first line of row text

### Requirement: Shared body height

A dock body SHALL scroll vertically inside the dock with one shared maximum height of `min(220px, 30vh)` instead of growing without limit. While a question card is stacked with the docks, every dock body SHALL use the tighter shared cap `min(15dvh, 120px)`, and `10dvh` on viewports up to 650px tall.

#### Scenario: Long body scrolls
- **WHEN** a dock body has more rows than fit in the shared maximum height
- **THEN** the body scrolls inside the dock and the composer input stays in place

#### Scenario: Tighter cap under a question
- **WHEN** a question card is shown and a dock is expanded
- **THEN** the dock body is capped at `min(15dvh, 120px)` and scrolls inside the dock

### Requirement: Uniform notices

Errors and informational notices inside docks SHALL use one notice style at the bottom of the dock with an optional inline text-button action (such as refresh or dismiss). Errors SHALL be announced as alerts and informational notices as status messages.

#### Scenario: Queue and goal errors look the same
- **WHEN** both the queue and the goal dock show a load error with a refresh action
- **THEN** both notices have the same text style, padding and inline action style, and each is announced as an alert

### Requirement: Single-item docks keep the header

A dock that has content SHALL always show its header row, including the message queue with one queued message and the goal dock, so every dock in the stack starts with the same header structure.

#### Scenario: One queued message
- **WHEN** exactly one message is queued
- **THEN** the queue dock shows a static header with the queue icon and a count of one and no chevron, the message row with its actions is visible, and the dock joins the stack as a collapsed dock without the expanded tint or gap

### Requirement: Stacking

Stacked docks SHALL read as one card: only the outer edges are rounded and adjacent docks are joined by a single hairline. A dock expanded through its disclosure (by the person or forced) SHALL stand apart with a tinted surface, its own rounded edges and a gap from its neighbours. Stacking SHALL follow an explicit expanded mark on the dock shell, not any `aria-expanded` inside the dock, so nested disclosures (such as todo details) and always-open bodies do not change the stacking.

#### Scenario: Collapsed stack is one card
- **WHEN** the todo, trigger and goal docks are shown collapsed
- **THEN** they form one rounded card with single hairlines between docks

#### Scenario: Nested disclosure keeps the stack
- **WHEN** a todo's instructions are open inside the todo dock and the person collapses the dock
- **THEN** the todo dock rejoins the stack as a collapsed dock

### Requirement: Presentation guarantees

Unifying the docks MUST NOT remove or rename any existing control, accessible name, live refresh behavior or confirmation, and MUST keep light and dark theme tokens, visible keyboard focus, touch target sizes on coarse pointers and reduced-motion behavior.

#### Scenario: Reduced motion
- **WHEN** the person prefers reduced motion and a goal is active
- **THEN** the active status indicator does not animate
