# Proposal

## Why

After agents edit UI or server code, the page often reloads while the server is still restarting or rebuilding plugin bundles. The browser's single request for `/plugins/ui/manifest` (or a plugin bundle import) then fails, and the plugin runtime never tries again on its own: plugin pages, Canvas launcher buttons and Canvas kinds stay missing until the person reloads the page manually.

## What Changes

- The frontend plugin runtime retries a failed manifest request automatically with bounded exponential backoff instead of waiting for a `plugins.changed` event or a live reconnect.
- A plugin whose bundle import failed with a transient (network/server) error is retried the same way; validation failures (id mismatch, core override, ungranted surfaces) are not retried.
- While a retry is pending, the last successfully loaded registry stays in place; built-in surfaces keep working.
- A successful refresh, a `plugins.changed` event, a live resync or the browser regaining connectivity/visibility cancels the pending backoff and refreshes immediately.
- Retries stop when the runtime is stopped. No server changes.

## Capabilities

### New Capabilities
- `plugin-ui-runtime`: How the browser loads, refreshes and recovers the approved plugin UI registry (manifest fetch, bundle import, live refresh and automatic recovery after transient failures).

### Modified Capabilities

## Impact

- `frontend/src/extensions/pluginRuntime.ts` (retry scheduling, error classification, cleanup in `stop`).
- `frontend/src/extensions/pluginRuntime.test.tsx` (fake-timer tests).
- No API, server, approval or grant changes.
