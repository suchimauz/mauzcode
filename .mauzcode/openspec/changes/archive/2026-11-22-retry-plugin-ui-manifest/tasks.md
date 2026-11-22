# Tasks

## 1. Retry scheduling in the plugin runtime

- [x] 1.1 Add backoff state (attempt counter, single timer, optional `retry` options with base/max/random) to `createPluginRuntime`; clear the timer at the start of every `refresh()` and reset the attempt counter on full success — verified by unit tests in `pluginRuntime.test.tsx` with fake timers.
- [x] 1.2 Schedule a retry when the manifest fetch fails (excluding `AbortError` and 401/403), keeping the previous registry and setting `errors.manifest` — test: failing then succeeding `fetchManifest` loads plugins after advancing timers, without calling `refresh()` manually.
- [x] 1.3 Mark bundle import rejections as retryable and validation failures as not retryable; schedule a retry only when a retryable plugin error exists — tests: import failing once recovers; id-mismatch bundle schedules no timer.
- [x] 1.4 Verify backoff grows and caps (e.g. 1s, 2s, 4s … ≤30s) — test inspects scheduled delays with deterministic `random`.

## 2. Immediate triggers and cleanup

- [x] 2.1 In `start()`, listen for `online` and `visibilitychange` (visible) and refresh immediately when a retry is pending; `plugins.changed` and live `resync` also cancel the pending timer — test: resync during backoff causes one fetch and leaves a single timer chain.
- [x] 2.2 In `stop()`, clear the timer and remove the listeners — test: no fetch after `stop()` even after advancing timers.
- [x] 2.3 Run `bun run frontend:test -- frontend/src/extensions` and `tsc -b frontend/tsconfig.json`; all pass.

## 3. Manual verification

- [x] 3.1 With the app open, restart the server (or reload a module that triggers a page reload during rebuild) and confirm plugin Canvas buttons reappear on their own within the backoff window without pressing F5.
