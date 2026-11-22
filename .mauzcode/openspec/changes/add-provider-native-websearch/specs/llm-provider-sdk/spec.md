# Spec Delta

## ADDED Requirements

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
