# Proposal

## Why

Large shell outputs consume agent context even when only a compact summary is useful. RTK is already installed locally, but MauzCode needs an explicit, observable, safely disableable integration rather than agent-specific hooks or ad hoc command rewriting.

## What Changes

- Ship an official `plugins/rtk` integration, disabled by default, for local `tools.bash` calls only.
- Add reusable, explicitly granted `settingsSections` to the public UI SDK and a host-owned Plugin Settings page. RTK supplies its own section through this contract.
- Show availability separately from enabled state, with a dedicated availability check, executable path, version, last check time and safe failure reason. Enabling requires a fresh successful backend check.
- Prepare eligible commands through `rtk rewrite`, using RTK's own supported-command logic. Preserve the original command when no rewrite applies.
- Add per-call `rtk:false` to bypass automatic processing without changing the instance setting.
- Disable RTK and execute the original command once on a technical preparation failure, provided the caller's deadline has not expired. Never fall back through a rewrite denial or retry a command after execution starts.
- Preserve MauzCode's authorization rules; rewrite exit code 3 delegates authorization to MauzCode and does not introduce a new confirmation dialog.

## Capabilities

### New Capabilities

- `plugin-settings-sections`: Granted plugin-owned settings sections hosted through the public SDK, with lifecycle handling and unchanged backend authorization obligations.
- `rtk-shell-integration`: Instance-level RTK availability, guarded enablement, local shell preparation, explicit bypass, failure semantics and execution observability.

### Modified Capabilities

None. Existing model-provider/settings specifications are not changed: this adds a general plugin settings surface, not a model-provider form.

## Impact

- Core: `tools.bash`, its schema/documentation and callers, a minimal optional preparation seam, and existing tool-run command metadata.
- SDK/UI: public types, registry, installed Settings pages, plugin runtime, server UI grants/compile/manifest approval identity, documentation and tests.
- Plugin: `plugins/rtk` backend, guarded owner APIs, instance state and `ui/index.tsx` using React and `@mauzcode/ui` only.
- External dependency: a working RTK executable on the server PATH; RTK 1.2.0 is the verified protocol reference. No installer, updater, Claude/Codex hooks or private plugin dependency.
- Excluded: SSH processing, interactive Terminal, non-shell tools, model/API compression, automatic raw-output replay and savings dashboards.
- Default-off rollout is additive. Core frontend changes need the normal frontend build; plugin UI uses runtime plugin compilation.

## Approval Boundary

This stage creates and validates OpenSpec artifacts only. All implementation tasks remain unchecked. Implementing or enabling RTK requires a separate user request; do not archive this change, modify other changes, commit or push as part of preparation.
