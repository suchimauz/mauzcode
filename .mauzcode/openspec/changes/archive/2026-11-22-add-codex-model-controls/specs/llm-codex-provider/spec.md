## ADDED Requirements

### Requirement: Account-advertised response controls
Codex SHALL derive optional response controls for each visible model from its own connection's catalogue. It MUST recognize `fast` or `priority` in `additional_speed_tiers` or `service_tiers[].id` as Fast, and `ultrafast` as Ultrafast. It SHALL advertise verbosity only for `support_verbosity: true` and expose `default_verbosity` only when it is a known value. It MUST NOT infer paid tiers from the model name, reasoning level or another account.

#### Scenario: Multiple catalogue shapes
- **WHEN** a model lists `additional_speed_tiers: ["fast", "future"]`, `service_tiers: [{"id":"priority"},{"id":"ultrafast"}]`, `support_verbosity: true` and `default_verbosity: "low"`
- **THEN** Fast is offered once alongside Standard and Ultrafast, no `future` choice is offered, and low is reported as the model's verbosity default

#### Scenario: Fields are independent
- **WHEN** a model advertises Ultrafast alone and reports `default_verbosity: "medium"` without `support_verbosity: true`
- **THEN** it offers Standard and Ultrafast but neither Fast nor an explicit verbosity control

### Requirement: Consistent Codex account selection
Discovery and Responses inference SHALL derive the bearer token and `chatgpt-account-id` from the same trusted authentication record. Both MUST omit the header if there is no account ID. Without a verified account binding, the provider MUST NOT authorize non-default speed or verbosity.

A rejected refresh or backend HTTP 401 MUST invalidate login and dependent state only if its credential revision and account generation are still current.

#### Scenario: Late refresh rejection after account replacement
- **GIVEN** a token refresh for A is pending and the connection has since signed into B with a current catalogue and saved Fast preference
- **WHEN** A's token refresh returns HTTP 401
- **THEN** B stays signed in with unchanged credentials, catalogue and preference; no reset notice is emitted for B

#### Scenario: Late inference rejection after account replacement
- **GIVEN** a Responses request for A is in flight when the connection signs into B and B selects Fast
- **WHEN** A's request returns HTTP 401
- **THEN** the request fails, but B stays signed in with unchanged credentials, catalogue and preference and receives no reset notice

### Requirement: Verify identity on credential renewal
Renewal MUST NOT carry forward an account binding solely from a retained ID token or stored account ID.

#### Scenario: Identity evidence on renewal
- **GIVEN** A selected Fast and the previous record contains A's ID token and account ID
- **WHEN** renewed credentials independently confirm A
- **THEN** the binding and valid preference survive
- **AND** if fresh evidence instead identifies B, B starts at defaults without A's catalogue or preference
- **AND** if fresh evidence is absent or internally contradictory, the binding is cleared; ordinary default requests omit the account header and paid tier, and explicit Fast is rejected before inference

#### Scenario: Token with access to multiple accounts
- **GIVEN** one token can access multiple accounts and the connection's auth record selects B
- **WHEN** the connection lists models and then streams a response or makes a one-shot call
- **THEN** both the catalogue request and each Responses request carry `chatgpt-account-id` for B

#### Scenario: Auth record has no account ID
- **WHEN** discovery and an otherwise valid default inference run with a token but no account ID
- **THEN** neither request sends `chatgpt-account-id` and inference sends neither `service_tier` nor `text.verbosity`

### Requirement: Codex response option validation and dispatch
Both `models.stream` and `models.call` SHALL accept Codex `providerOptions.speed` and `providerOptions.verbosity`. Omitted or `standard` speed and omitted or `default` verbosity MUST omit their wire fields. An advertised Fast or Ultrafast SHALL send `service_tier: "priority"` or `"ultrafast"`, respectively. Explicit supported verbosity SHALL set only `text.verbosity`. Invalid keys, values or unsupported overrides MUST fail before network access.

#### Scenario: No override, even with an old catalogue
- **WHEN** a valid ordinary call has no control metadata and selects defaults or omits the options
- **THEN** it proceeds without `service_tier` or `text.verbosity`; no catalogue refresh is required and standard never promotes to a faster tier

#### Scenario: Faster structured response
- **GIVEN** the route advertises Fast, Ultrafast and verbosity
- **WHEN** a caller requests Fast with `verbosity: "high"` and a JSON schema
- **THEN** the body contains `service_tier: "priority"`, `text.verbosity: "high"` and the original `text.format` schema
- **AND** selecting Ultrafast instead changes the tier to `ultrafast`

