# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Wrapped Gemini turns and tool continuity`
- TO: `### Requirement: Wrapped Antigravity turns and tool continuity`

## REMOVED Requirements

### Requirement: Account-scoped Gemini catalogue
**Reason**: The Gemini-only filter conceals Claude models that the same account advertises. The account-scoped Gemini and Claude catalogue below replaces it, retaining the project, visibility and non-generating test constraints.
**Migration**: Refresh the same signed-in connection; no re-login or account change is required. Saved routes are not migrated: a route works only while its model is in the current catalogue.

## ADDED Requirements

### Requirement: Account-scoped Gemini and Claude catalogue
The provider SHALL resolve the signed-in account's project and offer only its visible, non-disabled Gemini and Claude models. It MUST show one choice per advertised group with eligible members and keep eligible ungrouped models as individual choices. It MUST NOT turn service-only, unsupported-family or unlisted IDs into choices. The connection test SHALL verify authorization, project access and discovery without generating.

#### Scenario: Mixed inventory
- **WHEN** a response contains grouped Gemini and Claude variants, an ungrouped visible Gemini, a disabled variant, GPT-OSS and a service-only model
- **THEN** the picker offers each eligible group once and the standalone Gemini once, without separate rows for group members or entries for the excluded models
- **AND** the same visible ID appearing in multiple inventory lists does not create another choice

#### Scenario: Group key collides with a native ID
- **WHEN** a group key equals the ID of a separate visible native model, or one native ID is claimed by two groups
- **THEN** the ambiguous group gets no effort choices and its eligible native models are offered as standalone choices, so the native route still denotes that exact model

#### Scenario: No accessible project or no models
- **WHEN** the account has no accessible project or discovery succeeds with no eligible models
- **THEN** the connection test distinguishes project access failure from an empty catalogue, without generating or inventing a project, group or fallback model

### Requirement: Exact group variant dispatch
A group route SHALL publish its members as SDK reasoning variants, with the response's default agent model as default member only when it belongs to that group. The request SHALL name the SDK-chosen native member on the same connection with no separate thinking level. A standalone route SHALL send its own ID. A route absent from the current catalogue MUST fail `MODEL_UNAVAILABLE` before generation, never switching family, account or service.

#### Scenario: Explicit effort selects a model, not a second effort override
- **WHEN** the user selects `xhigh` on a group whose eligible member for that level is `gemini-4-neon-xhigh`
- **THEN** the Antigravity request names `gemini-4-neon-xhigh` verbatim; it does not send the group key as the model or override the member with a conflicting thinking level

#### Scenario: Auto chooses a member deterministically
- **WHEN** the provider's default ID belongs to a different group or is no longer eligible
- **THEN** `auto` chooses the first eligible member of the selected group in listing order, not the first key in the model dictionary or a default from another group
- **AND** an eligible declared default in the selected group takes precedence over that order

#### Scenario: Saved level missing from the group
- **WHEN** a chat saved `xhigh` and its group now backs only `low`, `medium` and `high`
- **THEN** the request names the `high` member, following the SDK nearest-level rule, and sends no thinking level

#### Scenario: Route no longer in the catalogue
- **WHEN** a saved route names a native member ID, a removed group or a model of the old Gemini-only catalogue that is not a current choice
- **THEN** the request fails `MODEL_UNAVAILABLE` without a generation request; no member, group or neighbouring model is substituted

### Requirement: Measured Antigravity quota by native model
The provider SHALL read `quotaInfo` for provider-visible, eligible native IDs before collapsing catalogue groups. Each observation SHALL retain the connection, structured family from `modelProvider`, native model identity, remaining fraction and reset time when reported. Missing data MUST remain unknown. The report MUST NOT infer a quota pool, a period, or a distinct Gemini Pro/Flash allowance from names, identical values or time until reset.

#### Scenario: Independent measurements from one account
- **WHEN** two eligible Gemini IDs and one Claude ID carry quota information in the same inventory
- **THEN** their measurements remain attributable to the three native IDs and their respective families, even when the two Gemini IDs become one picker choice or all three values match
- **AND** a local picker disable does not change what the provider measured; an unrelated service or unknown provider does not contribute to either family

#### Scenario: Unit conversion and missing fields
- **WHEN** one entry reports `remainingFraction: 0.75` and a valid reset time, one reports `0`, and another reports only a reset time
- **THEN** the standard report records 25% used, 100% used and unknown usage respectively, keeping each known reset with its own observation
- **AND** an absent or invalid fraction or timestamp does not discard the other valid field or turn unknown usage into exhaustion

## MODIFIED Requirements

### Requirement: Inventory model metadata
Each model SHALL use its inventory limits, leaving absent limits unspecified, and carry no price. A group's reasoning choices SHALL come only from its `groupedModels` entry's `supportedThinkingLevels` that resolve to distinct eligible native IDs with thinking not explicitly disabled. Labels, numeric levels, suffixes or a thinking-support flag alone MUST NOT create selectable levels. A standalone model without evidence of a choice SHALL offer no effort selector.

#### Scenario: Reported limits and levels
- **WHEN** a Gemini 3.8 Flash group advertises `low`, `medium` and `high`, all three visible native members share reported context and output limits, and no member for `minimal` is advertised
- **THEN** the group shows the reported limits and exactly those three levels; `minimal` is not offered even though an older Flash profile included it

#### Scenario: Missing metadata
- **WHEN** an ungrouped entry omits its limits and marks thinking as unsupported
- **THEN** the model has no provider limits, no reasoning levels and no price

#### Scenario: Group link is not proof of availability
- **WHEN** a group declares four suffixes but one has no corresponding visible native ID and another member explicitly disables thinking
- **THEN** neither level is offered, and no request can be made by inventing an ID from the group key and a suffix

### Requirement: Wrapped Antigravity turns and tool continuity
The provider SHALL send the selected native Gemini or Claude ID and the account project in the Antigravity envelope, with the inner request in Gemini `generateContent` format for both families. It SHALL normalize wrapped events into SDK text, tool calls, finish status and reported token usage, preserving each tool call's own opaque continuation data and never fabricating a signature.

#### Scenario: Tool round trip
- **WHEN** a Gemini stream returns two function calls with different signatures and the agent sends their results on the next turn
- **THEN** each call retains its own signature and result association in the next Gemini request, and the resulting text streams to the agent

#### Scenario: Normal completion
- **WHEN** a stream returns text followed by a terminal reason and usage
- **THEN** consumers receive incremental text and one normalized completion with the reported usage

#### Scenario: Claude generation and continuation
- **WHEN** a selected Claude member streams a tool call and the agent returns its result
- **THEN** both requests use the exact selected Claude native ID on the same Antigravity connection; the tool result is correlated with the original call, provider-required continuation data is preserved and the final text and usage reach the agent
- **AND** successful catalogue discovery on its own does not satisfy this scenario
