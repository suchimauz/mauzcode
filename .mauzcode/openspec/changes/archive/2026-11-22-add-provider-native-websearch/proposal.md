# Proposal

## Why

Agents already ask `websearch.search` for links. A Codex chat should be able to search with its own subscription without making that subscription a global engine that another chat, model or account can spend.

## What Changes

- Move the public websearch facade, result normalization and ordinary search-provider loader into core. Keep Google Browser, OpenSERP and Brave in the official plugin, and keep third-party `$websearchProvider` declarations working.
- Add optional `nativeWebSearch` to model providers. An explicit ordinary `engine` wins. Otherwise use the capability of the provider registration that produced the tool call, not a later one. Use the ordinary default only outside model-tool dispatch or when that inference lacked native search. Loss or replacement of a selected native source is an error, not permission to send the query elsewhere.
- Require the SDK to bind native requests to the issuing step and account, including for third-party providers. Implement Codex first: one separate live web request for sources, with no transcript, no implicit inference tool and no globally selectable subscription engine.
- Preserve grants, denials, settings and public result shapes. Agents with the `websearch` grant can still discover the allowed facade under that plugin even when its engine handlers are denied. `read`, `fetch`, and the reading and answer-generation stages of `answer` keep their existing behavior.

## Capabilities

### New Capabilities

None; the existing search, Models and preset contracts own this behavior.

### Modified Capabilities

- `websearch-provider-sdk`: core-owned public search, choice between a model-native and an ordinary source, and source reporting without fallback.
- `llm-provider-sdk`: an optional, cancellation-aware operation bound to the model connection of an authorized tool step.
- `llm-codex-provider`: subscription search for structured sources using the selected Codex account and transport.
- `agent-presets`: preserve the websearch grant and its denials after the facade moves to core; discovery and nested calls must respect them.

## Impact

Affects `src/websearch` (new), `plugins/websearch`, the Models SDK and Codex adapter, agent tool dispatch, preset access/discovery, and provider-author documentation. The existing `websearch.*` settings and provider IDs remain valid; no account migration or new secret is needed. Codex's external search endpoint is a compatibility dependency, not an API guarantee. Acceptance uses isolated storage and mock transports, not real subscriptions.