#### Scenario: Invalid or unadvertised override
- **WHEN** a caller supplies an unknown option key, an invalid value, or requests an override that the route's cached metadata does not support
- **THEN** the call returns a validation error, without refreshing discovery, sending inference or silently choosing another value

#### Scenario: Malformed override container
- **WHEN** an SDK caller passes a non-object, null or array as explicit provider options
- **THEN** Codex rejects it as non-retryable INVALID_INPUT before transport or token refresh

#### Scenario: Authentication changes after preflight
- **GIVEN** an explicit SDK override was validated against A's catalogue
- **WHEN** dispatch obtains credentials for B instead, even if B offers the same tier
- **THEN** the SDK rejects the override without sending an inference request or retrying on B

### Requirement: Account binding across call retries
For every Codex call, `models.call` SHALL pin the issuing account generation across attempts. For explicit overrides the binding starts at initial validation; defaults may make one attempt without verified identity but MUST NOT retry it. Before each attempt it MUST check that generation against the dispatch credentials. A mismatch MUST terminate the call without dispatching that attempt or retrying under a new generation.

#### Scenario: Account changes during retry backoff
- **GIVEN** the first Fast request for A receives a retryable failure
- **WHEN** the connection switches to B during backoff and B also advertises Fast
- **THEN** the call fails; the transport records only the first inference attempt for A and none for B

### Requirement: Forward-compatible Codex effort discovery
Codex SHALL retain the recognized subset of an advertised reasoning list, including distinct `xhigh` and `max`, and use only a recognized, supported default. It MUST NOT manufacture support from a profile when discovery explicitly supplies an unusable list. The documented profile fallback SHALL remain available for absent reasoning metadata, without adding `max`. Neither literal `auto` nor `ultra` SHALL be sent as effort.

#### Scenario: Future effort and default
- **WHEN** discovery lists `high`, `max` and an unknown level, with the unknown level as default
- **THEN** `high` and `max` remain selectable, an explicit `max` sends native `max`, and automatic selection omits the entire `reasoning` field, including `summary`, rather than guessing a default

#### Scenario: No recognized levels versus missing metadata
- **GIVEN** a model that would otherwise match a documented fallback profile
- **WHEN** it explicitly lists only `ultra` or other unknown levels
- **THEN** it offers no reasoning choices and inference requiring resolved reasoning fails with `CAPABILITY_UNAVAILABLE` before dispatch; the profile does not replace the list and no delegation is started
- **AND** if the catalogue instead omits reasoning metadata, the existing documented fallback applies as before

### Requirement: Device login intent survives out-of-order responses
Only the most recent uncancelled device-login attempt on a connection SHALL be allowed to publish credentials. Logout and cancellation MUST invalidate even an attempt still waiting for its user code or final credential write. Stale results MUST NOT change login, catalogue, preferences or reset notices.

#### Scenario: Out-of-order start or exchange
- **WHEN** an earlier attempt returns after a newer login, or logout completes while a user-code request or credential save is in flight
- **THEN** the earlier attempt cannot become the active flow, store credentials or report a new successful login; the newer login or logout remains effective

## MODIFIED Requirements

### Requirement: Token storage and refresh
Codex tokens SHALL be stored encrypted per connection. An access token expiring within 60 seconds MUST be refreshed through the connection transport before use. Concurrent refreshes of the same credential revision and account generation MUST result in one refresh request. A refresh result MUST NOT overwrite a newer revision or generation. A rejected refresh or a 401 MUST mark login required only while both the issuing revision and generation are current.

#### Scenario: Concurrent refresh
- **WHEN** two requests need a refreshed token at the same time
- **THEN** one refresh request is sent and both use the new access token

#### Scenario: Refresh rejected
- **WHEN** the current refresh request is rejected
- **THEN** the connection test reports `unavailable` with reason `login-required`

#### Scenario: Logout
- **WHEN** the owner logs out
- **THEN** the stored tokens are deleted without any network request and the connection reports that login is required

#### Scenario: Late successful refresh after logout and login
- **GIVEN** A's refresh is in flight and logout followed by login creates B's credential with the same numeric secret revision
- **WHEN** A's successful token response arrives, including with multiple waiters
- **THEN** B's credentials, catalogue and preferences remain untouched; no caller receives a bearer from A paired with B's account header or generation, and no reset is emitted for B

