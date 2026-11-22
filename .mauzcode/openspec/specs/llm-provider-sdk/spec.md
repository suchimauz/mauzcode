# llm-provider-sdk Specification

## Purpose
Defines the contract every LLM provider implements and how core modules, official plugins and user plugins declare and register providers, so that new connection types can be added without changing the core.

## Requirements

### Requirement: Provider declaration
The system SHALL let any mounted source (core module, official plugin or user plugin) declare an LLM provider through a dedicated declarative file kind identified by a lowercase kebab-case provider id.

#### Scenario: Plugin declares a provider
- **WHEN** a mounted user plugin contains a provider declaration with id `acme`
- **THEN** the provider `acme` appears in the provider catalogue with its label, icon, description, field schema and allowed transports

#### Scenario: Invalid provider id
- **WHEN** a provider declaration uses an id that is not lowercase kebab-case
- **THEN** registration of that declaration fails with an error naming the file, and other providers stay registered

### Requirement: Provider ownership
The system SHALL bind each provider id to the mounted source that first declared it and MUST reject a declaration of the same id from a different owner; built-in provider ids are owned by the core.

#### Scenario: Plugin tries to override a built-in provider
- **WHEN** a user plugin declares a provider with id `custom`
- **THEN** that declaration is rejected and the built-in `custom` provider remains unchanged

#### Scenario: Same owner redeclares
- **WHEN** the owning plugin reloads its own provider declaration
- **THEN** the registered provider is replaced by the new definition

### Requirement: Provider contract
A provider definition MUST include metadata, a field schema, the list of allowed transports and a connection test operation, and MAY include model listing, usage reporting, configuration validation and provider-owned actions such as login and logout.

#### Scenario: Minimal provider
- **WHEN** a provider declares only metadata, fields, transports and a test operation
- **THEN** it is accepted and connections of that provider can be created, tested and shown with status-only usage

#### Scenario: Missing test operation
- **WHEN** a provider declaration has no test operation
- **THEN** registration of that provider fails with an error

### Requirement: Field schema
The field schema SHALL describe each configuration field with a key, label, type (text, url, select, secret, number or boolean), required flag, optional default, options for select fields and optional help text.

#### Scenario: Secret field is declared
- **WHEN** a provider declares a field of type `secret`
- **THEN** its value is stored as a secret and never returned to clients, which only see whether it is set

### Requirement: Provider-owned authorization
The core SHALL NOT implement provider-specific authorization; login, logout, token refresh and other provider-specific flows MUST be performed by the provider through its declared actions.

#### Scenario: Provider action invoked
- **WHEN** the owner invokes a declared action of a provider on one of its connections
- **THEN** the core calls that provider's action with the connection and returns the action's secret-free result

#### Scenario: Undeclared action
- **WHEN** a client invokes an action that the provider did not declare
- **THEN** the request fails with an unknown-action error and nothing is called

### Requirement: Hot reload of providers
The system SHALL re-register provider declarations when their module or plugin is reloaded, without a server restart.

#### Scenario: Provider file edited
- **WHEN** a provider declaration file changes and its module is reloaded
- **THEN** the provider catalogue reflects the new definition

### Requirement: Optional inference operations
A provider definition MAY declare streaming and compaction operations that receive the resolved connection and a request, and send network traffic only through the connection's transport. A protocol route counts as streaming support. The core inference entry point SHALL refuse a request with code `UNSUPPORTED` when the provider declares neither a streaming operation nor a protocol route (or no compaction operation for compaction), without contacting the network.

#### Scenario: Provider without streaming
- **WHEN** a stream request targets a connection whose provider declares neither a streaming operation nor a protocol route
- **THEN** it fails with code `UNSUPPORTED` and no request is sent

#### Scenario: Provider with streaming
- **WHEN** a stream request targets an enabled model of an enabled connection whose provider declares streaming
- **THEN** the provider's streaming operation receives the request and its normalized result is returned

### Requirement: Optional stream request fields
A stream request MAY carry the optional fields `temperature`, `maxTokens`, `responseFormat` and `providerOptions`. The core SHALL pass `temperature` and `maxTokens` only to providers declaring the `sampling` capability, `responseFormat` only to providers declaring the `structuredOutput` capability, and `providerOptions` unchanged. A provider SHALL reject unknown `providerOptions` keys with an invalid input failure.

