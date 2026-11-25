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
- **THEN** that connection is reported unavailable and all other connections are still reported

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
