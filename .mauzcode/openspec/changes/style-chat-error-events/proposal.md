## Why

Run errors (for example `Connection Asoft LLM Gate is disabled` in agent `ps`) are rendered in the chat as a plain assistant markdown block with only an accent left border. They look like an ordinary answer, do not use the error tokens, and do not match the compact row style of retries, tool failures and other transcript notices.

## What Changes

- Render `error` transcript events as a dedicated, compact error row instead of an assistant message.
- The row shows an error icon, a short title and the first line of the message; long or multi-line messages expand on demand, like the retry row.
- Use the existing error color tokens (`--tool-error`) for light and dark themes; no new hard-coded colors.
- Give the row an accessible error semantics (alert role for the most recent error, readable label) and a copy action for the full text.
- "Stopped by user" errors keep their current neutral treatment (they are not failures).

## Capabilities

### New Capabilities
- `chat-error-display`: how failed-run error events are presented in the chat transcript.

### Modified Capabilities
- (none)

## Impact

- Frontend: `TranscriptMessage.tsx` routing, a new `ErrorRow` component, CSS next to `compaction-row.css`; removal of `.message--error` from `styles/live.css`.
- Tests: new vitest coverage similar to `retry-row.test.tsx`.
- No backend or API change: the events endpoint already returns `type: 'error'` with the message in `text`.