#### Scenario: Sampling options for a provider without the capability
- **WHEN** a stream request with `temperature` or `maxTokens` targets a provider that does not declare `sampling`
- **THEN** the provider receives the request without those fields

#### Scenario: Structured format for a provider with the capability
- **WHEN** a stream request with `responseFormat` targets a provider that declares `structuredOutput`
- **THEN** the provider receives `responseFormat` and maps it to its native wire format

#### Scenario: Unknown provider option
- **WHEN** a provider receives a `providerOptions` key it does not support
- **THEN** the request fails with code `INVALID_INPUT` before any network request is sent

#### Scenario: Unknown capability flag
- **WHEN** a provider declaration lists a capability flag other than `continuationState`, `checkpoints`, `reasoning`, `sampling` or `structuredOutput`
- **THEN** registration of that declaration fails

### Requirement: Inference cache and compaction fields
The stream request SHALL carry the number of leading messages that form the cacheable prefix, and the stream result SHALL report cache read and cache write tokens when the provider returns them. The compaction request SHALL carry an optional focus and output token budget.

#### Scenario: Cacheable prefix
- **WHEN** a caller passes the cacheable message count
- **THEN** the provider receives it unchanged and may place cache markers before transient guidance

#### Scenario: Compaction focus
- **WHEN** a caller passes a compaction focus and token budget
- **THEN** the provider's compaction operation receives them unchanged

#### Scenario: Cache write tokens
- **WHEN** a provider reports cache creation tokens
- **THEN** the stream result includes them as cache write tokens

### Requirement: Explicit inference cache identity
The SDK stream request SHALL accept an optional prompt cache key independently of its session correlation identifier. Omission SHALL preserve existing callers through a session-identifier fallback for providers using cache keys. The SDK MUST NOT derive session ancestry or require agent-runtime objects. Existing cacheable-message-count and cache read/write usage fields SHALL retain their semantics.

#### Scenario: Separate identity and correlation
- **WHEN** a caller supplies a cache key different from the session identifier
- **THEN** a cache-key-capable provider receives both values distinctly without changing session correlation

#### Scenario: Existing caller
- **WHEN** a caller supplies no new cache field
- **THEN** the operation remains supported without requiring an agent, parent lookup or legacy inference runtime

### Requirement: Scoped provider continuation state
The SDK SHALL support optional opaque provider continuation state in stream request and result, bound to provider, connection, session and logical run. The caller SHALL explicitly carry it between requests and discard it at the end of the run. Context mismatches MUST fail before inference. Providers that do not support continuation state SHALL continue to work without it and MUST NOT receive another provider's protocol headers.

#### Scenario: Return and replay
- **WHEN** a state-capable provider returns continuation state and the caller supplies it for the next request in the same context
- **THEN** the SDK validates its scope and makes it available only to that provider

#### Scenario: Foreign state
- **WHEN** any bound provider, connection, session or run identifier differs
- **THEN** the SDK rejects the state without a network request

#### Scenario: Provider without state support
- **WHEN** an existing provider is invoked without continuation state
- **THEN** no Codex-specific header or requirement is imposed on it

### Requirement: SDK-owned reasoning capabilities

The SDK SHALL define provider-owned supported reasoning levels, an optional supported default, optional native wire values per level, optional thinking-disable, adaptive-thinking and effort flags, and requested/applied preference diagnostics. The adaptive flag asks supporting protocols to send their native adaptive-thinking switch on every applied level other than `off` and `auto`; effort `false` means no effort value is sent. Providers not opting in MUST retain their existing behavior.

#### Scenario: Invalid metadata or preference
- **WHEN** supported levels are empty, a declared default is unsupported, a wire value is empty or for an unsupported level, the adaptive or effort flag is not boolean, or the preference is outside the SDK enumeration
- **THEN** the SDK reports a validation failure rather than sending an invalid effort downstream

#### Scenario: Provider not opted in
- **WHEN** an existing provider without SDK capability normalization receives its existing reasoning input
- **THEN** its established behavior is preserved and no new capability lookup is forced on it

