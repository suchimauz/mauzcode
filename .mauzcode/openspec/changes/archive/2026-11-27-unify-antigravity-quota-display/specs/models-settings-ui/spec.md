## ADDED Requirements

### Requirement: Antigravity usage uses the standard window list
The expanded usage of an Antigravity connection SHALL show one section per eligible family pool, Gemini then Claude/GPT, titled by the family. Each section SHALL render the pool's windows with the same window list, period names, meter and `N% used · resets …` format as other providers, with explicit unknowns. A section MUST NOT add a pool caption or a persistent highlight. The collapsed row summary SHALL use the standard window wording.

#### Scenario: Two standard sections
- **WHEN** the owner expands an Antigravity connection with Gemini and Claude/GPT five-hour and weekly readings
- **THEN** two sections titled Gemini and Claude/GPT each list their windows exactly as a Claude or Codex connection lists its windows, with the same period names and value format

#### Scenario: Opened from a sidebar pool card
- **WHEN** the owner activates the Claude sidebar card of that connection
- **THEN** Settings scrolls the Claude/GPT section into view and moves focus to it without leaving a highlight once focus moves elsewhere

#### Scenario: Unknown value
- **WHEN** a pool's weekly window has a reset but no used percentage
- **THEN** that row shows the standard unknown value and its reset, never 0% or 100%
