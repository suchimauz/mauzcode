# Proposal

## Why

The new-session composer shows a separate "pet" chip in its chip row while the chosen pet is already visible above the message input. The chip duplicates the mascot and clutters the row; picking the pet by clicking the pet itself is more direct.

## What Changes

- Remove the pet chip from the new-session chip row.
- The mascot preview above the new-session input becomes the pet picker: activating it opens the same menu ("Random" plus the 13 catalogue pets).
- The menu, selection, draft persistence and submitted `mascot` value stay as they are; only the entry point moves.
- In the new-session screen the mascot no longer plays the "poke" reaction on click; it opens the picker instead. Existing chats keep the poke interaction.
- The picker is locked while the first message is being sent or awaits confirmation, as the chip was.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `chat-mascots`: the new-session pet picker is opened from the mascot itself instead of a chip; mascot interaction differs between the new-session screen and existing chats.

## Impact

- Frontend only: `NewSessionComposer`, `MascotPicker`, the mascot renderers (`CrabMascot`, `TokibeanMascot`, `ImageMascot`) and their CSS; tests `mascot-picker.test.tsx`, `new-session.test.tsx`.
- No API, storage or server changes.
