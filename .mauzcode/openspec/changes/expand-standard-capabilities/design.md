## Context

See proposal.md for motivation and scope. `src/agentPreset/defaults.ts` currently derives core grants from `coreCatalogue.ts` and ships Standard with no plugins. The catalogue already grants `planning.*` and `input.*`; project discovery is not granted. Presets are stored definitions and agent creation takes independent snapshots. Boot restores missing built-ins, not edited definitions.

The inspected stored Standard matches the prior factory configuration. The user-local glab package contains a manifest, SKILL.md, `read.ts` and `read.test.ts`. It currently uses a fixed read-only CLI API. Plugin discovery has legacy and registry-controlled paths: filesystem presence alone must not be treated as proof of the active implementation.

This change is documentation-only at this stage. All implementation tasks require a separate approval.

## Goals / Non-Goals

**Goals:** Define testable default grants, conservative upgrade semantics, and independently shipped GitLab access without weakening existing guards.

**Non-Goals:** Change existing snapshots, turn presets into a sandbox, add GitLab write/log/file APIs, install CLIs, authenticate accounts, remove the user copy, change the live registry, or implement code during preparation.

## Decisions

1. **Explicit grants instead of wildcards.** Add seven plugin IDs to the shipped Standard and only two project functions to the catalogue. Broad `plugins: ["*"]` or `projects.*` would grant unrelated capabilities. Keep existing planning/input permissions and leave Creator/Minimal unchanged.
2. **Conservative stored-definition upgrade instead of unconditional reset.** A one-time upgrade compares all user-configurable fields against a fixed copy of the factory Standard definition shipped before this change. The migration must embed that historical baseline or use a fixed fixture; it must not derive the baseline from the current defaults or core catalogue. Ignore storage timestamps and rule ordering, but preserve every meaningful difference in user-configurable fields; any such difference prevents automatic upgrade. Upgrade only matching definitions; preserve customized definitions and document explicit opt-in. This avoids boot overwrites and does not reinterpret existing snapshots. Use the project's migration mechanism during implementation, not ad hoc live SQL.
3. **Official package with stable identity instead of an external path dependency.** Place the reviewed glab package under `plugins/glab`; retain ID `glab`, `glab.read`, fixed resources, bounded execution and safe errors. Adapt test fixtures and documentation to official conventions. Runtime tests must mock the CLI and never access real user credentials.
4. **Explicit duplicate-root resolution instead of silent override.** Reuse the registry's explicit root selection where available. If legacy discovery permits ambiguous duplicate glab roots, provide an actionable conflict rather than merging implementations. Do not change global plugin precedence as an incidental shortcut. Selecting the official root on an existing installation is a separately approved deployment operation; user files remain intact.
5. **Grants are not service setup or action approval.** Existing confirmation paths, Plan mode, deny patterns and inherited restrictions remain authoritative. Document browser/search and GitLab prerequisites instead of automatically configuring them.

## Risks / Trade-offs

- Broader default tool access → explicit finite grants, regression tests for denials and confirmation paths, no administrative additions.
- Customized Standard does not automatically receive new defaults → preserve user intent and document opt-in.
- Old snapshots retain existing grants → intentional compatibility; do not market this as retroactive access removal or expansion. Snapshots freeze rules, not plugin implementation versions.
- Duplicate glab roots behave differently in legacy and registry discovery → test both supported paths before rollout and require explicit selection or an actionable conflict.
- Official distribution does not ensure CLI authentication → clear safe prerequisite failures, no automatic installation/login.
- Existing fixture assumptions say Standard grants no plugins → update only assertions changed by the new contract, retaining negative and inheritance coverage.

## Migration Plan

Future implementation, after separate approval:
1. Add the official package, update defaults/catalogue and tests/documentation.
2. Add an idempotent factory-only preset upgrade; retain user-customized presets and every agent snapshot.
3. Verify clean-install discovery and duplicate-root handling with isolated fixtures. Document explicit mount selection for installations with a user copy.
4. Run targeted tests, a settled-batch full typecheck and code quality checks. Validate the OpenSpec change.
5. Deploy through the normal authorized process. Do not implicitly restart this server or remove the user copy.

Rollback restores the prior shipped code and, if explicitly authorized, the previous stored factory definition only when still untouched. It must not rewrite snapshots created with the new rules or reset later customizations. Missing plugin grants remain subject to existing missing-plugin semantics.

## Deferred implementation verification

The exact migration registration file and the current duplicate-root error/selection mechanics need source-level verification before implementation. The acceptance contract is fixed: conservative definition upgrade and explicit duplicate selection or actionable conflict, never silent mixing. These are implementation verification tasks, not claims that current discovery already satisfies the new contract.