#### Scenario: Adaptive flag carried to the protocol
- **WHEN** a model's capabilities declare adaptive thinking and the applied level is `high`
- **THEN** the resolved reasoning passed to the protocol carries the adaptive flag with effort `high`

#### Scenario: Thinking switch without effort
- **WHEN** capabilities declare adaptive thinking with effort `false` and the applied level is `high`
- **THEN** the resolved reasoning carries the adaptive flag and no effort

### Requirement: Reasoning preference normalization
Opted-in providers SHALL receive normalized preferences before inference, without legacy routes, accounts or types. Automatic or omitted preference SHALL use the default; when capabilities declare no default it SHALL apply `auto`, meaning no reasoning setting is sent. Unsupported levels SHALL use the nearest supported lower-or-equal level, otherwise the lowest higher level.

#### Scenario: Capability-backed normalization
- **GIVEN** a provider participating in SDK reasoning normalization and validated capabilities
- **WHEN** a caller submits a preference
- **THEN** the SDK resolves it before provider inference and retains the requested value for diagnostics without mutating caller settings

#### Scenario: Auto without a declared default
- **WHEN** capabilities declare supported levels but no default and the caller requests auto
- **THEN** the applied value is `auto` and no reasoning field is sent upstream

#### Scenario: Missing capabilities
- **WHEN** an opted-in provider has neither validated capabilities nor an applicable documented SDK profile
- **THEN** inference fails explicitly with a capability-unavailable classification before the inference request
- **AND** the SDK does not discover legacy model routes to fill the gap

### Requirement: Typed portable native checkpoints
The SDK SHALL define a serializable native checkpoint contract with provider, connection and model compatibility identity and opaque payload. A compact result SHALL expose this checkpoint, and stream input SHALL accept it in an explicitly ordered position alongside retained messages. The contract MUST NOT require legacy message types, agent storage or transcript mutation. Existing compact result fields and optional focus/output-budget input SHALL remain supported during additive adoption.

#### Scenario: Storage-independent round trip
- **WHEN** a client serializes a compact result checkpoint, restores it and submits it as ordered stream input
- **THEN** the provider can replay it without accessing any legacy transcript store

#### Scenario: Unsupported or incompatible checkpoint
- **WHEN** the selected provider lacks checkpoint replay support or the checkpoint identity differs from the selected connection/model
- **THEN** the SDK fails before inference with an explicit unsupported or incompatible-checkpoint error

#### Scenario: Existing compact consumer
- **WHEN** a consumer reads previously supported compact result fields and does not use the new checkpoint input
- **THEN** those fields retain their meaning and are not removed as part of this change

### Requirement: SDK-native failure and observation contracts
The SDK SHALL expose credential-safe failures independently of legacy worker types, distinguishing auth, quota, throttling, invalid input, unsupported capability, provider failure, cancellation and transport ambiguity. Metadata SHALL separate retry eligibility from replay safety and preserve available HTTP status and retry timing. Token counters SHALL remain separate from quota observations. Codex adoption MUST NOT silently change unrelated providers' contracts.

#### Scenario: Potentially accepted request is interrupted
- **WHEN** transport fails after provider acceptance is possible
- **THEN** the SDK reports uncertain acceptance and unsafe automatic replay, even when the underlying cause is transient

#### Scenario: Pre-request cancellation
- **WHEN** cancellation is already signaled before inference dispatch
- **THEN** no inference network request occurs and the failure is classified as cancelled

#### Scenario: Provider observations
- **WHEN** a provider supplies token counters and quota information in its response
- **THEN** the SDK exposes them as separate optional observations without requiring a legacy telemetry sink

#### Scenario: Credential-safe failure
- **WHEN** upstream error content includes authentication material or opaque checkpoint/state data
- **THEN** public failure data and diagnostics do not expose those values

### Requirement: Provider inference descriptors
A provider definition MAY declare inference descriptors: an optional system preamble that callers place first in the system instructions, the vendor whose public price catalogue applies to its models, and optional ordered models.dev and pi-ai catalogue sections describing its models' context and output limits. Callers MUST obtain these values through route resolution and MUST NOT branch on provider ids.

#### Scenario: Claude preamble
- **WHEN** a route on a `claude` connection is resolved
- **THEN** the result carries the Claude Code identity line as system preamble and `anthropic` as price vendor

