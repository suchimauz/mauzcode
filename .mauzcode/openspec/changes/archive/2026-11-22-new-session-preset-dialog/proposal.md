# Proposal

## Why

People forget to pick an agent preset when they start a new session: the only selector is a small chip under the composer, so sessions silently start with the default preset. The choice has to be put in front of the person at the moment a session starts, without slowing down the common case of keeping the default.

## What Changes

- Opening the new-session screen for a fresh draft immediately shows a modal "Режим агента" dialog. The configured default preset is preselected and marked "по умолчанию", so Enter keeps it.
- The dialog lists all presets in sort order with descriptions, has a search field, and supports ↑/↓, Enter and Esc. It scales to 10+ presets: the list scrolls and the search filters it.
- On narrow screens (≤560px) the dialog becomes a bottom sheet with 44px touch targets and a full-width "Продолжить" button.
- The preset chip in the composer stays. It now shows the selected preset and opens the same dialog instead of a dropdown menu.
- The dialog does not open automatically for a draft where a preset was already confirmed, while a first message is being sent or awaits confirmation, or when the preset catalogue failed to load or has only one preset.
- Visual references that were agreed with the person are stored in `references/` of this change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `new-session-options`: the agent preset selector becomes a dialog that opens automatically for a fresh draft. The chip opens the same dialog, and keyboard, accessibility and mobile behaviour are updated to match.

## Impact

- Frontend only: `frontend/src/components/mauzcode/AgentPresetPicker.tsx` (replaced by a dialog plus a chip trigger), `NewSessionComposer.tsx`, `frontend/src/lib/newSession.ts` (draft gains a "preset confirmed" marker), `new-session.css` or a new dialog stylesheet, and frontend tests under `frontend/src/test/`.
- No server, API or preset storage changes. `presetId` submission and default resolution stay as they are.
