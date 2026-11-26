## MODIFIED Requirements

### Requirement: Aggregated usage view
The system SHALL report usage for every enabled model connection, including quota windows or balance when the provider reports them and status only otherwise. It MUST classify each window as normal, warning, critical or alert using the `models.usageWarnPercent`, `models.usageCriticalPercent` and `models.usageAlertPercent` settings (defaults 30, 60 and 75). One failing connection MUST NOT hide the others.

#### Scenario: Window above alert threshold
- **WHEN** a codex connection reports a window at 80 % used
- **THEN** the usage view marks that window as alert

#### Scenario: One connection fails
- **WHEN** one connection's usage request fails
- **THEN** that connection is unavailable unless its policy retains a prior successful observation as explicitly stale; all other connections are still reported

#### Scenario: Quota endpoint keeps its shape
- **WHEN** the UI requests `/api/v1/quotas`
- **THEN** it receives `{ updatedAt, accounts }` built from model connections and their usage, with no legacy `llms` call

### Requirement: Antigravity family quota data on one account
The quota API SHALL keep one account per Antigravity connection. Each family period SHALL retain its bucket identity, structured group, period, observation time, known usage and reset. A family limit MUST NOT fill an account-wide period cell. Settings and sidebar SHALL project the same snapshot without classifying labels or starting an additional provider probe merely to open details.

#### Scenario: Two families are not two accounts
- **WHEN** one connection reports identical five-hour values and resets for Gemini and Claude
- **THEN** one account contains two distinguishable family five-hour readings, not two accounts or an account-wide limit; translated display names do not change classification

#### Scenario: Consistent readings across surfaces
- **WHEN** the connection reports a Claude/GPT weekly bucket with 25% used and a known reset
- **THEN** the sidebar and Settings show the same 25% used, reset and last-success time for that family and period, with details identifying the shared Claude/GPT pool

#### Scenario: Family severity reaches the account
- **WHEN** a Claude/GPT five-hour reading exceeds the alert threshold while the account-wide periods are normal or unmeasured
- **THEN** that family cell is marked alert, the account's aggregate severity and the collapsed sidebar indicator reflect alert, and the reading does not fill an account-wide period cell

### Requirement: Adjacent Antigravity sidebar cards
The sidebar SHALL show adjacent Gemini then Claude cards for eligible families of a connection. Each SHALL display the provider icon and family, omit the visible provider name from the card face, and use the standard five-hour, weekly and monthly used-percentage cells. Each cell SHALL use its own severity and show `—` for an unmeasured percentage. Account and provider identity MUST remain accessible. Other providers' cards SHALL remain unchanged.

#### Scenario: At-a-glance family readings
- **WHEN** two families report different five-hour and weekly measurements but no monthly measurement
- **THEN** both cards show their own two used percentages and a dash for month, in standard order; neither shows the old single remaining figure or the word Antigravity on its face
- **AND** the pair stays together when the grid wraps and remains distinguishable from another connection

#### Scenario: Family absent or fully disabled
- **WHEN** no enabled catalogue choice belongs to Claude on this connection
- **THEN** only eligible families are shown; enabling a Claude model makes its card eligible again, even if its quota is unknown, and when neither family is eligible the ordinary status card remains

#### Scenario: Expanded mobile and compact rail
- **WHEN** the user expands mobile usage or opens its collapsed rail indicator
- **THEN** expanded mobile shows the same cards, and compact details identify each visible family and its separate periods without requiring hover

#### Scenario: Keyboard, pointer and shared accounts
- **WHEN** the user focuses, hovers or activates a card
- **THEN** details identify its provider, account and family, each period's used percent, local reset time or explicit unknown, last successful check and stale status when applicable
- **AND** activation opens the matching settings detail; visible focus, Escape dismissal and non-colour identification remain available

#### Scenario: Additional family-specific bucket
- **WHEN** the connection reports a separately identified bucket in the Gemini group, such as a model-specific weekly limit, alongside the general Gemini buckets
- **THEN** it is listed with its own name, period, used percent and reset in the Gemini card details and in the collapsed indicator details, never in a Gemini period cell
- **AND** an identifiable bucket whose group matches no eligible family appears only in the collapsed indicator details as an additional limit of the account

## REMOVED Requirements

### Requirement: Antigravity remaining range and incomplete measurements
**Reason**: A range across per-model inventory readings cannot describe two separately measured limits.
**Migration**: Replace the single remaining figure and range with independent measured period cells; retain unknown values and keep additional independent buckets distinct in details.

## ADDED Requirements

### Requirement: Freshness of visible Antigravity quota
While quota is visible, the system SHALL refresh it at a one-minute cadence and coalesce concurrent consumers per connection. Returning to a visible tab SHALL immediately recheck an expired observation. A failed read SHALL NOT advance the last-success time: a previous observation for the same account is stale, or quota is unavailable if none exists. Other providers' refresh policies MUST remain unchanged.

#### Scenario: Two visible consumers and a changing window
- **WHEN** the sidebar and Settings are visible and a minute elapses after a successful observation
- **THEN** at most one upstream summary probe is in flight per connection and both consumers show its new values without a reload or a three-minute wait

#### Scenario: Pause and return
- **WHEN** the tab stays hidden for several intervals and then becomes visible
- **THEN** it sends no periodic background polls and requests one refresh on return if its observation has expired; a still-fresh result does not require another probe

#### Scenario: Failure, partial success and recovery
- **WHEN** a read after a successful snapshot fails
- **THEN** both views show the prior measurements marked stale with the original success time; a first failure without a snapshot instead shows no data
- **AND** the next success clears stale status, advances the observation time and replaces the previous snapshot, including clearing a now-missing weekly bucket instead of displaying its old value as fresh

### Requirement: Visible Antigravity quota changes within one interval
A visible quota poll MUST NOT be answered from a provider observation that expires before the next poll. A change in the reported summary SHALL become visible on every visible quota surface within one minute plus the probe duration.

#### Scenario: Change just after an observation
- **WHEN** the reported summary changes just after a successful observation while the sidebar and Settings are visible
- **THEN** both show the new value no later than one minute plus the probe duration after the change, not after two intervals
