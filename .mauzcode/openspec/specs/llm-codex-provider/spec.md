# llm-codex-provider Specification

## Purpose
Define the built-in Codex (ChatGPT subscription) model provider: native device-code login sent through the connection transport, encrypted token storage and refresh, model discovery, usage windows, streaming and compaction.

## Requirements

### Requirement: Codex connection
The system SHALL provide a built-in `codex` provider whose connections need only an account name, accept an optional client version override, and allow the direct, SOCKS proxy and SSH tunnel transports.

#### Scenario: Create through a proxy
- **WHEN** the owner creates a codex connection with a saved SOCKS proxy transport
- **THEN** the connection is stored without credentials and reports that login is required

### Requirement: Native device-code login through the transport
Codex login SHALL use the OpenAI device-code flow: request a user code, show the verification link and code, poll for authorization, then exchange the code for tokens. Every request in the flow MUST go through the connection transport. Login MUST NOT start a local CLI or run commands on an SSH instance.

#### Scenario: Successful login over SOCKS
- **GIVEN** a codex connection with a SOCKS proxy transport
- **WHEN** the owner starts login, confirms the code in the browser and polls status
- **THEN** status becomes `succeeded`, tokens are stored, and every login request was sent through the proxy

#### Scenario: Waiting for confirmation
- **WHEN** the authorization poll answers 403 or 404
- **THEN** login status stays `pending` and polling continues at the server-provided interval

#### Scenario: Device login not available
- **WHEN** the user-code request answers 404
- **THEN** login fails with a message that device-code login is not enabled

#### Scenario: Expiry
- **WHEN** the code is not confirmed within 15 minutes
- **THEN** login status becomes `expired` and polling stops

#### Scenario: Cancel
- **WHEN** the owner cancels a pending login
- **THEN** polling stops, status becomes `failed` with a cancelled reason, and no tokens are stored

#### Scenario: Exchange is never repeated
- **WHEN** the code-for-token exchange fails or times out
- **THEN** login fails without sending the exchange request again

### Requirement: Login secrecy
Login status and results MUST contain only the flow id, verification link, one-time user code, expiry and a safe status message. Tokens, the device authorization id, the code verifier and the authorization code MUST NOT be returned, logged or shown.

#### Scenario: Status payload
- **WHEN** login status is read at any stage
- **THEN** the payload contains no token, device authorization id, code verifier or authorization code

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

### Requirement: Codex models and usage
The provider SHALL list visible models from the Codex models endpoint and SHALL report usage windows (used percent and reset time) from the Codex usage endpoint. The connection test SHALL report `available`, `unavailable` or `configured` with reason `login-required`.

#### Scenario: Usage windows
- **WHEN** usage is read for a logged-in connection
- **THEN** the report contains the primary and secondary windows with used percent and reset time

#### Scenario: Not logged in
- **WHEN** a connection without tokens is tested
- **THEN** the result is `configured` with reason `login-required` and no network request is sent

### Requirement: Codex streaming and compaction
The provider SHALL stream Responses API output as text, reasoning summary and tool call events. It SHALL create native compaction checkpoints. Both MUST go through the connection transport and the models inference entry point.

#### Scenario: Streamed reply with a tool call
- **WHEN** the backend streams text deltas, a function call item and a completed event
- **THEN** the result contains the text, the tool call with parsed arguments, usage and the finish reason

### Requirement: Independent Codex SDK execution
The Codex connection provider SHALL operate without legacy inference namespaces, legacy account routing or storage, agent-runtime types, or an installed Codex CLI. This independence MUST include its transitive protocol dependencies. Requests SHALL use only the resolved connection transport. An installed Codex CLI MAY be used only as the client version source of connections that enabled CLI detection; its absence or failure MUST NOT affect any operation.

#### Scenario: Legacy runtime is unavailable
- **GIVEN** an authorized Codex SDK connection and no legacy inference namespaces or CLI
- **WHEN** the client lists models, reads usage, streams or compacts through the SDK
- **THEN** the operations use only SDK-owned behavior and independent infrastructure, with network requests through the connection transport

#### Scenario: Client version selection
- **WHEN** a connection has a valid client version override
- **THEN** requests use that override without executing local commands
- **AND** a connection without an override and with CLI detection disabled uses the documented SDK version without executing local commands

### Requirement: Codex request behavior parity
For equivalent prepared SDK inputs, the Codex provider SHALL preserve the established Responses protocol behavior for instructions, messages, attachments, tool schemas, tool results, reasoning and native checkpoints. Session context construction SHALL remain the caller's responsibility. Behavioral fixtures MUST be executable without loading the legacy runtime.

