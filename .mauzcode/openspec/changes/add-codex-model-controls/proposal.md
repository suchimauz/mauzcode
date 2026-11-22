# Proposal

## Why

Two Codex subscriptions can advertise different speed tiers for the same model, but MauzCode currently discards those tiers, always sends medium verbosity and can discard an entire reasoning list when it encounters one unfamiliar level. Using the catalogue of the selected connection lets the user control the next response without guessing what an account supports or silently spending extra quota.

## What Changes

- Expose optional, typed speed and output-detail metadata on model descriptors. For Codex, scope discovery and cached capabilities to the authenticated account on that connection. Model listing and inference must use the same account header; opening the picker must not trigger discovery.
- Let SDK callers select supported Codex speed and verbosity through existing `providerOptions`. Standard speed and model-default verbosity omit the respective wire fields. Reject invalid explicit overrides before dispatch.
- Support `max` as a distinct reasoning level above `xhigh` when advertised. Keep recognized levels in a mixed Codex list, without guessing new ones or interpreting `ultra` as an effort.
- Let the owner set speed and output detail for one chat and one exact route. Restore valid choices after reload, but reset them on logout or a change of Codex account, even when the new account also supports Fast. Notify the owner on reset. Do not apply that consent to drafts, forks, children, internal work or independent SDK calls.
- Treat an account change as a boundary for OAuth writes, retries and opaque Codex continuation data. Within a verified generation, only an authoritative, complete catalogue publication may revoke choices on grounds of removed support.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `llm-provider-sdk`: optional model control descriptors and the ordered `max` effort.
- `llm-codex-provider`: interpret account discovery, validate options and translate them to Responses fields.
- `llm-model-cache`: preserve only validated per-connection capabilities, including the distinction between missing and explicitly unusable reasoning data.
- `agent-model-inference`: owner-only selection, reset delivery and dispatch of the next chat response.
- `llm-model-call`: preserve account identity on every retry, including ordinary calls.
- `native-todo-delegation`: validate explicit effort against the effective child route, including inherited routes.

## Impact

Touches the models SDK, Codex adapter, catalogue cache, agent/session persistence, frontend bridge and chat model picker. Existing providers need no new hooks. Codex stops forcing `text.verbosity: "medium"`; existing chats need not choose controls. **BREAKING**: unverified legacy Codex checkpoints cannot be replayed; recover from complete compatible history or report that a fresh chat is needed. No new credentials or external dependencies. Extended context windows, Ultra delegation, global defaults and changes to the native compaction request or strategy are out of scope. Account-scoped validation of existing checkpoints is in scope.
