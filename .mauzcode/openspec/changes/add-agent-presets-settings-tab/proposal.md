## Why

Agent presets (Standard, Creator, Minimal and custom presets) decide which functions and plugins new agents receive, but their definitions are visible only through runtime calls. The owner cannot see in Settings what each preset allows, denies or grants, or which preset new sessions use by default.

## What Changes

- Add a read-only **Agent presets** tab to the Settings dialog next to Models, SSH Instances, Notifications, Updates and SOCKS5.
- List every stored preset in server order with name, identifier, description, built-in/custom badge, default-for-new-sessions marker and full rules: allow, deny, plugins, excluded prompt sections, additional prompt and last update time.
- Add an authenticated, owner-only, GET-only bridge endpoint `/ui-lab-api/agent-presets` returning full preset definitions and the configured default preset identifier.
- Keep the new-session endpoint unchanged: it still exposes only menu fields.

Out of scope: creating, editing, resetting or deleting presets; changing the default preset; viewing per-agent snapshots; plugin UI contributions.

This stage authorizes specification artifacts only. Source changes and implementation require separate approval.

## Capabilities

### New Capabilities
- `agent-presets-settings-ui`: Read-only Settings tab and owner bridge endpoint for viewing stored agent preset definitions.

### Modified Capabilities
- `agent-presets`: Clarifies that full definitions are visible to the authenticated owner through a read-only view while the new-session menu keeps exposing only menu fields.

## Impact

Future implementation adds `src/frontendBridge/agentPresets.ts`, a route in `src/$middleware_ui-lab-api.ts`, `frontend/src/lib/agentPresets.ts`, `frontend/src/components/settings/AgentPresetsPanel.tsx`, a `SETTINGS_TABS` entry, styles, tests and a section in `docs/agent-presets.md`. No database schema, migration, preset definition or agent snapshot changes.
