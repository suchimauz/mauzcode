## Why

Standard agents lack the plugin tools needed for common specification, review, research and browser workflows. GitLab support currently depends on a user-local plugin, so granting it alone would not make it available in a clean MauzCode installation.

## What Changes

- Grant future Standard agents exactly these plugins by default: `openspec`, `git`, `websearch`, `browser`, `gh`, `terminal`, `glab`.
- Add only `projects.list` and `projects.get` to Standard's core permissions. Keep existing `planning.*` and `input.*` permissions unchanged.
- Update shipped defaults and untouched stored factory Standard definitions without rewriting existing agent snapshots or customized presets.
- Ship the existing read-only `glab` integration as an official plugin, retaining its identifier, API and security restrictions.
- Define safe coexistence with an existing user-local copy and document CLI/authentication prerequisites.
- Preserve deny precedence, child inheritance, human confirmations and Creator/Minimal behavior.

This stage authorizes specification artifacts only. Source changes, migrations, runtime configuration changes, plugin removal, installation, publishing and implementation are not authorized. Architecture Map, Icons, Redmine, Telegram, remote job inspection and administrative permissions are excluded.

## Capabilities

### New Capabilities
- `gitlab-read-integration`: Officially distributed, bounded, authenticated read-only GitLab access and installation compatibility.

### Modified Capabilities
- `agent-presets`: Standard's explicit plugin/core defaults, reset behavior and non-destructive upgrade of stored factory definitions.

## Impact

Future implementation affects `src/agentPreset`, preset upgrade tests and documentation, and introduces `plugins/glab` from the existing user-local package. Plugin discovery/registry compatibility must be verified without silently merging duplicate copies. External dependencies remain the installed `glab` CLI and existing host-specific authentication; browser and search prerequisites are unchanged. No external account or runtime state is changed by preparing this change.
