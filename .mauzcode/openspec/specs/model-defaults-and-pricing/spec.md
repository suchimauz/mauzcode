# model-defaults-and-pricing Specification

## Purpose
Provide model selection for callers that name no model, the background localization model, public token price estimates for model routes, and an aggregated usage view with alert thresholds over all model connections.

## Requirements

### Requirement: Model selection without a default setting
There SHALL be no default-model setting. When an agent is created or a one-shot caller runs without a model, the system MUST use the last used model when it resolves, otherwise the first enabled model of the earliest enabled connection whose provider is not globally disabled, and otherwise fail with `NO_MODEL`. The legacy `llm.defaultModel` setting and the `MODEL` environment variable MUST NOT be read.

#### Scenario: Create agent without a model
- **GIVEN** the last used model is `codex/su4imauz:gpt-6-astra` and it resolves
- **WHEN** an agent is created without a model
- **THEN** the agent's model is `codex/su4imauz:gpt-6-astra`

#### Scenario: Last used model no longer resolves
- **GIVEN** the last used model names a removed connection
- **WHEN** an agent is created without a model
- **THEN** it gets the first enabled model of the earliest enabled connection whose provider is not disabled

#### Scenario: Last used model of a disabled provider
- **GIVEN** the last used model belongs to a globally disabled provider
- **WHEN** an agent is created without a model
- **THEN** selection skips it and uses the first enabled model of the earliest enabled connection of an enabled provider

#### Scenario: No usable model
- **GIVEN** no enabled connection of an enabled provider has an enabled model
- **WHEN** an agent is created without a model
- **THEN** creation fails with `NO_MODEL` and no agent is stored

### Requirement: Localization model setting
A `models.localizationModel` setting SHALL select the model route used to generate multilingual retrieval text for documentation and plugins. A value that is not a valid route MUST be rejected when set. When it is empty, the model chosen by the selection rule above MUST be used.

#### Scenario: Invalid localization model
- **WHEN** the owner sets `models.localizationModel` to `claude-code:claude-opus-5`
- **THEN** the setting is rejected with a validation error

#### Scenario: Empty localization model
- **WHEN** localization runs with `models.localizationModel` empty
- **THEN** it calls the model chosen without a default setting

### Requirement: Token price lookup
The system SHALL return public pay-as-you-go prices per million tokens (input, output, cache read, cache write, USD) for model routes, keyed by route. It matches the model id against a public price catalogue under the price vendor declared by the route's provider. When the provider declares no price vendor, or the model is absent from that vendor's catalogue, the route MUST map to null (shown as unknown) without failing the lookup; prices MUST NOT be borrowed from other vendors.

#### Scenario: Known claude model
- **WHEN** prices are requested for `claude/2yfl55fsh:claude-opus-5-5`
- **THEN** the result contains Anthropic's public prices for that model

#### Scenario: Unknown model
- **WHEN** prices are requested for a model absent from the catalogue
- **THEN** that route maps to null and other routes are still priced

#### Scenario: Provider without a price vendor
- **WHEN** prices are requested for a route on a `custom` connection
- **THEN** that route maps to null even if another vendor lists the same model id

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

### Requirement: Provider icons from declarations
Provider marks shown in the UI SHALL come from the shared model mark resolver: the provider's brand mark when MauzCode has one, otherwise the generic plug icon for custom providers, otherwise the icon declared by the registered model provider. No hard-coded list of legacy provider ids MUST be used to decide which providers are listed.

#### Scenario: Icons for registered providers
- **WHEN** the UI requests provider icons
- **THEN** it receives a mark for each registered model provider (claude → Anthropic, codex → OpenAI, custom → plug) and none for legacy-only providers

### Requirement: Structured quota classification
Usage reports and the quota API SHALL preserve window identity, scope, known period and available measurements independently of display labels. Only unambiguous account-wide standard-period windows SHALL populate the five-hour, weekly and monthly columns. Model-specific, unknown-period, unknown-scope and conflicting windows SHALL remain additional limits. A display-label prefix MUST NOT establish classification.

#### Scenario: Codex weekly primary reaches the correct column
- **WHEN** a Codex primary window is identified from its duration as account-wide weekly usage
- **THEN** the weekly column shows its value and the five-hour column remains empty unless a separate five-hour window exists

#### Scenario: Additional windows share a standard period
- **WHEN** a report contains account-wide weekly usage and a model-specific weekly restriction
- **THEN** only the account-wide value populates the weekly column and the model restriction remains additional

#### Scenario: No identity-safe winner
- **WHEN** multiple distinct account-wide windows claim the same standard period without an authoritative distinction
- **THEN** the column is left empty and all conflicting windows remain additional rather than silently selecting the first or largest value

#### Scenario: Legacy label has no period evidence
- **WHEN** a provider supplies only a label such as `Session (7d)` without structured classification
- **THEN** the window remains additional and is not mapped by its label prefix

#### Scenario: Metadata survives core normalization
- **WHEN** a provider adapter returns windows with identity, period, scope and observation metadata
- **THEN** the normalized connection usage and its cached result preserve valid metadata
- **AND** an invalid metadata field is dropped without discarding the window's measurements

#### Scenario: Additional limits from any provider
- **WHEN** any provider reports valid windows beyond its account-wide standard periods
- **THEN** those windows are retained as additional limits with stable identities

#### Scenario: Existing providers remain supported
- **WHEN** supported providers report their established general five-hour, weekly or monthly limits
- **THEN** their adapters supply explicit classification and those limits remain in the corresponding existing columns

### Requirement: Additional quota API data
The quota endpoint SHALL retain its `{ updatedAt, accounts }` envelope and existing main-window fields, adding a separate collection for additional windows. Each additional window SHALL expose a stable identity, readable label, available usage/reset information and severity. Missing values MUST remain unknown, not zero. Accounts with only additional windows SHALL remain quota accounts; status-only and balance-only behavior MUST remain unchanged.

#### Scenario: Additional-only account
- **WHEN** an account reports valid additional windows but no mappable general windows
- **THEN** its main columns are empty and its additional windows are returned as quota data rather than discarded or described as unmeasured

#### Scenario: Severity includes extra restrictions
- **WHEN** an additional window exceeds the configured alert threshold
- **THEN** it has alert severity and participates in existing aggregate account severity without replacing any main-column value

#### Scenario: Unknown measurement
- **WHEN** a retained window has a known remaining amount but no used percentage or reset timestamp
- **THEN** those missing values remain unknown and the available remaining amount is preserved

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