#### Scenario: Provider without descriptors
- **WHEN** a provider declares no inference descriptors
- **THEN** resolution reports no preamble and no price vendor

#### Scenario: Catalogue sections default to price vendor
- **WHEN** a provider declares a price vendor but no catalogue sections
- **THEN** context limits are looked up in that vendor's catalogue sections

### Requirement: Provider-neutral tool definitions
The models stream and one-shot call SHALL accept tools in one provider-neutral format: name, description and JSON Schema parameters. Each provider MUST convert them to its own wire format, choosing it from connection configuration when the protocol is configurable. Callers MUST NOT pass provider-shaped tool schemas.

#### Scenario: Same tools, different providers
- **GIVEN** the same neutral `read` tool
- **WHEN** it is streamed through a `claude` connection and through a `codex` connection
- **THEN** the claude request carries it with `input_schema` and the codex request carries it as a Responses `function` tool

#### Scenario: Custom protocol
- **WHEN** a neutral tool is streamed through a `custom` connection configured with the `openai-chat` protocol
- **THEN** the request carries it as a Chat Completions `function` tool

#### Scenario: Optional fields disable strict mode
- **WHEN** a neutral tool schema has an optional property at any nesting level
- **THEN** OpenAI-shaped wire tools are sent with `strict: false`

### Requirement: Protocol-route providers
A provider definition MAY declare a protocol route instead of a streaming operation. For a connection, model, cached model metadata and session id it returns a shared protocol id, base URL and headers, and optionally body fields, reasoning replay and a server-chosen output budget. Declaring both MUST fail registration. After all inference checks the core SHALL stream through that protocol on the connection's transport, merging headers: JSON accept, protocol headers, provider headers.

#### Scenario: Provider streams through a route
- **WHEN** a stream request targets an enabled model of a provider declaring a protocol route that returns `anthropic`
- **THEN** the request is sent in Anthropic Messages format to the returned base through the connection's transport
- **AND** the normalized result is returned as for any streaming provider

#### Scenario: Route returns an unknown protocol
- **WHEN** a protocol route returns an id outside the shared protocol set
- **THEN** inference fails with code `INVALID_INPUT` and no request is sent

#### Scenario: Route and stream both declared
- **WHEN** a provider declaration contains both a streaming operation and a protocol route
- **THEN** registration of that provider fails with an error

#### Scenario: Route model without reasoning controls
- **GIVEN** a protocol-route provider opted into reasoning
- **WHEN** the requested model was discovered without reasoning metadata and no profile applies
- **THEN** the request streams without any reasoning field instead of failing capability-unavailable

#### Scenario: Disabled model with a route provider
- **WHEN** the requested model or connection is disabled
- **THEN** the existing disabled-state error is returned and the protocol route is not called

#### Scenario: Route without body fields or replay
- **WHEN** a protocol route returns only protocol, base URL and headers
- **THEN** the request body is unchanged from the behavior before body fields, replay and the server-chosen budget existed

### Requirement: Provider usage refresh interval
A provider definition MAY declare `usageRefreshMs`, the minimum interval in milliseconds between usage requests for one connection. The value MUST be a finite integer from 10000 to 3600000; otherwise registration of that declaration fails and other providers stay registered. When omitted, the interval is 60000.

#### Scenario: Provider declares an interval
- **WHEN** a provider declares `usageRefreshMs: 180000`
- **THEN** it is registered and its usage reports are reused for 180 s

#### Scenario: Invalid interval
- **WHEN** a provider declares `usageRefreshMs: 1000`
- **THEN** registration of that declaration fails with an error naming `usageRefreshMs`

#### Scenario: Omitted interval
- **WHEN** a provider declares usage without `usageRefreshMs`
- **THEN** its usage reports are reused for 60 s

### Requirement: Protocol route body fields

A protocol route MAY return `body`, a JSON object of provider fields the core passes to the shared protocol with the endpoint. The core SHALL reject with `INVALID_INPUT`, before any request, any key the selected protocol owns, and SHALL forward the rest on the endpoint. Protocols that do not support body fields SHALL ignore them.

