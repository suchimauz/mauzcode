# Design

## Context

See proposal.md - Why. Today the version logic is split:

- Claude: `claudeWireHeaders` uses `conn.config.clientVersion` when set, else `claudeCodeCliVersion({})`, which returns `CLAUDE_CODE_CLI_VERSION`, else a cached local `claude --version` result (5 min on success, 30 s on failure, 12 s hard timeout), else the fallback `2.1.260`. `CLAUDE_CODE_USER_AGENT` replaces the whole user agent. The function returns only a string, so the source is lost.
- Codex: `codexVersion({ config })` returns the validated override or the SDK default `0.157.1`, synchronously, without commands. The current spec forbids local CLI discovery; this change relaxes it to an optional, best-effort source.
- The Models tab (`ModelsPanel.tsx`) gets connections from `GET /models/api`; per-connection data (models, usage, test, actions) is loaded through `POST /models/api` actions.

## Goals / Non-Goals

**Goals:**
- One resolution path per provider that returns `{ version, source }`, used both by requests and by the report.
- A generic, optional provider hook so the UI does not hardcode provider ids.
- Lazy, non-blocking display in the connection card.

**Non-Goals:**
- Changing precedence, fallback values or cache times.
- SSH-instance CLI detection for either provider (`claudeCodeCliVersion({ instance })` stays unused by requests and by the report).
- A manual re-detect control.

## Decisions

1. **Resolver procedures returning the source.** Add `models.provider.claude.claudeClientVersion({ conn })` → `{ version, source: "override" | "env" | "detected" | "fallback", userAgentOverridden }` and a new `models.provider.codex.codexClientVersion({ config })` → `{ version, source: "override" | "env" | "detected" | "default", detail? }`. `codexVersion` becomes an async thin wrapper returning `.version`; its three callers await it. `claudeCodeCliVersion` is refactored internally to return/cache `{ value, detected }` so the resolver knows whether detection succeeded; its public string return stays for compatibility. `claudeWireHeaders` calls the resolver and uses `.version`.
   *Alternative:* compute the source in the UI layer by re-checking config and env — rejected, it would duplicate precedence and drift from the wire.

2. **Optional `clientVersion` in `ProviderDefinition`.** Signature `clientVersion?(ctx, conn): Promise<{ version: string; source: string; detail?: string }>` with a short English `detail` (e.g. `claude --version`, `CLAUDE_CODE_USER_AGENT overrides the user agent`). `ProviderView` gains `hasClientVersion: boolean` so the UI only calls the action for providers that implement it.
   *Alternative:* a `version` field inside `ConnectionView` from GET — rejected, CLI detection can take up to 12 s and would block the whole panel.

3. **`models.connections.clientVersion({ id })` and POST action `clientVersion`.** Resolves the connection (secret-free view is enough; the resolver only needs `config`), calls the hook, validates the shape (version ≤ 40 chars of `[0-9A-Za-z.+-]`, known source code, detail ≤ 200 chars) and returns `{ clientVersion: {...} | null }`. Errors go through the existing `fail` / `safeMessage` path. Owner and CSRF checks are the existing ones in `api.ts`.

4. **Codex CLI detection.** New `models.provider.codex.codexCliVersion({})` mirrors `claudeCodeCliVersion` for the local host only: same PATH extension, `codex --version` with an 8 s command timeout and 12 s hard kill, 4 KB output cap, parse `^codex(?:-cli)? (\d+\.\d+\.\d+)`, cache in `ctx.state.models.codexCliVersions` (5 min success, 30 s failure, in-flight promise shared). A detected version is compared numerically with the SDK default `0.157.1`; an older one is ignored (source `default`, detail `ignored detected 0.x.y (older than SDK default)`) because older clients get a reduced model catalogue. `CODEX_CLI_VERSION` is validated with the same pattern as the override and ignored when invalid.
   *Alternative:* always prefer the detected version even if older — rejected, it would silently hide models such as GPT-6.

5. **UI.** `connectionClientVersion(csrf, id)` in `frontend/src/lib/modelConnections.ts`. `ConnectionCard` loads it once on mount and after a successful save of that connection when `provider.hasClientVersion` is true, and appends ` · v<version> (<source label>)` to the `ssh-card-target` line; the detail is a `title` tooltip. Source labels: override → "connection override", env → "CLAUDE_CODE_CLI_VERSION" / "CODEX_CLI_VERSION", detected → "detected: claude --version" / "detected: codex --version", fallback → "built-in fallback", default → "built-in default". Failures are silent (no toast); the line just has no version.

## Risks / Trade-offs

- [The first report can take up to ~12 s when the CLI hangs] → it is lazy and per card; the panel renders immediately, and the shared cache makes the next request free.
- [Refactoring `claudeCodeCliVersion` could change wire behaviour] → keep the string API and existing tests; add a test that the header version equals the reported version for each source.
- [Codex requests now depend on a local binary version] → detection is best-effort, cached, floored at the SDK default and never blocks requests for longer than the first 12 s timeout per 30 s.
- [`codexVersion` becomes async] → only three internal callers; covered by existing codex tests.
- [Public contract baseline changes] → update `src/models/fixtures/public-contract.baseline.json` intentionally in the same task as the new procedures.
