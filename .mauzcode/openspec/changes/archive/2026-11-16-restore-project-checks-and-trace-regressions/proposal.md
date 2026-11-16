## Why

The recorded fast suite has 86 failures (3557 passes, 12 skips), and the full typecheck has 330 diagnostics across 124 files. These failures prevent a trustworthy project-wide acceptance signal; their relationship to recent changes must be investigated rather than inferred from timestamps or unchanged file paths.

## What Changes

- Establish a complete failure ledger from the existing logs, including every failing test and type diagnostic, with reproducible evidence and explicit confirmed, candidate, or unattributed change links.
- Repair test fixtures and implementation defects against the current model-routing, public facade, preset/discovery, plugin, transport, and UI contracts; do not restore retired production APIs merely to satisfy stale mocks.
- Investigate generated registry/type availability and optional/private integrations separately from core defects. Preserve type-generation boundaries and fix the source of declarations rather than editing generated files.
- **BREAKING (owner-approved private extensions only):** remove the code of `discovery`, `telegram-bot`, and local `myhealthGaps`, preserving backups, database records, settings, secrets and history. The owner approved the implementation plan and separately confirmed these exact three paths; all other plugins remain. Verify dependencies and stop affected handlers before removal.
- Restore a green fast suite and complete project typecheck without new exclusions, weakened assertions, blanket casts, or added skips used to hide failures.

## Capabilities

### New Capabilities

- `project-check-integrity`: Evidence-backed project verification, explicit change attribution, complete failure accounting, and owner-approved optional-plugin disposition.

### Modified Capabilities

None. Existing runtime requirements remain the repair target. If investigation identifies a necessary behavioral change, revise this proposal and the relevant existing capability delta before implementing it.

## Impact

Likely repair areas include agent inference/compaction fixtures, models public facade tests, preset/plugin discovery, generated registry inputs, proxy test database fixtures, frontend types, and private `.mauzcode` integrations included by the declared typecheck. Existing evidence is `.mauzcode/tmp/oi/{fast.log,typecheck.log,summary.json,fast.exit,typecheck.exit}`. Candidate historical links include `migrate-runtime-to-models`, `reorganize-models-internals`, `add-agent-presets`, `scope-preset-discovery`, `optimize-agent-preset-prompts`, and `add-opencode-go-provider`; these are not causal findings. Implementation is now owner-approved, including separately confirmed removal of `/home/suchimauz/.mauzcode/user/discovery`, `/home/suchimauz/.mauzcode/user/telegram-bot`, and `/home/suchimauz/mauzcode/.mauzcode/myhealthGaps`. No production database changes, live provider calls, commits or publishing are authorized. Preserved baseline evidence and the 416-item initial ledger are in `.mauzcode/tmp/ol/`; extension backups are in its `backups/` directory.
