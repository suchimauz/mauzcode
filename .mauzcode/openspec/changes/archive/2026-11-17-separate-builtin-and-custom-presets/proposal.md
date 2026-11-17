# Proposal

## Why

Built-in presets are currently copied into PostgreSQL and then read from that copy, so shipped changes do not reliably reach new agents. The live `standard` already differs from code in description, core grants and plugin grants; two independently editable definitions make its behavior ambiguous.

## What Changes

- **BREAKING**: Built-in `standard`, `creator` and `minimal` become read-only definitions generated from shipped code. Database rows cannot override them, and startup no longer seeds or upgrades their stored copies.
- Custom presets remain editable PostgreSQL records and are never generated into source code. A single catalogue combines code-defined built-ins and database-defined custom presets for reading, selection and snapshot creation.
- **BREAKING**: Editing a built-in requires creating a custom preset under a distinct identifier. Built-in identifiers are reserved; reset remains a read-only compatibility operation returning the current code definition.
- Migrate legacy built-in rows without losing settings: preserve differing definitions as uniquely named custom presets before removing obsolete rows. Keep configured default identifiers and existing agent snapshots unchanged; explicitly document that a default of `standard` now means shipped Standard.
- Show the same effective definitions in Settings and session creation. Mark built-ins as code-managed rather than displaying a fictitious database update date.
- Replace conservative stored-Standard upgrades and in-place customized-Standard opt-in with the code/custom source contract.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-presets`: Separate definition sources, reserve built-in identity, enforce read-only built-ins, preserve legacy customizations, and use one effective catalogue without changing snapshot guardrails.
- `agent-presets-settings-ui`: Read the combined catalogue and accurately present code-managed versus database-managed definitions.

## Impact

Affects `src/agentPreset/` definitions, reads, writes, boot hooks, migrations and tests; owner preset and new-session consumers; Settings preset presentation; and `docs/agent-presets.md`. No new dependency is needed. Existing access checks, parent/child intersections, approval requirements and immutable snapshots stay unchanged. Out of scope: refreshing existing agents, adding an editor UI, changing shipped grants, committing or deploying this proposal.
