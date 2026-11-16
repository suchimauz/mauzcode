## Context

See proposal.md for motivation. The stored preset id is `standard`; `standart` does not exist. Shipped defaults already grant OpenSpec. The stored customized preset has `plugins: ["nrepl"]` and no denies. Preset snapshots are immutable creation-time rules.

## Goals / Non-Goals

**Goals:** Enable the full mounted OpenSpec namespace for future Standard agents while retaining customization.

**Non-Goals:** Changing shipped defaults, applying all factory plugin grants, rewriting snapshots, resetting the preset, introducing a migration, or bypassing protected actions.

## Decisions

Use the supported preset management API to read the current definition and update only `plugins` with the union of existing entries and `openspec`. Do not use `reset`, which would lose customizations, or replace the list with only OpenSpec. No allow wildcard is needed: plugin identity grants all declared namespaces.

Add regression coverage using isolated test storage for additive updates, full OpenSpec access and frozen old snapshots. Replace the destructive-list documentation example with an additive example. Verify the live stored row and access decisions after the update.

## Risks / Trade-offs

- Existing agents remain restricted → explicitly report that a new Standard agent is needed.
- Read/modify/write could race another editor → re-read immediately before updating and verify all unrelated settings afterwards.
- Plugin grants do not replace operation approvals → retain the existing approval and deny contracts.

## Migration Plan

No schema migration or restart. Apply one authorized stored-preset update and read it back. Any later reversal should remove only the added OpenSpec entry through the same API and requires a separate user request; never reset unrelated customization.
