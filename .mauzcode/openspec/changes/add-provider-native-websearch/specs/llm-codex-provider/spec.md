# Spec Delta

## ADDED Requirements

### Requirement: Subscription search for structured sources
For an explicit native search Codex SHALL request live web sources through the selected connection: one bounded `search_query` POST with the selected model and JSON boolean `settings.external_web_access: true`. It MUST NOT switch to cached-only mode or send transcripts, instructions, tools, attachments or continuation state. It SHALL consume only structured sources, distinguish an empty list from an invalid response, and honor cancellation and the deadline during send and read.

#### Scenario: Wire capture for a normal search
- **WHEN** a Codex agent step searches for a phrase and the selected connection uses a proxy
- **THEN** the mock endpoint captures exactly one POST to `/backend-api/codex/alpha/search` with the phrase, selected model, `commands.search_query` and `settings.external_web_access` equal to boolean `true`; it receives no chat contents and there is no inference or direct-network attempt
- **AND** the caller receives normalized titles, links and available snippets from the response's sources

#### Scenario: Live search rejected
- **WHEN** the endpoint rejects the live request
- **THEN** the caller receives a safe error after that single attempt; no cached-only request or search through another engine is sent

#### Scenario: Empty result versus broken response
- **WHEN** the search endpoint returns a valid empty `results` array, a JSON object missing `results`, plain prose or a truncated or oversized response
- **THEN** only the valid empty list succeeds; the other responses fail safely without converting generated text to links or querying another source

#### Scenario: Bound the body and cancel transport
- **WHEN** the response is chunked without a length header and exceeds its size limit, or the caller cancels or times out during the read
- **THEN** the read is aborted and a bounded error is returned without leaking response bodies, account headers or credentials

### Requirement: Account-bound Codex search authorization
Native search SHALL require a verified account binding. The bearer token and account header MUST belong to that binding on the same connection. Authorization, proxy selection and final dispatch MUST use the existing connection controls. A changed or unknown binding MUST NOT send a query, and a late failure MUST NOT invalidate a newer credential revision or account. Errors MUST NOT retry on a different account, transport or engine.

#### Scenario: Two signed-in connections and an unverified account
- **WHEN** step A searches while B is also signed in
- **THEN** only A's credential and account header are used; absent or unverified identity for A fails without a search HTTP request even if B is usable

#### Scenario: Replacement or logout before handoff
- **WHEN** the step is bound to A and the connection changes to B, or logs out and back in as A, before transport handoff
- **THEN** no search is sent for the stale generation and there is no replay for the replacement account

#### Scenario: Late rejection after credential renewal
- **WHEN** an already dispatched search returns HTTP 401 after a same-account credential renewal or an account replacement
- **THEN** the old search fails; it does not alter the current login, catalogue or preferences and is not replayed
