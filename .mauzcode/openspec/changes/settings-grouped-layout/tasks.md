# Tasks

## 1. Shared primitives

- [ ] 1.0 Read `docs/skills/apple-design/SKILL.md` and its README scope notes before changing UI
- [ ] 1.1 Add `--settings-group` token to all three theme blocks in `tokens.css` (light, dark, system dark media); verify light, dark and system dark in the browser
- [ ] 1.2 Add `SettingsGroup` and `SettingsRow` components with expandable rows (`aria-expanded`, `aria-controls`, keyboard toggle, trailing controls as siblings of the disclosure button) and grouped-list, switch, chip and inline-confirm styles in `settings.css`, honouring reduced motion; add frontend tests for keyboard expansion, a trailing switch that does not toggle the row, and group title/footnote rendering; pass `bun run frontend:test`

## 2. Navigation

- [ ] 2.1 Restyle the sidebar (monochrome icons, accent bar on active item, divider before plugin tabs); update `plugin-settings-tabs.test.tsx` and verify the divider and unavailable notice in tests

## 3. Sections

- [ ] 3.1 Models: provider groups with header switch and disabled badge, connection rows with status, transport, client version, quota summary and switch, one expanded row at a time with in-place details (usage, quotas, plan/balance, provider login, Re-detect, models with Update models, context limit and draft, test, edit or plugin form, remove confirm); model list requested on expand only for registered providers, unregistered provider note and disabled Edit with reason; disabled-provider dimming and blocking kept; Add connection stays first; update `settings-models.test.tsx`
- [ ] 3.2 Voice: Default route, Connections (expandable rows with test result, Edit, Test, confirmed Remove) and Errors groups; update `settings-voice.test.tsx` and `voice-panel.test.tsx`
- [ ] 3.3 Agent presets: preset rows with badges and default marker, single expanded details with description, rule chips ("none", `*` everything label), prompt and metadata; read-only with only disclosure and Retry buttons; update `settings-agent-presets.test.tsx`
- [ ] 3.3a Agent presets review fixes (behaviour change, commit separately from the restyle): on 403 show the owner-only note without Retry; every load (including Retry) aborts the previous request and unmount aborts the current one; keep loaded presets visible during reload; name the focusable prompt "Prompt for <name>"; use own `preset-*`/grouped-list classes instead of `ssh-card*`/`ssh-badge`; add tests for 403, abort on Retry/unmount and the prompt label
- [ ] 3.4 SSH Instances: instance rows with status and probe summary; expanded row with its own public key and copy, setup steps, test, host key, edit and remove; unverified instances expanded by default; add form below list; update `settings-ssh.test.tsx`
- [ ] 3.5 Notifications: switch row replacing Enable/Disable buttons (permission request started synchronously in the activation handler; disabled with reason when unavailable, not configured on the server or busy; reverts on denied permission; stays on while the disable confirmation is open and after Cancel), Connected devices group with current device mark and confirmed remove; update `settings-push.test.tsx`
- [ ] 3.6 Updates: status card with "Update and restart…" and "Check upstream", key/value summary, confirmation kept; update `settings-updates.test.tsx`
- [ ] 3.7 SOCKS5: proxy rows in `SocksProxiesPanel.tsx` with check action, add/edit form below list, credentials note kept; update `socks-proxies.test.tsx` and `settings-socks-dialog.test.tsx`

## 4. Integration

- [ ] 4.1 Remove unused `ssh-card*`/legacy settings CSS while keeping classes used by plugin settings UIs (at least `settings-field`, `settings-note`, `settings-feedback`, `settings-actions`, `settings-loading`, `settings-kv*`; check with `rg` over `plugins/*/ui`), run `bun run frontend:test` (including `rtk-settings.test.tsx`) and the project check, and visually verify every tab in light, dark and system dark themes and on a narrow viewport, and get the owner's confirmation of the result