#### Scenario: Owned keys per protocol
- **WHEN** a route body touches `model`, `messages`, `stream`, `stream_options`, `tools`, `max_tokens`, `temperature`, `response_format` or `reasoning_effort` on `openai-chat`, or `model`, `messages`, `system`, `stream`, `tools`, `max_tokens`, `temperature`, `thinking` or `output_config` on `anthropic`
- **THEN** the request fails `INVALID_INPUT` and nothing is sent

#### Scenario: Extra field accepted
- **WHEN** a route for `openai-chat` returns body `{ thinking: { type: "enabled" } }`
- **THEN** the request body contains that field alongside the protocol's own fields

#### Scenario: Extra field on Anthropic Messages
- **WHEN** a route for `anthropic` returns body `{ service_tier: "priority" }`
- **THEN** the request body contains that field alongside the protocol's own fields

#### Scenario: Protocol-owned key
- **WHEN** a route returns body `{ model: "other" }`
- **THEN** inference fails with code `INVALID_INPUT` and no request is sent

#### Scenario: Anthropic-owned thinking key
- **WHEN** a route for `anthropic` returns body `{ thinking: { type: "adaptive" } }`
- **THEN** inference fails with code `INVALID_INPUT` and no request is sent

### Requirement: Protocol route reasoning replay
A protocol route MAY return `replayReasoning: true`, which the core passes to the shared protocol with the endpoint, asking it to replay reasoning stored on earlier assistant tool-call turns in its native form. For `openai-chat` that is the stored reasoning text; for `anthropic` it is the stored signed reasoning blocks captured from the same connection and model. Without the flag no stored reasoning SHALL be sent.

#### Scenario: Replay not requested
- **GIVEN** a transcript with stored reasoning on an assistant tool-call turn
- **WHEN** a route without `replayReasoning` streams through `openai-chat`
- **THEN** no wire message carries `reasoning_content`

#### Scenario: Anthropic replay requested
- **GIVEN** a transcript with signed reasoning blocks stored from the same connection and model
- **WHEN** a route with `replayReasoning` streams through `anthropic`
- **THEN** the blocks are sent unchanged at the start of their assistant message

### Requirement: Protocol route server-chosen output budget
A protocol route MAY return `serverMaxTokens: true`, which the core passes to the shared protocol with the endpoint. When set, the protocol SHALL send no output budget field, neither its default nor the request's `maxTokens`, and let the upstream choose. Without the flag the protocol's existing behavior applies.

#### Scenario: Default budget omitted
- **WHEN** a route for `anthropic` returns `serverMaxTokens: true` and the request has no `maxTokens`
- **THEN** the request body contains no `max_tokens`

#### Scenario: Flag absent
- **WHEN** a route for `anthropic` returns no `serverMaxTokens` and the request has no `maxTokens`
- **THEN** the request body contains `max_tokens: 4096`

### Requirement: Provider failure classification
A protocol-route provider MAY declare a failure classifier that receives the upstream status and a bounded, already-parsed error body of a failed request and returns a stable code, classification, retryability and optional reset time. The core SHALL use its answer instead of the status-based classification when it returns one, SHALL keep the message credential-safe, and SHALL fall back to the status-based classification when it returns none or throws.

#### Scenario: Provider recognizes a quota error
- **WHEN** a request fails with HTTP 429 and the provider classifier returns `QUOTA_EXHAUSTED` with a reset time
- **THEN** the thrown failure has classification `quota`, that code and reset time, and no upstream body text

#### Scenario: Classifier returns nothing
- **WHEN** the classifier returns no result for a 429
- **THEN** the failure is the status-based `THROTTLED`

### Requirement: Optional exact token counting
A provider definition MAY declare a token-counting operation that receives the same request shape as streaming (messages, instructions, tools, model) and returns the provider-reported input token count without generating output, through the connection's transport. A public counting entry point SHALL return that count, or `null` when the provider declares no counting or the count fails, without failing the caller.

#### Scenario: Provider counts tokens
- **WHEN** a count is requested for a model whose provider declares counting
- **THEN** the provider's count is returned and no generation request is sent

#### Scenario: Provider without counting
- **WHEN** a count is requested for a provider without counting
- **THEN** `null` is returned without any network request