#### Scenario: Prepared tool conversation
- **WHEN** a client streams prepared instructions, user messages, a function call, its result and tool schemas
- **THEN** the request preserves their ordering and identifiers, uses the Responses function format, disables storage, enables streaming and enables parallel tool calls when tools are present

#### Scenario: Malformed tool arguments
- **WHEN** a completed function call contains invalid JSON arguments
- **THEN** its arguments are represented as an explicit parse failure for downstream validation rather than silently treated as valid empty arguments

### Requirement: Independent prompt cache identity
Codex streaming SHALL use an explicit prompt cache key when supplied, otherwise the current session identifier. Correlation headers MUST identify the current session independently of that key. The provider MUST NOT discover lineage or read agent state. This requirement does not change model-discovery caching.

#### Scenario: Related sessions share a prefix
- **GIVEN** two sessions with inherited history and the same caller-supplied prompt cache key
- **WHEN** they stream
- **THEN** their requests share the prompt cache key while retaining distinct session correlation identifiers

#### Scenario: Independent session and backwards-compatible omission
- **WHEN** a session omits the prompt cache key
- **THEN** its own session identifier is used for the cache key and correlation, without looking up a parent

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

### Requirement: Capability-aware Codex reasoning
Codex requests SHALL use SDK-resolved reasoning capabilities rather than legacy model routing. Automatic or omitted preference SHALL resolve to the declared model default; supported preferences SHALL be preserved. Unsupported preferences SHALL fall back to the nearest supported level at or below the requested level, otherwise the lowest supported level above it. A resolved off preference SHALL become wire effort `none`; unresolved `auto` MUST NOT be sent.

#### Scenario: Automatic reasoning
- **GIVEN** a model with SDK default medium
- **WHEN** the caller omits effort or requests auto
- **THEN** Codex receives medium reasoning and automatic reasoning summary

#### Scenario: Off is supported
- **GIVEN** a model supporting off
- **WHEN** off is requested
- **THEN** the request uses wire effort none

#### Scenario: Off is unsupported
- **GIVEN** a model whose lowest supported level is low
- **WHEN** off is requested
- **THEN** low is applied without overwriting the caller's original preference

#### Scenario: No trustworthy capability information
- **GIVEN** neither validated model metadata nor a documented SDK profile defines reasoning behavior
- **WHEN** reasoning normalization is required
- **THEN** the SDK returns an explicit capability-unavailable failure before inference rather than sending auto or guessing a level

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

### Requirement: Codex parity acceptance evidence
Acceptance of Codex SDK parity SHALL include deterministic protocol and architecture tests and a separately authorized live comparison of independent old and new clients. Offline results alone MUST NOT establish full acceptance. Live comparison MUST use isolated sessions and explicitly approved account or connection, model and request or token budget, without changing user conversations or exposing credentials.

#### Scenario: Required live sequence
- **WHEN** an authorized live comparison is performed
- **THEN** both clients are exercised for a normal response, tool continuation, native compaction and a response after checkpoint restoration on the same model and comparable account conditions
- **AND** the report records request conditions, input tokens and reported cached-input tokens separately from correctness findings

#### Scenario: Cache metrics are inconclusive
- **WHEN** cached-input counters are absent or zero
- **THEN** the report states that cache effectiveness is unconfirmed rather than claiming a cache-hit improvement or requiring numerical equality between nondeterministic backend runs

#### Scenario: Live environment is unavailable
- **WHEN** authorization, credentials or the permitted test environment are unavailable
- **THEN** the live acceptance task remains incomplete and offline test success is not reported as full parity acceptance

### Requirement: Duration-based Codex quota periods
The provider SHALL classify quota periods using valid reported window duration, not primary/secondary slot position, display labels or time remaining until reset. A duration of 18000 seconds SHALL identify five hours and 604800 seconds SHALL identify one week. Missing, invalid, contradictory or unsupported duration evidence MUST NOT imply a standard period.

#### Scenario: Weekly-only primary window
- **WHEN** usage contains only a primary window with `limit_window_seconds: 604800`
- **THEN** that window is identified as weekly, with its reported utilization and reset time, and no five-hour window is invented

#### Scenario: Conventional pair
- **WHEN** primary has a duration of 18000 seconds and secondary has a duration of 604800 seconds
- **THEN** they are identified as five-hour and weekly windows respectively

