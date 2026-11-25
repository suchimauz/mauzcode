# Spec Delta

## ADDED Requirements

### Requirement: Antigravity family quota data on one account
The usage report and quota API SHALL keep one account per Antigravity connection. Its additional limits SHALL identify the family (`gemini` or `claude`) structurally and preserve the native model, measured usage, observation time and reset when known. Family limits MUST NOT fill account-wide period columns. Settings and sidebar details SHALL describe the same usage snapshot; neither may classify a limit by parsing a label.

#### Scenario: Two families are not two accounts
- **WHEN** one connection reports an equal remaining percentage and reset for Gemini and Claude
- **THEN** the quota API returns one account with distinguishable family measurements and no invented five-hour, weekly or monthly window
- **AND** the two families remain distinct even if a model has no display label or the label changes language

#### Scenario: Consistent readings across surfaces
- **WHEN** an observation represents 25% used, with a known reset, and both views read the same snapshot
- **THEN** the sidebar shows 75% remaining and settings shows the equivalent measurement for the same family, models, observation and reset; opening details does not start a separate provider probe

### Requirement: Adjacent Antigravity sidebar cards
The expanded sidebar grid SHALL place adjacent cards for an Antigravity connection, Gemini then Claude, one per family with at least one model not disabled by the owner, identified as Antigravity of the same account. Each card SHALL label its figure as remaining and show a percentage, range or unknown state without hover; period placeholders or an extra-limit count MUST NOT replace it. Other providers keep their existing cards.

#### Scenario: At-a-glance family readings
- **WHEN** Gemini has 75% remaining and Claude has 100% remaining on one connection
- **THEN** two neighboring cards show Antigravity Gemini, 75% remaining, and Antigravity Claude, 100% remaining, without opening details
- **AND** the pair stays together when the grid wraps, while a neighboring provider can still show its normal period-based used percentages

#### Scenario: Family absent or fully disabled
- **WHEN** the account advertises no Claude models, or the owner has disabled every Claude model on the connection
- **THEN** only the Gemini card is shown, with no Claude card or `no data` placeholder; re-enabling a Claude model or a refresh that adds one shows the Claude card again
- **AND** when neither family is shown the connection keeps its ordinary status card

#### Scenario: Expanded mobile and compact rail
- **WHEN** a phone user expands the sidebar usage section
- **THEN** the same two cards and values are visible without hover, and tapping either gives access to its details
- **AND** in the narrow collapsed rail the shared indicator remains, with accessible details naming each shown family and its remaining value

#### Scenario: Keyboard, pointer and shared accounts
- **WHEN** a user hovers, focuses with the keyboard or activates either family card
- **THEN** details identify the parent account, family, contributing models, known remaining values and reset times in local time; unknown fields are identified explicitly
- **AND** thresholds use the existing used-percentage severity of that family's worst measured member; the label and number remain understandable without color, Escape dismisses the tooltip and keyboard focus remains visible

### Requirement: Antigravity remaining range and incomplete measurements
Within one connection and family, the card SHALL show a single remaining percentage when known fractions agree, otherwise the minimum-to-maximum remaining range. Details SHALL combine models into one row only when both known fraction and reset match; distinct resets or amounts MUST remain distinguishable. No row implies a shared pool. Missing measurements SHALL be identified as unknown or partial, never averaged or treated as zero.

#### Scenario: Same reading and reset
- **WHEN** three Gemini variants report the same fraction and reset
- **THEN** one detail row shows their common remaining percentage and reset and identifies all contributing models; it does not assert an independent or shared quota pool

#### Scenario: Different readings or different resets
- **WHEN** two Gemini models have 40% and 85% remaining
- **THEN** the Gemini card shows a 40–85% remaining range, not an average, and details associate each value and reset with its model
- **AND** if both later report 40% but different resets the card shows one 40% figure and details still show the two reset times separately

#### Scenario: Unknown is not an exhausted limit
- **WHEN** one family has an explicitly zero remaining fraction and the other has no usable fraction
- **THEN** its two cards distinguish `0% remaining` from `no data`, and a known reset remains visible even without a percentage
- **AND** if only some models have measurements the family card marks its known value or range as partial and details identify which readings are missing

## MODIFIED Requirements

### Requirement: Additional-limit tooltip
Expanded and compact quota views SHALL expose additional limits in accessible details with names, measurements, resets and explicit unknowns. Ordinary cards SHALL keep their additional-limit indicator without adding matrix columns, and omit it when no extra limits exist. For Antigravity, the family cards themselves SHALL expose the readings instead of a count; its collapsed indicator SHALL provide access to both. Labels MUST render as text, not HTML.

#### Scenario: Additional Claude restrictions
- **WHEN** a Claude subscription account includes model-specific limits
- **THEN** a compact additional-limits indicator is visible and the tooltip lists each restriction separately from general limits
- **AND** the main matrix remains five-hour, weekly and monthly for that account

#### Scenario: Keyboard and pointer access
- **WHEN** a user hovers or focuses the quota trigger in either expanded or compact mode
- **THEN** the same additional-limit information is available visually and to assistive technology
- **AND** Escape dismisses the tooltip, visible keyboard focus remains, and existing click/navigation behavior for ordinary cards is preserved

#### Scenario: Readable long tooltip
- **WHEN** additional-limit names are long or several additional windows exist
- **THEN** their content remains readable and reachable without viewport clipping, and moving the pointer into the tooltip does not immediately dismiss it
- **AND** existing themes and reduced-motion behavior are respected

#### Scenario: Additional-only tooltip
- **WHEN** an account has only additional windows
- **THEN** the tooltip lists those measurements instead of reporting that quota is unmeasured; ordinary cards retain their normal empty main columns, while Antigravity cards show their family readings

#### Scenario: Partial snapshot freshness
- **WHEN** additional limits predate a general-window header refresh
- **THEN** the UI does not present their observation time as the time of that header refresh
