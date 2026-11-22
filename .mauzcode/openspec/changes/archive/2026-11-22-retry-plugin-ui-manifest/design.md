# Design

## Context

`createPluginRuntime` in `frontend/src/extensions/pluginRuntime.ts` fetches `/plugins/ui/manifest` once in `start()` and then only on `plugins.changed` live events or live `resync`. On a failed fetch it records `errors.manifest` and returns; on a failed bundle import it records `errors[name]`. Nothing schedules another attempt, so a fetch that races a server restart leaves only core surfaces until a manual reload. A `generation` counter and `AbortController` already make overlapping refreshes safe.

## Goals / Non-Goals

**Goals:**
- Recover plugin surfaces automatically after transient manifest or bundle load failures.
- Keep one retry chain at a time, cancelled by immediate refresh triggers and by `stop()`.
- Keep the change inside the frontend runtime and testable with injected fetch/import and fake timers.

**Non-Goals:**
- Server-side changes to manifest building, approvals or grants.
- Retrying 401/403 (auth) responses or validation errors.
- Showing a new UI indicator for retry state.

## Decisions

- **Backoff:** delays 1s, 2s, 4s, … capped at 30s, with small jitter; reset on success. Unbounded attempts while started, because the server will normally come back and the cap keeps load negligible.
- **What is retryable:** manifest fetch errors except `AbortError` and auth statuses (401/403, already exposed by `requestJson`); bundle import rejections (the `importer` throwing). Errors thrown by our own validation after a successful import are not retryable — track them with a separate flag rather than parsing messages.
- **Single timer:** one `retryTimer` in the runtime closure; `scheduleRetry()` clears any existing timer before setting a new one; `refresh()` clears the timer when it starts.
- **Extra triggers:** `start()` adds `online` and `visibilitychange` (when visible) listeners that call `refresh()` only if a retry is pending; `stop()` removes them and clears the timer.
- **Keep state on failure:** existing behaviour (previous registry stays) is kept and now specified.
- **Injection for tests:** optional `retry` options (`baseMs`, `maxMs`, `random`) on `createPluginRuntime`; defaults used in production.

Alternative considered: full page reload on reconnect — rejected, it loses drafts and scroll and the runtime already supports hot refresh.

## Risks / Trade-offs

- [A permanently broken server keeps polling every 30s] → negligible load; stops on `stop()`/page close.
- [Misclassified validation error retried forever] → validation errors are flagged explicitly, covered by a test.
- [Retry racing a live event] → generation counter already discards stale results; timer cleared on every refresh start.
