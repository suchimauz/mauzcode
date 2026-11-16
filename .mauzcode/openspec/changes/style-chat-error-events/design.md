## Context

`TranscriptMessage` routes special event types (retry, tool busy, stop, commands) to compact rows, but `error` falls through to the assistant branch and only gets `.message--error` (accent left border). The events API already maps `event.error` to `text`. Compact rows share `compaction-row.css` (24px height, tertiary text, icon + disclosure on hover).

## Goals / Non-Goals

**Goals:** consistent compact error row; error tokens; collapsible details; copy; accessible announcement.
**Non-Goals:** changing how errors are produced or stored, retry logic, run-state badges in the sidebar.

## Decisions

- New `ErrorRow` component reusing the `compaction-row` layout (toggle button, leading icon `CircleAlert`, disclosure chevron on hover), with an `.error-row` modifier that colors icon and label with `var(--tool-error)`. Alternative — styling `.message--error` — rejected: still an assistant block, inconsistent with other rows.
- Title "Ошибка" + separator + first line (ellipsis); full text in a `<pre>` body when expanded. Disclosure only when text has more than one line or is truncated by length (>160 chars).
- Copy button visible on hover/focus, same pattern as user message copy.
- `role="alert"` only when the event is the last event of the page (`isLatest` prop passed from the transcript list); otherwise no live role.
- `stopped by user` text is routed to the existing `transcript-notice` paragraph.
- Remove the `.message--error` rule from `live.css`.

## Risks / Trade-offs

- Grouped turns (`transcriptGroups` marks turns ending in error as failed) must keep working → keep `type === 'error'` unchanged; only rendering changes.
- Reduced motion: no animations are added.
