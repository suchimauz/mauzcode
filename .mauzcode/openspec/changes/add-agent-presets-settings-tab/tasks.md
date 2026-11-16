## 1. Implementation gate

- [x] 1.1 Obtain separate approval to implement; this change currently authorizes artifact preparation only.
- [x] 1.2 Inspect applicable instructions, the Apple Design skill, existing settings panels, bridge authentication and `agentPreset` list/default sources.

## 2. Backend endpoint

- [x] 2.1 Add `frontendBridge.agentPresets` (owner-only GET, 401/403/405, no-store) returning full presets, `defaultPresetId` and `defaultPresetMissing`.
- [x] 2.2 Route `/ui-lab-api/agent-presets` in `src/$middleware_ui-lab-api.ts`.
- [x] 2.3 Add endpoint tests: shape and order, default and missing default, 401, 403, 405 without state changes.

## 3. Frontend panel

- [x] 3.1 Add `frontend/src/lib/agentPresets.ts` client with response validation.
- [x] 3.2 Add `AgentPresetsPanel.tsx` with badges, default marker, rule lists, "none"/"everything" labels, prompt block, missing-default warning, explanatory note and loading/error/empty states.
- [x] 3.3 Register the "Agent presets" tab in `SETTINGS_TABS` and `SettingsDialog`, with styles using existing tokens.

## 4. Acceptance coverage

- [x] 4.1 Add panel tests for rendering, wildcard/empty labels, default marker, missing default warning, error/retry, empty state and absence of write controls.
- [x] 4.2 Confirm the existing new-session test still proves that rules are not exposed in the menu response.
- [x] 4.3 Run backend and frontend tests and type checks for the touched areas.

## 5. Documentation

- [x] 5.1 Document the Settings view and owner endpoint in `docs/agent-presets.md`.
