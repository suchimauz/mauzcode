## Context

The new-session screen keeps a local draft (`NewSessionDraft` in `frontend/src/lib/newSession.ts`, persisted in `sessionStorage`). `LiveApp` owns the draft state and passes it to `NewSessionComposer`. The draft title is currently edited in a "Параметры" popover. `ChatHeader` already supports inline renaming of an existing session through `renameChat`, but it is disabled when there is no `agentId` and shows a static "New Session".

## Goals / Non-Goals

**Goals:**
- One way to name a session: click the header title, both for drafts and for existing sessions.
- Draft title visible in the header, composer footer and sidebar draft row.
- No agent and no network request before the first message.
- A fresh title for each new draft after the person leaves the previous one.

**Non-Goals:**
- Changing the new-session bridge, server API or title validation.
- Changing how text, files, mascot, workspace or model are kept in the draft.
- Changing renaming of existing sessions.

## Decisions

### ChatHeader draft mode
`ChatHeader` gets optional props `draftTitle`, `onDraftTitle` and `draftLocked`. When `agentId` is empty and these props are given, the title button is enabled and opens the same input as renaming. Enter or blur call `onDraftTitle` with the new value; Escape restores the previous value. In draft mode the header MUST NOT call `getChatHeader` or `renameChat`. Identity icon and team children stay hidden, as now.

Alternative: a separate title input in the composer. Rejected: it would keep two different ways to name a session.

### Data flow
`LiveApp` stays the single owner of the draft. It passes `draft.title` and a setter (through `updateDraft`) to `ChatHeader`, the title to `WorkspaceSidebar` for the draft row (tree and flat views), and `NewSessionComposer` reads the title from the draft (or the pending snapshot while sending) for its footer label. The label is `title.trim() || "New Session"`.

### Sending and locking
`submitNewSession` keeps sending the trimmed title with the first message. While the composer is busy or a pending submit exists, `LiveApp` passes `draftLocked` so the header title cannot be edited; the pending snapshot's title is shown.

### Reset after leaving the draft
`startNewSession` clears `title` when the draft was not the current view (a chat was selected or a page was open). When the person is already on the draft, pressing New Session keeps the title. A page reload restores the stored draft including its title. A `?newSession=1&title=…` link still pre-fills the title.

Alternative: keep the title until the session is sent. Rejected by the user: an old name should not come back on a new draft.

## Risks / Trade-offs

- [The title is less visible to new users without the chip] → the header title is a clear button with a rename tooltip and accessible name, the same as for existing sessions.
- [Leaving and returning loses a typed title] → intended; only the title is reset, the typed text is kept.
- [Header keyed by `mauzcode.selected || 'new'` may remount and lose an in-progress edit] → the edit is committed on blur like renaming today.
