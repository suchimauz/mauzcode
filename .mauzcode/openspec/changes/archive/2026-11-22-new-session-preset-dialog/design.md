# Design

## Context

See proposal.md for the motivation. Today `AgentPresetPicker` is a Base UI `Menu` chip inside `NewSessionComposer`, and its selection lives in `NewSessionDraft.presetId`, resolved by `resolveNewSessionPreset`. The new-session defaults endpoint already returns `presets` and `defaultPresetId`, so no backend work is needed.

## Agreed visual references

The person reviewed and approved the mockups in `references/`. They are binding for layout and behaviour; the exact markup is not.

- `references/preset-dialog-real-styles.html`: **the chosen design.** It uses the real project CSS (`tokens.css`, `message-input.css`, `new-session.css`, `model-picker.css`, `workspace-directory-dialog.css`). It shows a desktop frame and a 390px phone frame, with a light/dark theme switch. Open it in a browser to see it.
- `references/preset-picker-options-scaling.html`: shows the options that were considered for 4, 7 and 10 presets: (A) an inline pill strip with "Ещё N", and (B) a modal with search. **B was chosen**, because pills stop scaling after about 6–7 presets.

Decisions taken in the conversation:
1. A modal was chosen over an always-visible strip, because the point is to make the person consciously confirm the preset.
2. The dialog opens immediately on a fresh session, with the system default preselected, so Enter is a one-key confirm.
3. It uses a list with search instead of cards, so 10+ presets fit.
4. On mobile it is a bottom sheet instead of a centred dialog.
5. The chip stays as the way to reopen the dialog.

## Goals / Non-Goals

Goals: make the dialog the primary preset selector for new sessions, so that keeping the default takes one key.

Non-goals: per-project default presets, remembering the last used preset, changing the preset of an existing session, or any server or API changes.

## Decisions

- **Dialog primitive.** Use the Base UI `Dialog` that the project already uses (see `WorkspaceDirectoryDialog`, `SettingsDialog`) for the focus trap, `aria-modal` and Esc handling. The list follows the listbox pattern (`role="listbox"`/`option`, `aria-selected`, `aria-activedescendant` from the search input), so focus stays in the search field while ↑/↓ move the selection. Alternative: keep the `Menu`. Rejected, because a menu cannot hold a search field or auto-open as a modal.
- **Styling.** Use a new `preset-dialog` stylesheet that reuses the existing tokens and copies the backdrop, radius (24px), shadow and footer button style of `workspace-directory-dialog.css`, as in the reference. Below 560px a media query turns it into a bottom sheet. The default badge uses `--accent-soft`/`--accent`.
- **Auto-open state.** Add an optional `presetConfirmed?: boolean` to `NewSessionDraft`, persisted with the draft. Auto-open happens once per draft (keyed by `requestKey`) when `!presetConfirmed`, nothing is pending, and the catalogue has ≥2 presets. Confirming sets `presetConfirmed: true`. Esc/outside click does not set it, but it also does not re-open within the same mount. Alternative: open on every mount. Rejected, because it would nag after a reload of a draft the person already confirmed.
- **Esc semantics.** Esc restores the selection that was active when the dialog opened. On auto-open that selection is the default, which matches the mockup's "Esc — по умолчанию" hint. On a chip-open it is the previous choice.
- **Focus.** After closing an auto-opened dialog, focus moves to the message input. After a chip-opened dialog closes, focus returns to the chip (Base UI default).

## Risks / Trade-offs

- [The modal blocks typing for people who never change the preset.] → Enter confirms immediately and the input gets focus, so the cost is one key.
- [Old drafts without `presetConfirmed` open the dialog once after the upgrade.] → This is acceptable, a one-off.
- [Pasting or dropping files before confirming.] → The dialog is modal, so this happens only after it closes.

## Migration Plan

Frontend only, with no data migration. Rollback is reverting the commit. Drafts carrying `presetConfirmed` remain valid for the old code, which ignores the field.
