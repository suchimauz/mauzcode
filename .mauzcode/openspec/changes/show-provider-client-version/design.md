# Design

## Context

See proposal.md - Why. Today the version logic is split:

- Claude: `claudeWireHeaders` uses `conn.config.clientVersion` (trimmed, not re-validated) when set, else `claudeCodeCliVersion({})`, which returns `CLAUDE_CODE_CLI_VERSION`, else a cached local `claude --version` result (5 min on success, 30 s on failure, 12 s hard timeout), else the fallback `2.1.260`. `CLAUDE_CODE_USER_AGENT` replaces the whole user agent. The function returns only a string, so the source is lost. `claudeValidate` already checks the override against `^[0-9A-Za-z.+-]{1,40}$`.
- Codex: `codexVersion({ config })` returns the validated override or the SDK default `0.157.1`, synchronously, without commands. The current spec forbids local CLI discovery.
- `FieldSpec` already supports `type: "boolean"` with `default`, and `ModelsPanel` renders it as a checkbox. Per-connection data in the Models tab is loaded through `POST /models/api` actions.

## Goals / Non-Goals

**Goals:**
- Per-connection, explicit choice between an override, CLI detection and the built-in version.
- One resolution path per provider that returns `{ version, source, detail? }`, used both by requests and by the report.
- A generic, optional provider hook so the UI does not hardcode provider ids.
- Lazy, non-blocking display with a manual re-detect.

**Non-Goals:**
- Sharing code between Claude and Codex resolution, validation or detection.
- SSH-instance CLI detection (`claudeCodeCliVersion({ instance })` stays unused by requests and the report).
- Changing fallback/default values or cache times.

## Decisions

1. **`detectCliVersion` boolean field per provider.** Claude: `{ key: "detectCliVersion", type: "boolean", default: true }`; Codex: `default: false`. Stored configs without the key use the default, so existing Claude connections keep detecting and existing Codex connections keep the SDK default.
   *Alternative:* environment variables (`CODEX_CLI_VERSION`) — rejected, they are server-wide and invisible in the UI.

2. **Override and detection are exclusive.** `claudeValidate` / `codexValidate` throw when a non-empty `clientVersion` is combined with `detectCliVersion: true` (each provider keeps its own message). The connection form disables the checkbox while the override field is not empty and unchecks it when an override is typed. Because Claude's default is `true`, saving a Claude override sends `detectCliVersion: false` explicitly. Existing stored Claude connections with an override and no key would fail validation, so the resolver treats "override present" as winning and validation only rejects an explicit `true` together with an override.

3. **Invalid override is rejected, not skipped.** Validation already rejects bad overrides at save time; the Claude resolver additionally re-validates (today it only trims) and throws a configuration error instead of sending an unchecked value. No silent fallback.

4. **Environment overrides removed.** `CLAUDE_CODE_CLI_VERSION` and `CLAUDE_CODE_USER_AGENT` are no longer read by the models provider; the user agent is always generated as `claude-cli/<version> (external, sdk-cli)` from the resolved version, so there is nothing to configure besides the version itself. The legacy tree is untouched.

5. **Separate resolvers.**
   - `models.provider.claude.claudeClientVersion({ conn, refresh? })` → `{ version, source: "override" | "detected" | "fallback", detail? }`. `claudeCodeCliVersion` is refactored to cache `{ value, detected }` and accepts `refresh`; the string API stays.
   - `models.provider.codex.codexClientVersion({ config, refresh? })` → `{ version, source: "override" | "detected" | "default", detail? }`.
   - `models.provider.codex.codexCliVersion({ refresh? })` — local `codex --version`, own PATH extension, 8 s command timeout, 12 s hard kill, 4 KB output cap, parse `^codex(?:-cli)? (\d+\.\d+\.\d+)`, cache in `ctx.state.models.codexCliVersions` (5 min success, 30 s failure, shared in-flight promise). A detected version is used as is, even when older than `0.157.1`; the detail then notes `older than SDK default 0.157.1` so the owner understands a reduced catalogue.
   - `codexVersion` becomes an async wrapper returning `.version`; its three callers await it. Requests wait for detection; a hang costs at most one 12 s wait per 30 s and only for connections that opted in.
   *Alternative:* background detection without waiting — rejected as unnecessary given caching and opt-in.

6. **Optional `clientVersion` in `ProviderDefinition`.** `clientVersion?(ctx, conn, opts: { refresh?: boolean }): Promise<{ version: string; source: string; detail?: string }>`. `ProviderView` gains `hasClientVersion`. `detail` is a short English text, never raw command output.

7. **`models.connections.clientVersion({ id, refresh? })` and POST action `clientVersion`.** Resolves the connection, calls the hook, validates the shape (version ≤ 40 chars of `[0-9A-Za-z.+-]`, known source code, detail ≤ 200 chars) and returns `{ clientVersion: {...} | null }`. `refresh` only drops the cache entry of that provider's local detection and is ignored when the source is `override`. Owner and CSRF checks are the existing ones in `api.ts`.

8. **UI.** `connectionClientVersion(csrf, id, refresh?)` in `frontend/src/lib/modelConnections.ts`. `ConnectionCard` loads it on mount and after a successful save when `provider.hasClientVersion`, and appends ` · v<version> (<source label>)` to the `ssh-card-target` line with `detail` as a tooltip; a placeholder `· v…` is shown while loading. Source labels: override → "connection override", detected → "detected: claude --version" / "detected: codex --version", fallback → "built-in fallback", default → "built-in default". A **Re-detect** button is shown when `detectCliVersion` is on; it calls the action with `refresh: true` and is disabled while running. Load failures are silent; re-detect failures use the normal action toast.

## Risks / Trade-offs

- [Removing the environment variables breaks deployments that use them] → called out as BREAKING in the proposal and docs; the per-connection override covers the version; a full custom user agent is dropped intentionally.
- [Exclusivity breaks stored Claude connections with an override] → only an explicit `detectCliVersion: true` plus override is rejected; a missing key with an override resolves to the override.
- [An older local Codex CLI hides models] → the owner opted in; the card detail warns when the detected version is older than the SDK default.
- [A hanging CLI delays a request up to 12 s] → opt-in for Codex, cached failure for 30 s, same behaviour as Claude today.
- [Public contract baseline changes] → updated intentionally in the same task as the new procedures.
