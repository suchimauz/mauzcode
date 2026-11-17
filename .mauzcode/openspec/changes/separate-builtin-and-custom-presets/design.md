# Design

## Context

See proposal.md for motivation. `agentPreset.defaults` already returns fresh built-in definitions and generates Standard's allow list from `coreCatalogue`. However, `get` and `list` read only `agent_presets`, `resolve` calls `get`, `update` accepts built-in rows, `reset` upserts factory values, and `$start` calls `ensureBuiltins` with `ON CONFLICT DO NOTHING`. Historical migrations upgrade only recognized factory rows.

Read-only inspection confirmed the live table has `id`, `name`, `description`, `sort_order`, `builtin`, JSONB rule fields, `prompt` and `updated_at`. Live Standard has different description and grants, with plugins `nrepl` and `openspec`; shipped Standard grants `openspec`, `git`, `websearch`, `browser`, `gh`, `terminal`, `glab`. This is evidence of the old customization contract, not grounds to discard the stored configuration.

Existing agents carry independent snapshots. The owner endpoint (`src/frontendBridge/agentPresets.ts`), new-session consumers and `frontend/src/components/settings/AgentPresetsPanel.tsx` must agree with resolution without exposing full rules in the lightweight session menu.

## Goals / Non-Goals

**Goals:** Establish exactly one authority per definition kind, eliminate built-in drift without synchronization jobs, and migrate legacy records without losing customizations.

**Non-Goals:** Change access semantics or factory grants, retrofit existing agent snapshots, implement a new editor, introduce a new source registry or write custom presets to disk.

## Decisions

### 1. Use generated code definitions, not synchronized database mirrors

Keep `agentPreset.defaults` as the canonical generator. `get` resolves reserved identifiers from this generator before consulting PostgreSQL. `list` merges fresh generated definitions with custom rows, excludes reserved-ID shadows and sorts by `sort_order`, then `id`. Existing `builtin` conveys source kind; built-ins retain deterministic `updated_at: 0`. `resolve`, default validation and UI bridges consume these APIs rather than querying preset rows directly. Return independent values so a caller cannot mutate subsequent results.

Alternative rejected: overwrite built-in rows on every boot or version bump. That still introduces two representations, stale reads during upgrade, and ongoing synchronization requirements. Code generation here means generating runtime definition objects, not generating source files from database content.

### 2. Reserve built-in IDs and restrict persistence to custom definitions

Guard create, update and remove by the canonical built-in identifier set, even with an empty table or a misleading legacy `builtin` flag. Use custom-row predicates for mutations. Preserve validation, authorization and protection of the configured custom default. Custom creation from builtin fields uses the existing create API with a distinct ID and writable fields only; no new clone API is necessary.

Keep `reset` for compatibility as a side-effect-free operation returning the current built-in definition; reject custom IDs. Its existing capability gate stays unchanged. Remove active boot seeding and make any retained `ensureBuiltins` compatibility entry point non-writing. Historical migrations remain historical; a forward migration cleans their rows before agents resume, and no later startup hook recreates them.

Alternative rejected: permit per-field overrides on built-in IDs. That recreates the ambiguity the change eliminates. Removing reset outright is unnecessary API churn.

### 3. Preserve differing legacy definitions as custom records

Use one transactional forward migration after the existing preset migrations. Process rows with reserved IDs and any other legacy `builtin=true` rows. For reserved IDs, compare every editable field against current code, treating rule arrays as order-insensitive sets and ignoring timestamps and storage flags. A mismatch is preserved even if it might merely be an older factory version: provenance cannot reliably distinguish old defaults from intentional customization.

For differing reserved rows, allocate `<id>-custom`, then `<id>-custom-2`, etc. while checking both code IDs and existing rows. Preserve all rule fields, description, sort order, prompt and timestamp; use a recognizable display name such as `Standard (preserved custom)`. Delete the obsolete reserved row only after successful insertion in the same transaction. Equal rows need no custom copy. Non-reserved legacy `builtin=true` records retain their ID and fields and become custom. Serialize migration and protect it from concurrent preset writes; retry identifier conflicts without overwriting data. Transaction rollback preserves originals; after success, absence of obsolete rows makes reruns no-ops.

Do not change `agentPreset.default`, agent `preset_id` or `preset_snapshot`. A default of `standard` deliberately starts using current code for future agents. Selecting the preserved custom preset, including as a default, is a separate explicit choice. Report preserved ID mappings through migration diagnostics and documentation without logging prompt contents.

Alternative rejected: discard differing rows, silently change the default to the preserved custom record, or update old snapshots. These either lose data, hide the requested correction, or violate the established snapshot contract.

### 4. Keep consumers consistent and source presentation honest

Owner Settings returns the full merged catalogue, preserving auth, read-only behavior and no-cache headers. Session defaults keep their existing minimal field projection and sorting. Settings uses `builtin` to display code-managed provenance and avoids formatting `updated_at: 0` as a real update date. Custom cards retain actual database timestamps. No new frontend mutation controls are introduced.

Alternative rejected: show raw stored rows in Settings while creation uses generated definitions; that would preserve the reported discrepancy in the interface.

## Risks / Trade-offs

- [A customized default Standard gains the shipped grants for future agents] → Make this breaking change explicit; preserve old settings as a visible custom choice; never rewrite existing snapshots.
- [Old factory versions become extra custom presets] → Prefer recoverability over guessing provenance; use clear preservation names and collision-safe IDs.
- [Historical migrations briefly write built-ins on a fresh database] → Run the forward cleanup before agents resume; assert that the final table contains only custom records and subsequent boot/read paths write no built-ins.
- [New code-defined IDs collide with existing custom IDs] → Require the same lossless migration discipline before shipping such IDs; never silently discard a custom definition.
- [Direct SQL consumers retain database-only behavior] → Audit all preset-table consumers and add end-to-end assertions across resolution, owner Settings and session defaults.
- [Rollback to old binaries expects built-in rows] → Treat downgrade as a maintenance operation, not a destructive automatic down migration.

## Migration Plan

1. Implement and test the new resolver and custom-only mutations together with the forward migration and removal of active boot seeding.
2. Test empty, factory-only, customized, collision and mixed legacy databases using isolated Postgres fixtures. Check atomic failure, reruns and unchanged snapshots/defaults.
3. With deployment-specific approval, back up the affected data and run normal migrations before agents resume. Verify that built-ins resolve exactly to code and preserved custom IDs are discoverable. Do not perform production migration as part of writing this proposal.
4. Update documentation to explain the source split, compatibility reset and opting into preserved custom definitions.
5. If downgrade is necessary, obtain separate maintenance approval and restore from the backup or explicitly reconstruct the old built-in rows before loading old code; preserve new custom records and agent snapshots. Do not provide a rollback that silently deletes preserved data.