### Requirement: Core-owned provider enablement
Provider enablement SHALL be owned by the core, derived from the global `models.disabledProviders` setting. Provider declarations SHALL NOT implement, store or override enablement: the declaration contract is unchanged, and a provider that declares nothing about enablement is fully governed by the core switch.

#### Scenario: Declaration contract unchanged
- **WHEN** an existing provider declaration (core or plugin) is loaded after this change
- **THEN** it registers without any enablement field or check, and the core switch still governs its connections

### Requirement: Provider enablement reporting
The declaration catalogue `models.providers()` SHALL stay synchronous and unchanged in shape; the effective state SHALL be exposed by the models settings API, which reports per provider `enabled` and `enabledLocked` computed on every request.

#### Scenario: Settings API reflects the switch
- **WHEN** the owner disables provider `qwen` and the models settings API is read
- **THEN** the `qwen` entry reports `enabled: false` with its declared metadata unchanged, and other providers report `enabled: true`

#### Scenario: Declaration catalogue unchanged
- **WHEN** a caller reads `models.providers()` after this change
- **THEN** it receives the same synchronous secret-free catalogue as before, without an enablement field

#### Scenario: Read-through state
- **WHEN** the setting changes between two settings API reads
- **THEN** the second read reports the new state without a restart or cache expiry

### Requirement: Optional client version report
A provider definition MAY declare a client version operation that receives the resolved connection and returns the effective client version, a source code from a provider-documented set and an optional short detail. The version MUST match the value the provider's next request would send for that connection. Providers without the operation SHALL be treated as having no client version to report.

#### Scenario: Provider reports its version
- **WHEN** the client version of a connection whose provider declares the operation is requested
- **THEN** the result contains the effective version string, its source code and optionally a detail

#### Scenario: Provider without the operation
- **WHEN** the client version of a connection whose provider does not declare the operation is requested
- **THEN** no version is reported and no provider code or network request runs

### Requirement: Client version refresh
When the client version operation receives a refresh flag, the provider SHALL discard its cached local detection before resolving.

#### Scenario: Refresh requested
- **WHEN** the client version is requested with refresh for a provider that caches local detection
- **THEN** the cached detection is discarded and the reported version comes from a new detection

### Requirement: Client version report secrecy
A client version report MUST NOT contain secret values, secret references, tokens or raw command output.

#### Scenario: Report from a logged-in connection
- **GIVEN** a connection with stored credentials
- **WHEN** its client version is reported
- **THEN** the report holds only the version, the source code and the optional detail, without credentials or command output

### Requirement: Optional response control descriptors
A model descriptor SHALL be able to report typed speed choices (`standard`, `fast`, `ultrafast`) and output verbosity choices (`low`, `medium`, `high`) independently, with an optional advertised default verbosity. Omitted capabilities MUST NOT imply support. Existing providers and callers MUST NOT be required to supply new fields or use a new inference entry point.

#### Scenario: Capability belongs to a route, not a model name
- **WHEN** the same model slug advertises Fast on one connection and only Standard on another
- **THEN** callers see different supported choices for the two routes, not their union

#### Scenario: Unmodified provider
- **WHEN** a provider returns a descriptor without response controls
- **THEN** the descriptor remains valid and existing calls continue without a control lookup or forced wire options

### Requirement: Distinct maximum reasoning level
The SDK SHALL recognize `max` as an ordered level above `xhigh` across public reasoning inputs, outputs and normalization. A model MUST NOT acquire `max` merely because its existing `xhigh` maps to the native string `max`. `ultra` MUST NOT be an SDK reasoning level.

#### Scenario: Model advertises both top levels
- **WHEN** a model lists `xhigh` and `max` and a caller selects `max`
- **THEN** the requested and applied levels are both `max`; `xhigh` remains a separate choice

#### Scenario: Native alias is not a new SDK capability
- **GIVEN** an existing provider supports up to SDK `xhigh` and maps it to native `max`
- **WHEN** its catalogue is listed and `xhigh` is requested
- **THEN** the list does not gain `max`, and the existing wire value remains `max`
- **AND** an SDK caller requesting `max` on that route follows the existing nearest-supported-level rule rather than changing that provider's profile

