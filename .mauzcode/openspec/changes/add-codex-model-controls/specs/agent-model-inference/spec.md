## ADDED Requirements

### Requirement: Route-aware controls in the chat model picker
The chat SHALL offer speed and response verbosity next to model selection only when the selected route advertises an alternative; it MUST distinguish these controls from reasoning and indicate that accelerated tiers may consume additional quota. Choices MUST be keyboard accessible and derived from the cached catalogue without network access. The owner MUST only be able to select currently supported overrides.

#### Scenario: Only actionable choices
- **WHEN** the owner opens the picker for a route with Fast and `max` reasoning but no verbosity support
- **THEN** the chat offers Standard/Fast with a quota notice, lists `max` separately under reasoning, and does not show Ultrafast or a verbosity selector

#### Scenario: Owner chooses the next response's settings
- **WHEN** the owner selects an advertised speed and verbosity for the chat
- **THEN** the next chat model request uses both settings; a request already dispatched is not changed or replayed

### Requirement: Chat-local response preferences
Speed and verbosity SHALL be scoped to chat, connection, authenticated Codex account and native model. Reopening that route SHALL restore valid choices. Logout, account replacement or loss of verified identity MUST invalidate them and visibly report the reset once per affected chat. New chats, forks and children MUST NOT inherit choices. Without a saved choice, speed SHALL be Standard and verbosity model-default.

#### Scenario: Same model name, different account
- **WHEN** a chat using Fast on connection A switches to the same slug on B or a different model on A with no saved choices
- **THEN** it uses defaults; returning to the original route after reload restores Fast if still supported

#### Scenario: Same connection, different subscription
- **GIVEN** a chat selected Fast and high verbosity for account A and the same connection signs into B, which also advertises both choices
- **WHEN** the chat sends its first request for B without making a fresh selection
- **THEN** it sends neither `service_tier` nor `text.verbosity`, even if B's catalogue has already refreshed
- **AND** saving from A's stale picker is rejected; only a new selection for B can enable either override

#### Scenario: Logout versus routine renewal
- **WHEN** the account token is renewed without logout or a change of account
- **THEN** valid selections survive; logging out and signing back in instead starts at defaults even for the same account

#### Scenario: New chat, fork or delegate
- **WHEN** another chat, fork or child is created from a conversation with explicit speed or verbosity
- **THEN** the new session starts with Standard and model-default verbosity even if it uses the same connection and model

### Requirement: Invalidate removed choices on catalogue publication
Publishing a successful catalogue refresh SHALL clear any saved overrides it no longer supports in every affected chat, including closed chats. Supported choices and choices on other routes MUST be preserved. A later refresh MUST NOT restore a cleared choice without a new explicit selection.

#### Scenario: Fast disappears and returns while the chat is closed
- **GIVEN** a closed chat has saved Fast and high verbosity
- **WHEN** a successful refresh removes Fast but retains high verbosity, and another successful refresh restores Fast before the chat reopens
- **THEN** the reopened chat reports the reset to Standard once, and its first request sends high verbosity without `service_tier`
- **AND** Fast remains unselected until the owner selects it again

#### Scenario: Reject a stale explicit edit
- **WHEN** the owner explicitly submits a value no longer advertised, including through a stale picker
- **THEN** the edit is rejected without storing the new value; the chat can still send using its valid preferences or defaults

### Requirement: Consent applies only to the user-facing chat response
Only requests generating the existing chat's assistant response, including tool continuations, SHALL use saved speed and verbosity. Background work, file summaries, compaction and independent SDK calls MUST NOT inherit them from a session ID. The new-session draft SHALL NOT offer or persist these controls.

#### Scenario: Same correlation ID, different callers
- **WHEN** a chat with Fast generates a reply, summarizes a file internally and makes an independent SDK call with the chat's session ID
- **THEN** only the reply uses saved Fast; the other calls use defaults unless the independent caller supplies its own valid options

#### Scenario: First message submitted from a draft
- **WHEN** the owner creates a chat and submits its first message in one action
- **THEN** that request uses Standard and model-default verbosity; controls become available in the created chat and never carry over from a previous draft

### Requirement: Unsent requests respect current consent and support
The last admission check before a Codex request is handed to transport SHALL order dispatch against catalogue publication, account changes and saved preference edits. Saved overrides no longer authorized at admission MUST be reconciled individually. An explicit unsupported SDK override MUST fail without inference, never silently downgrade. Admission MUST NOT replay a request already handed to transport.

#### Scenario: Fast is revoked after preparation
- **GIVEN** a chat request and an explicit SDK request were prepared for Fast and high
- **WHEN** a same-generation refresh removing Fast publishes before either request is handed to transport
- **THEN** the chat sends high without a tier and records one reset; the SDK request fails as INVALID_INPUT with no inference request
- **AND** a concurrent stale save cannot restore Fast after that publication

### Requirement: Owner-controlled edits and reset notices
Only the chat owner SHALL read saved overrides and pending notices, update choices or acknowledge notices. Browser mutations MUST require CSRF protection. Writes MUST reject obsolete route, account or preference revisions even when the submitted choice is supported. Each reset SHALL create one durable notice, not a transient broadcast; background reads MUST NOT acknowledge it.

#### Scenario: A stale tab tries to re-enable paid speed
- **WHEN** the owner chooses Standard and another tab submits Fast from the preceding revision, even if no preference row remains
- **THEN** the stale edit fails; Standard is retained until a fresh owner selection

#### Scenario: Notice survives absence and acknowledgment is idempotent
- **WHEN** a background projection reads a pending notice, delivery is interrupted, or another participant opens the chat
- **THEN** it remains pending for the owner; the other participant cannot read the choices or notice, set overrides or acknowledge it
- **AND** the active owner view acknowledges only after presentation; repeated reads use the same notice ID, and after acknowledgment neither tab nor reload presents it as new

### Requirement: Strictly offline control discovery in the picker
Opening the picker SHALL initiate no external request, including background label, pricing, credential or provider fetches. Local bridge reads are permitted. Missing external data MUST use local names/IDs or an empty state with a path to explicit catalogue refresh. This MUST NOT disable scheduled refresh or normal refresh in Models settings.

#### Scenario: All external caches are cold
- **WHEN** the owner opens the picker without a model list or external label snapshot, including with an unresolved current route or manual ID
- **THEN** there are zero outgoing external requests; any local choices remain usable and the owner can reach explicit refresh without it running automatically
