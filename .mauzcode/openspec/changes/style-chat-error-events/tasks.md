# Tasks

## 1. Error row component

- [ ] 1.1 Add `ErrorRow` in `frontend/src/components/mauzcode/` reusing compaction-row layout with error icon, first-line label and collapsible `<pre>` body
- [ ] 1.2 Add `.error-row` styles using `--tool-error` for light/dark; remove `.message--error` from `styles/live.css`
- [ ] 1.3 Add copy action with copied/failed feedback

## 2. Transcript routing

- [ ] 2.1 Route `error` events in `TranscriptMessage.tsx` to `ErrorRow`; route `stopped by user` errors to the neutral `transcript-notice`
- [ ] 2.2 Pass an `isLatest` flag so only the newest error row uses `role="alert"`

## 3. Verification

- [ ] 3.1 Add vitest tests: routing (not an assistant message), collapse/expand, single-line without disclosure, copy, stopped-by-user notice, alert only on latest
- [ ] 3.2 Run frontend tests and typecheck; visually check light and dark themes on agent `ps`
