## ADDED Requirements

### Requirement: Antigravity family pools as standard quota accounts
The quota API SHALL return one ordinary quota account per eligible family pool (Gemini, Claude/GPT) of an Antigravity connection, ordered Gemini then Claude. Each SHALL name its connection and family, fill the standard five-hour, weekly and monthly `windows` only from its own family's general readings, and list its other family buckets as additional windows. Labels MUST NOT classify. Settings and sidebar SHALL project the same snapshot.

#### Scenario: Two pools become two standard accounts
- **WHEN** one connection reports Gemini and Claude/GPT five-hour and weekly buckets with different values
- **THEN** the quota API returns two quota accounts for that connection, each with its own five-hour and weekly window and an empty monthly window, and no `families` field

#### Scenario: Consistent readings across surfaces
- **WHEN** the connection reports a Claude/GPT weekly bucket with 25% used and a known reset
- **THEN** the sidebar and Settings show the same 25% used and reset for that pool's weekly period

#### Scenario: Pool severity
- **WHEN** a Claude/GPT five-hour reading exceeds the alert threshold while Gemini is normal
- **THEN** only the Claude/GPT account and its five-hour cell are alert, and the collapsed sidebar indicator reflects alert

#### Scenario: Family-specific extra bucket
- **WHEN** the Gemini group reports a separately identified model-specific weekly bucket besides its general buckets
- **THEN** it is an additional window of the Gemini account only, never a period cell; a bucket of no eligible family is an additional window of no shown pool and stays reachable from the collapsed indicator details

#### Scenario: Pool not eligible
- **WHEN** no enabled catalogue choice belongs to Claude on this connection
- **THEN** only the Gemini account is returned; enabling a Claude model brings the Claude account back even if its quota is unknown, and with neither family eligible the connection keeps its ordinary status account

#### Scenario: Other providers unchanged
- **WHEN** Claude, Codex or another non-Antigravity connection reports usage
- **THEN** its quota account is unchanged

## MODIFIED Requirements

### Requirement: Additional-limit tooltip
Expanded and compact quota views SHALL expose additional limits in accessible details with names, measurements, resets and explicit unknowns. Cards SHALL keep their additional-limit indicator without adding matrix columns, and omit it when no extra limits exist. Antigravity pool cards follow the same rule as every other card. Labels MUST render as text, not HTML.

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
- **THEN** the tooltip lists those measurements instead of reporting that quota is unmeasured, and the card keeps its normal empty main columns

#### Scenario: Partial snapshot freshness
- **WHEN** additional limits predate a general-window header refresh
- **THEN** the UI does not present their observation time as the time of that header refresh

### Requirement: Adjacent Antigravity sidebar cards
The sidebar SHALL show the Antigravity pool accounts of a connection as adjacent standard quota cards, Gemini then Claude. Each SHALL use the same icon, additional-limit indicator, five-hour, weekly and monthly cells, severity, `—` for unmeasured values, tooltip and compact-rail row as any other provider. Only the card's caption SHALL differ: the family title followed by the account name, e.g. `Gemini · work`. Other providers' cards SHALL remain unchanged.

#### Scenario: At-a-glance family readings
- **WHEN** two pools report different five-hour and weekly measurements but no monthly measurement
- **THEN** both cards show their own two used percentages and a dash for month in standard order, captioned `Gemini · <account>` and `Claude · <account>`
- **AND** the pair stays together when the grid wraps and remains distinguishable from another connection

#### Scenario: Family absent or fully disabled
- **WHEN** no enabled catalogue choice belongs to Claude on this connection
- **THEN** only the Gemini card is shown; enabling a Claude model makes its card appear again, even if its quota is unknown, and when neither family is eligible the ordinary status card remains

#### Scenario: Expanded mobile and compact rail
- **WHEN** the user expands mobile usage or opens its collapsed rail indicator
- **THEN** expanded mobile shows the same cards, and compact details list each pool as an ordinary row with its caption and period cells

#### Scenario: Keyboard, pointer and shared accounts
- **WHEN** the user focuses, hovers or activates an Antigravity pool card
- **THEN** its tooltip has the same structure, period names and wording as another provider's card, with provider, account and family identifiable and no separate pool line or "использовано" period suffix
- **AND** activation opens that connection's usage with the matching pool section in view; visible focus, Escape dismissal and non-colour identification remain available

#### Scenario: Additional family-specific bucket
- **WHEN** the connection reports a separately identified bucket in the Gemini group, such as a model-specific weekly limit
- **THEN** the Gemini card shows it through the standard `+N` indicator and tooltip additional limits, never in a period cell

## REMOVED Requirements

### Requirement: Antigravity family quota data on one account
**Reason**: Replaced by one standard quota account per family pool, so Antigravity uses the shared quota presentation instead of family-specific cards.
**Migration**: Consumers read the per-pool accounts' standard `windows` and family name; the `families` field and family readings in `additionalWindows` are no longer returned. See "Antigravity family pools as standard quota accounts".
