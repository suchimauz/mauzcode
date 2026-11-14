# Design

## Context

See proposal.md for motivation. `frontend/src/lib/models.ts` already exposes provider, disabled state, connection identity and route parsing. Its `modelGroup` currently prefers account-only labels while `modelGroupKey` already separates connections. `ModelPicker.tsx` renders disabled choices and unavailable groups; these require separate filtering rules. Existing availability specs permit either hiding or marking disabled choices, whereas settings intentionally keep them visible.

## Goals / Non-Goals

**Goals:** Apply one consistent presentation policy to shared picker consumers while preserving route identity, current selection and server enforcement.

**Non-Goals:** No new provider registry, database changes, routing changes, automatic replacement of existing chat models, or changes to settings management. This preparation produces documents only.

## Decisions

1. Filter selection options before searching and grouping. Exclude disabled options and options belonging to disabled connection metadata. Apply enabled-state filtering separately to unavailable-catalogue notices; do not confuse disabled connections with enabled connections whose catalogue failed. Omit empty filtered groups. Do not remove records from settings or persisted catalogues: backend-wide deletion/filtering would prevent management and recovery.
2. Use `provider · account` headings, adding SSH host context where present. Here “name” means the connection/account name used by today's group headings. Preserve connection-id keys and route-based fallback identities; do not group by a concatenated display label. Provider-only grouping would incorrectly merge distinct accounts.
3. Show the selected model's provider in the closed chat model control alongside the existing shared model name, retaining account context if already present. Use catalogue/route provider identity, with the existing route parser as fallback when the selected entry is missing. Do not use inferred brand icons as provider identity: custom routes can serve models of any brand. Do not globally append provider text to shared model names.
4. Keep existing accessibility, tokens and compact control hierarchy. Include provider in accessible control text; avoid tooltip-only disclosure and preserve keyboard navigation, focus and responsive layouts. No new animation is needed.
5. Existing chats retain their selected route if it becomes disabled; removing a picker option does not authorize silently changing a chat. Existing server checks continue to reject use of that route. New-session fallback behavior remains unchanged.

## Risks / Trade-offs

- Longer labels can crowd narrow headers → retain the current compact visual hierarchy and test narrow layouts, ensuring provider remains visible.
- Disabled and unavailable states can be confused → test disabled unavailable connections separately from enabled unavailable connections.
- Shared picker changes affect both drafts and existing chats → cover both consumers and route persistence in regression tests.
- Existing tests may encode account-only headings → update expectations while preserving distinct connection keys and SSH context.

## Migration Plan

No data migration or API break is expected. In a later implementation, update shared helpers and consumers, add regression coverage and run relevant frontend checks. Rollback is a UI code revert; stored model routes and availability policy remain intact.
