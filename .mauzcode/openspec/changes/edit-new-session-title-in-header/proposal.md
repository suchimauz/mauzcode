## Why

After `refine-new-session-options` the "Параметры" chip on the new-session screen holds only one field, "Название". A separate popover for one field is extra UI, and it does not match how existing sessions are renamed: by clicking the title in the chat header. The draft should be named the same way.

## What Changes

- **BREAKING (UI)**: remove the "Параметры" chip and its popover from the new-session composer.
- The draft title is edited by clicking "New Session" in the chat header, with the same inline input as renaming an existing session (Enter/blur keep, Escape reverts, at most 120 characters).
- An empty title shows "New Session" everywhere; the session is then created without a title.
- The draft title is shown in the chat header, the composer footer label and the sidebar draft row.
- Editing the title stays local to the draft: no request is made and no agent is created until the first message is sent; the title is sent with that message as today.
- Title editing is locked while the first message is being sent or waits for confirmation.
- The draft title is forgotten when the person leaves the draft (opens a chat or a page) and then presses New Session again. Other draft fields keep today's behaviour.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `new-session-options`: the options chip and popover are removed; the title moves to the chat header, is shown in all draft labels and is reset after leaving the draft.

## Impact

- Frontend only: `ChatHeader.tsx`, `LiveApp.tsx`, `NewSessionComposer.tsx`, `WorkspaceSidebar.tsx`, related CSS and vitest tests.
- The `/ui-lab-api/new-session` bridge, its fields and the server API are unchanged.