#### Scenario: Reordered slots
- **WHEN** primary has a duration of 604800 seconds and secondary has a duration of 18000 seconds
- **THEN** they are identified as weekly and five-hour windows respectively

#### Scenario: Minutes representation
- **WHEN** an otherwise valid window reports `window_minutes: 10080` without a seconds duration
- **THEN** it is identified as weekly

#### Scenario: No trustworthy period
- **WHEN** a valid usage window has no duration, an unsupported duration, an invalid duration, or conflicting seconds and minutes durations
- **THEN** its standard period remains unknown and the window is retained for additional-limit presentation
- **AND** neither its slot nor its reset timestamp is used to guess a period

### Requirement: Retained Codex quota identity
The provider SHALL preserve the identity and available usage/reset data of each valid parsed quota window independently of its standard-period classification. Unknown usage MUST NOT be converted to zero. Missing or malformed window entries MUST NOT create phantom limits or prevent valid sibling windows from being reported.

#### Scenario: Unknown duration with valid usage
- **WHEN** a primary window reports a valid used percentage and reset time but no duration
- **THEN** its identity, used percentage and reset time remain in the report without a fabricated session classification

#### Scenario: Additional rate-limit entries
- **WHEN** the usage response contains the `codex` rate-limit entry and another valid entry, such as a model-specific limit with a weekly duration
- **THEN** the `codex` entry supplies the account-wide windows
- **AND** the other entry is retained as an additional limit with its own identity and does not populate the weekly column

#### Scenario: Null utilization
- **WHEN** an entry reports null or non-finite utilization and no other valid usage measurement
- **THEN** it is not emitted as a zero-percent quota
- **AND** a valid sibling window is still reported

### Requirement: Codex CLI version detection setting
A codex connection SHALL have a boolean setting "Detect CLI version" that defaults to disabled, including for stored connections without the setting. It MUST NOT be enabled together with a client version override: saving a connection with both SHALL be rejected.

#### Scenario: Existing connection unchanged
- **GIVEN** a stored codex connection without the setting
- **WHEN** a request is sent
- **THEN** it uses the override or the documented SDK version and no local command is executed

#### Scenario: Override with detection rejected
- **WHEN** the owner saves a codex connection with an override and detection enabled
- **THEN** the save fails with a validation error

### Requirement: Codex client version source
The `codex` provider SHALL resolve its client version with this precedence and report the matching source: a valid connection override (`override`); else, when detection is enabled, the version detected from the local `codex --version` (`detected`); else the documented SDK default (`default`). A detected version SHALL be used even when it is older than the SDK default, with a detail stating that it is older. Requests and the report MUST use the same resolution.

#### Scenario: Override reported
- **GIVEN** a codex connection with a valid client version override
- **WHEN** its client version is reported
- **THEN** the version equals the override with source `override` and no local command is executed

#### Scenario: Detected CLI version
- **GIVEN** no override, detection enabled and a local `codex --version` that prints `codex-cli 0.160.0`
- **WHEN** the client version is reported
- **THEN** the version is `0.160.0` with source `detected`, and the next models or responses request uses the same version

#### Scenario: Older detected version
- **GIVEN** no override, detection enabled and a local `codex --version` that prints a version older than the SDK default
- **WHEN** the client version is reported
- **THEN** the version is the detected one with source `detected` and the detail says it is older than the SDK default

#### Scenario: Default reported
- **GIVEN** no override and either detection disabled or no usable local Codex CLI
- **WHEN** the client version is reported
- **THEN** the version is the documented SDK default with source `default`

### Requirement: Codex version detection
Codex CLI detection SHALL run only on the MauzCode host and only for connections with detection enabled, with a bounded timeout and output size, and its result SHALL be cached (successful results for five minutes, failures for thirty seconds). Reporting MUST reuse the cache used by requests. A refresh request SHALL discard the cache entry and detect again.

#### Scenario: Cached detection
- **GIVEN** a request detected the Codex CLI version less than five minutes ago
- **WHEN** the client version is reported without refresh
- **THEN** the cached version is returned and `codex --version` is not executed again

#### Scenario: Refresh
- **GIVEN** a cached detected version
- **WHEN** the client version is reported with refresh
- **THEN** `codex --version` is executed again and the next request uses the new result

#### Scenario: Hanging CLI
- **WHEN** `codex --version` does not finish within the timeout
- **THEN** the process is killed and the SDK default is used with source `default`

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