### Requirement: Descriptors alone do not enable chat controls
Typed descriptors SHALL be readable for any provider. They MUST NOT by themselves opt a provider into Codex option names, chat consent or billing semantics. In this change only the Codex adapter has a defined chat dispatch contract; other providers MUST retain their existing option handling and MUST NOT gain selectable speed or verbosity controls in chat.

#### Scenario: Third-party provider reports display metadata
- **WHEN** a non-Codex provider reports Fast in its descriptor without implementing the Codex dispatch contract
- **THEN** SDK catalogue consumers can read the descriptor, but the picker offers no Fast switch and a chat request forwards no Codex options

### Requirement: Optional model-native link retrieval
A model provider MAY declare `nativeWebSearch`. For an authorized explicit search the SDK SHALL pass a search-scoped connection, the selected model, query, bounded limit and cancellation/deadline; the operation SHALL return structured sources. It MUST NOT make the provider an ordinary engine or enable implicit search in inference. Providers that omit the capability MUST remain valid and unchanged.

#### Scenario: Third-party model provider supplies its own search
- **WHEN** the inference that issued an authorized `acme` tool call had native search and its registration and account binding are still current
- **THEN** the operation receives the search-scoped connection and specified inputs; its structured sources enter the shared normalizer

#### Scenario: Unchanged provider
- **WHEN** an existing model provider with no native search is loaded and its agent requests a search
- **THEN** its declaration passes the existing SDK contract and the ordinary search engine handles the call

#### Scenario: Ordinary inference is unchanged
- **WHEN** a provider supporting native search receives a normal stream or one-shot inference request without an explicit websearch call
- **THEN** no search command or hosted search tool is added by this capability and the native search operation is not invoked

### Requirement: Tool-step authority for native search
Native search SHALL require server-issued authority for the active tool call, its issuing model and connection, the exact model-provider registration and its verified account binding. The SDK MUST reject stale authority at the final transport handoff, including after asynchronous credential or proxy work. Caller-supplied IDs, a mutable current model, an answer-model override or parent lineage MUST NOT grant authority.

#### Scenario: No trusted step
- **WHEN** a direct API or evaluation outside model tool dispatch passes a model, session, connection or account identifier with a search query
- **THEN** these values cannot authorize native lookup; the regular facade without a trusted step can search only through ordinary engines, and direct native dispatch is rejected

#### Scenario: Child routes are independent
- **WHEN** a Codex A agent delegates to a child using Claude without native search, or to a child using Codex B
- **THEN** the first child uses its ordinary engine and the second can use only B; neither inherits A's search authority

#### Scenario: Account or route changes after the model emits the tool call
- **WHEN** the reply authorizing a search came from route A but the model, connection or bound account changes before dispatch, including while credential resolution is suspended
- **THEN** the stale search fails before sending the query; it is not rebound to the new route and does not fall back

#### Scenario: Step ends before handoff
- **WHEN** work retained from a finished or cancelled tool step attempts native search
- **THEN** no provider request is dispatched under that step's authority

### Requirement: Account-bound connections for native search
For every native provider the SDK SHALL bind credential reads and transport to the issuing account. SDK-managed keys MUST match the credential revision used at inference; provider-managed logins MUST attest the same account generation and the revision of the credentials being sent. Missing proof MUST fail closed. Ordinary connection resolution and direct handler access MUST NOT expose an unrestricted native operation or grant native search authority.

#### Scenario: Third-party key changes on the same connection
- **GIVEN** an `acme` inference used key A and yielded a tool call without an engine override
- **WHEN** the same connection's key is replaced by B before search starts or while the callback is waiting for credentials or transport handoff
- **THEN** the call fails; neither key is used to send a search, and the ordinary engine receives no query

#### Scenario: Missing proof from a provider-managed login
- **WHEN** the issuing provider declared native search but cannot attest the issuing account generation or the credentials to be sent
- **THEN** the native search fails without dispatch; this is not treated as a provider without native search

#### Scenario: A plain connection or a retained native callback grants no authority
- **WHEN** a caller outside the issuing tool invocation resolves the same connection, or attempts to invoke a retained native operation or adapter helper with a plain connection
- **THEN** the resolver supplies no unrestricted native callback, and direct invocation is rejected before reading search credentials or issuing a provider request