### Requirement: Codex failures and observations
Codex SHALL report SDK-native failures and usage without legacy workers or telemetry. Token counts and quota windows MUST stay distinct. A 401 SHALL fail the request as login-required; only the issuing revision and generation, if current, may mark login required. Exhausted quota, throttling and ambiguous transport failures MUST be distinguishable. Failed or incomplete streams MUST NOT appear complete; inference MUST NOT retry internally after uncertain acceptance.

#### Scenario: Usage and quota are both returned
- **WHEN** a response reports input, output and cached-input tokens together with quota observations
- **THEN** token counters are preserved separately from quota windows without an additional usage request or a legacy recording call

#### Scenario: Authentication rejection
- **WHEN** the backend returns 401 for the current credential revision and account generation
- **THEN** the SDK reports login required, marks the connection accordingly and does not repeat inference

#### Scenario: Quota versus temporary throttling
- **WHEN** structured backend information identifies either exhausted quota or transient throttling
- **THEN** the SDK preserves that distinction and available retry timing without treating every 429 as exhausted quota or automatically retrying

#### Scenario: Ambiguous interrupted stream
- **WHEN** a connection closes before a terminal response after request acceptance is possible
- **THEN** the SDK reports uncertain acceptance and unsafe automatic replay, without making a second inference request

#### Scenario: A cached tier is rejected upstream
- **WHEN** the backend rejects the selected tier as invalid or unsupported after dispatch
- **THEN** surface the non-retryable rejection; do not replay at Standard or any other tier or treat this response as a catalogue publication

### Requirement: Turn-scoped sticky routing
Codex streaming SHALL capture the first nonempty `x-codex-turn-state` response header of a logical run and expose it as opaque scoped SDK state. Subsequent requests in that run SHALL replay it only within the same verified account generation. State MUST NOT leak across runs, sessions, connections or account generations or be stored in an unbounded global provider cache.

#### Scenario: Tool continuation within one run
- **GIVEN** the first request returned a turn-state token
- **WHEN** the caller submits a tool result with that scoped state in the same run and verified generation
- **THEN** the next request includes the token in `x-codex-turn-state`
- **AND** a later response token does not replace the run's first token

#### Scenario: Fresh run or absent token
- **WHEN** a new run begins, or no response token has been received
- **THEN** no previous run's turn-state header is sent

#### Scenario: State belongs to another context
- **WHEN** a client submits state bound to a different connection, session or run
- **THEN** the SDK rejects the mismatch before network access

#### Scenario: Account switch during a tool continuation
- **WHEN** a chat continues a tool turn on a replacement account on the same connection and run, or can no longer verify the original generation
- **THEN** the chat discards the old turn state and never sends its header; an SDK caller explicitly supplying mismatched or unverifiable turn state is refused before inference

### Requirement: Portable native compaction checkpoints
Codex compaction SHALL return a typed SDK-native encrypted checkpoint that can be serialized, restored and replayed at its history boundary in the same verified generation without legacy transcript metadata. Requests SHALL retain the native compaction trigger, manual standalone memento metadata, disabled parallel tools and medium reasoning. The caller owns persistence and selection of retained history; the provider MUST NOT read or mutate agent transcripts.

#### Scenario: Compact and continue
- **WHEN** a client compacts a transcript, serializes and restores the returned SDK checkpoint, and supplies it in its verified generation before retained messages to streaming
- **THEN** the request contains the native compaction item at that boundary followed by retained messages
- **AND** encrypted content is not converted into visible prose or legacy session records

#### Scenario: Invalid checkpoint response
- **WHEN** compaction returns multiple checkpoint items, no item, empty or non-string encrypted content, or lacks completed response identity
- **THEN** compaction fails without exposing an apparently successful checkpoint

#### Scenario: Invalid checkpoint input
- **WHEN** a client supplies a malformed checkpoint or one bound to an incompatible provider, connection or model
- **THEN** the SDK rejects it before inference without echoing encrypted content into diagnostics

#### Scenario: Foreign or unbound checkpoint
- **WHEN** a persisted Codex checkpoint belongs to another generation or has no verifiable origin, including a legacy untagged checkpoint
- **THEN** the SDK rejects replay before inference without exposing its contents; it never treats an equal model and connection as proof of ownership
- **AND** a chat can continue only from complete compatible history without that checkpoint; otherwise it stops with a recovery message rather than silently losing context
