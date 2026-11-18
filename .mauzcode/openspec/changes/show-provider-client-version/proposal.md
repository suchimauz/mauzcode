# Proposal

## Why

Claude and Codex requests identify themselves with a client version (Claude user agent `claude-cli/<version>`, Codex `client_version`/`version`), but the owner cannot see which version is actually sent or where it came from (connection override, environment, detected CLI or built-in default). When the backend starts rejecting an outdated client or a model is missing from the catalogue, the owner has to read source code to find out what MauzCode is sending.

## What Changes

- Claude and Codex providers resolve their client version together with its source through one resolver, and the wire headers use the same resolver so the displayed value always matches what is sent.
  - Claude sources: connection override, `CLAUDE_CODE_CLI_VERSION` environment variable, detected local `claude --version`, built-in fallback; plus a flag when `CLAUDE_CODE_USER_AGENT` replaces the whole user agent.
  - Codex sources: connection override, new `CODEX_CLI_VERSION` environment variable, detected local `codex --version` (new, best-effort, cached; a detected version older than the SDK default is ignored), built-in SDK default.
- The provider SDK gains an optional `clientVersion` operation returning `{ version, source, detail? }`; only `claude` and `codex` implement it.
- The owner-only `/models/api` gains a POST action `clientVersion` for one connection; it returns no secrets and is not part of the GET overview, so CLI detection never delays the Models tab.
- Each Claude and Codex connection card in Settings → Models lazily shows the current version and a human-readable source next to the provider and transport line.

Out of scope: changing Claude's precedence, fallback values or cache times, a "re-detect" button, detecting the Claude or Codex CLI on SSH instances, and showing versions for other providers.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `llm-provider-sdk`: optional provider operation that reports the effective client version and its source.
- `llm-claude-provider`: client version resolution reports its source and is shared by request headers and the report.
- `llm-codex-provider`: the client version may now come from `CODEX_CLI_VERSION` or a detected local `codex --version` (replacing the "never local CLI discovery" rule), reports its source and is shared by requests and the report.
- `models-settings-ui`: connection cards show the effective client version and its source; new owner-only `clientVersion` API action.

## Impact

- Backend: `src/models/ProviderDefinition.ts`, `src/models/$modelProvider_claude.ts`, `src/models/$modelProvider_codex.ts`, `src/models/provider/claude/claudeWireHeaders.ts`, `src/models/provider/claude/claudeCodeCliVersion.ts`, `src/models/provider/codex/codexVersion.ts` (becomes async; its callers `codexListModels`, `codexTest`, `codexWireResponses` await it), new resolver procedures, `src/models/api.ts`, `src/models/fixtures/public-contract.baseline.json`.
- Frontend: `frontend/src/lib/modelConnections.ts`, `frontend/src/components/settings/ModelsPanel.tsx`.
- No database, secret or wire-format changes; no new dependencies. Codex requests may send a newer version than today when a newer local Codex CLI is installed.
