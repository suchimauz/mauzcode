## ADDED Requirements

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
Expanded and compact quota views SHALL expose additional windows in an accessible tooltip with readable names, available usage, reset information and an explicit indication of unknown values. A visible indicator SHALL communicate that additional limits exist without adding matrix columns. Labels MUST render as text, not HTML. No indicator SHALL be shown when there are no additional windows.

#### Scenario: Additional Claude restrictions
- **WHEN** a Claude account includes model-specific limits
- **THEN** a compact additional-limits indicator is visible and the tooltip lists each restriction separately from the general limits
- **AND** the main matrix remains five-hour, weekly and monthly

#### Scenario: Keyboard and pointer access
- **WHEN** a user hovers or focuses the quota trigger in either expanded or compact mode
- **THEN** the same additional-limit information is available visually and to assistive technology
- **AND** Escape dismisses the tooltip, visible keyboard focus remains, and existing click/navigation behavior is preserved

#### Scenario: Readable long tooltip
- **WHEN** additional-limit names are long or several additional windows exist
- **THEN** their content remains readable and reachable without viewport clipping, and moving the pointer into the tooltip does not immediately dismiss it
- **AND** existing themes and reduced-motion behavior are respected

#### Scenario: Additional-only tooltip
- **WHEN** the account has only additional windows
- **THEN** the tooltip lists them instead of reporting that quota is unmeasured, while all main columns show their normal empty state

#### Scenario: Partial snapshot freshness
- **WHEN** additional limits predate a general-window header refresh
- **THEN** the UI does not present their observation time as the time of that header refresh
