## Why

The Settings dialog sections look inconsistent and visually noisy: each tab mixes ad-hoc cards, badges and button rows, so related options are hard to scan. The owner reviewed live CSS mockups and chose one unified look — inset grouped lists in the style of macOS System Settings — for every built-in section, plus a cleaner monochrome navigation sidebar.

## What Changes

- Introduce a shared grouped-list presentation for Settings: uppercase group titles, rounded inset groups of rows with hairline separators, optional group footnotes, trailing switches, values and disclosure chevrons.
- Restyle every built-in tab with this presentation without removing any current control or state:
  - **Models**: provider group with logo, disabled badge and global switch; one row per connection (status, transport, client version, quota summary, enable switch); the row expands in place into details (usage and quota meters, plan/balance, provider login, Re-detect, models with Update models, context limit and draft save, test, edit or plugin provider form, remove confirmation). Add connection stays first.
  - **Voice**: groups "Default route", "Connections" and "Errors" (lookup by Error ID, show recent).
  - **Agent presets**: one row per preset; one expands at a time to show description, rules as chips, prompt and metadata; still read-only (row disclosures are the only new buttons).
  - **SSH Instances**: group of instances with status and probe summary; each row expands to its own public key with copy action, setup steps, test, host key, edit and remove; the add form opens below the list.
  - **Notifications**: the Enable/Disable buttons become a single "Push on this device" switch row (disabled with a reason when push is unavailable, reverts on denied permission, disable still confirmed) and a "Connected devices" group.
  - **Updates**: macOS Software Update style status card with the primary "Update and restart…" action and a secondary "Check upstream", plus a key/value summary; restart still requires confirmation.
  - **SOCKS5**: grouped list of proxies with check action; add/edit form below the list.
- Restyle the navigation sidebar: monochrome icons, accent bar on the active item, a separator before plugin tabs; plugin tab contents keep their own UI.
- No backend, API or data changes; no behaviour is removed.

## Capabilities

### New Capabilities

- `settings-visual-layout`: shared visual language of the Settings dialog — grouped-list presentation, per-section layout, navigation styling, and preservation of existing controls, accessibility and themes.

### Modified Capabilities

- `agent-presets-settings-ui`: preset details move into expandable rows, and the read-only rule allows the row disclosure buttons besides Retry; review fixes: an owner-only note instead of Retry on 403, request abort on Retry and unmount, no flicker on reload, and an accessible name for the prompt block.

- `models-settings-ui`: the connection list shows a usage summary in each row and the full quota windows in the expanded details; references to connection cards apply to the row with its expanded details; disabled-provider dimming applies to rows.

Other behavioural requirements in `models-settings-ui` and all of `plugin-settings-tabs` (control placement, confirmations, accessibility) remain valid and unchanged.

## Impact

- Frontend only: `frontend/src/components/settings/*` (panels including `SocksProxiesPanel.tsx`, `settings.css`, `SettingsDialog.tsx`) and `frontend/src/styles/tokens.css`. `frontend/src/core-ui/socks-proxies.tsx` is only a re-export and stays unchanged.
- Frontend tests that query settings markup (`frontend/src/test/settings-ssh.test.tsx`, `plugin-settings-tabs.test.tsx` and other settings tests) may need selector updates.
- Reference mockup: the owner chose variants "A" for each section and "B" for navigation in a canvas mockup that is no longer available. The requirements in `specs/` are the authoritative description of that choice; the owner confirms the visual result during task 4.1.
