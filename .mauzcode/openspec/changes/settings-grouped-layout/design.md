# Design

## Context

Settings lives in `frontend/src/components/settings/` (one panel per tab, shared `settings.css`, `SettingsDialog.tsx`) plus `frontend/src/core-ui/socks-proxies.tsx`. Panels reuse ad-hoc `ssh-card*` classes across Models, Agent presets and SSH, which is the main source of visual inconsistency. Tokens come from `frontend/src/styles/tokens.css`. Behaviour is specified in `models-settings-ui`, `agent-presets-settings-ui` and `plugin-settings-tabs`; this change keeps it intact (see proposal.md).

## Goals / Non-Goals

**Goals:**
- One reusable grouped-list primitive used by all built-in tabs.
- Match the approved mockup: variants A for every section, B for navigation.

**Non-Goals:**
- No new settings, API or data changes; no change to plugin tab contents.
- No new dependencies or design tokens beyond a group surface colour.

## Decisions

- **Shared primitives as small components + CSS.** Add `SettingsGroup` (title, footnote, children), `SettingsRow` (leading label/subtitle, trailing slot, optional `expanded`/`onToggle`) and a `settings-switch` style for existing `role="switch"` checkboxes. With `onToggle` the row renders a `<button aria-expanded aria-controls>` around the leading content and chevron only; the trailing slot is a sibling of that button, so switches and buttons are never nested in it and do not toggle the row. The details container gets the matching `id`. Alternative: CSS-only classes in each panel — rejected because the expand semantics would be duplicated in every panel.
- **New token `--settings-group`** in `tokens.css` for light/dark group surfaces (`#f6f5f4` / `#262626`), derived from the existing palette. It is declared in all three theme blocks: light (`:root`, `[data-theme='light']`, `[data-theme='system']`), `[data-theme='dark']` and the `prefers-color-scheme: dark` media block. Alternative: reuse `--sidebar` — too close to the dialog background in light theme.
- **Expansion state local to panels**, one open row per list (Models connections, presets); existing `open` section state in `ConnectionCard` becomes the expanded detail content. SSH keeps per-instance public keys (each instance has its own key pair), so the key lives in the expanded instance row; unverified instances start expanded, as the `key` section does today. The Models model list moves from the "Models" section button to the expanded details and is requested on expand, only for registered providers.
- **Notifications switch** wraps the existing enable/disable handlers: checked reflects the current subscription, it is disabled while busy or when `unavailable` is set (the reason becomes the subtitle), and a failed enable leaves it unchecked with the existing error message.
- **Keep existing confirmations and feedback components**; only restyle them (danger-tinted inline confirm block).
- **Retire `ssh-card*` usage outside SSH-specific markup** and remove dead CSS after migration.
- **Navigation:** keep `settings-nav-cell`; add an accent inset bar for `.is-active` and a divider element before plugin tabs.
- **Motion:** switch knob and row expansion use short transitions gated by `prefers-reduced-motion`.

## Risks / Trade-offs

- [Tests depend on current class names and DOM] → update selectors to roles/labels where possible in the same task group as each panel.
- [Expanded Models row becomes long] → keep details inside the group with internal sections; only one connection expanded at a time.
- [Plugin settings components may rely on old classes] → keep `settings-field`, `settings-note`, `settings-feedback`, `settings-actions`, `settings-loading` and `settings-kv*` unchanged (used by the `rtk` plugin); check `plugins/*/ui` with `rg` before removing any settings class.

## Migration Plan

Frontend-only; ship panel by panel. Rollback is reverting the frontend commit.
