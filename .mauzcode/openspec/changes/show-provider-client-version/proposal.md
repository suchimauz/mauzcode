# Proposal

## Why

Claude and Codex requests identify themselves with a client version (Claude user agent `claude-cli/<version>`, Codex `client_version`/`version`), but the owner cannot see which version is actually sent or where it came from. How the version is chosen is also inconsistent: Claude silently runs `claude --version` and reads server-wide environment variables, while Codex never looks at the local CLI. When the backend starts rejecting an outdated client or a model is missing from the catalogue, the owner has to read source code to find out what MauzCode is sending, and cannot choose per connection whether the local CLI is used.

## What Changes

- Claude and Codex connections each get a per-connection checkbox **Detect CLI version** (`detectCliVersion`). It is mutually exclusive with the existing **Client version** override: the form disables it while an override is entered, and validation rejects a configuration with both.
  - Claude: checked by default, so existing connections keep detecting `claude --version`. Sources: `override`, `detected`, `fallback` (`2.1.260`).
  - Codex: unchecked by default, so existing connections keep sending the SDK default. Sources: `override`, `detected`, `default` (`0.157.1`). A detected version is used as is, also when it is older than the SDK default.
- **BREAKING** The server-wide `CLAUDE_CODE_CLI_VERSION` and `CLAUDE_CODE_USER_AGENT` environment variables are removed; the per-connection override replaces the version variable; the user agent is always generated as `claude-cli/<version> (external, sdk-cli)`. No `CODEX_CLI_VERSION` is added.
- Each provider has its own resolver returning `{ version, source, detail? }`; the provider's requests and its report use the same resolver, so the displayed value always matches what is sent. Claude and Codex keep separate validation, detection and caching code.
- CLI detection stays local-only, best-effort and cached (5 min on success, 30 s on failure) with a hard timeout; requests wait for it like Claude does today.
- The provider SDK gains an optional `clientVersion` operation; only `claude` and `codex` implement it.
- The owner-only `/models/api` gains a POST action `clientVersion` for one connection, with `refresh: true` to drop that provider's cached detection and detect again. It returns no secrets and is not part of the GET overview.
- Each Claude and Codex connection card in Settings → Models lazily shows `v<version> (<source>)` next to the provider and transport line, with a **Re-detect** button when detection is enabled.

Out of scope: detecting the Claude or Codex CLI on SSH instances, changing fallback/default values or cache times, and showing versions for other providers.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `llm-provider-sdk`: optional provider operation that reports the effective client version and its source and can refresh detection.
- `llm-claude-provider`: per-connection CLI detection checkbox, exclusive with the override; environment overrides removed; resolution reports its source and is shared by request headers and the report.
- `llm-codex-provider`: per-connection opt-in CLI detection (replacing the "never local CLI discovery" rule), exclusive with the override; resolution reports its source and is shared by requests and the report.
- `models-settings-ui`: connection cards show the effective client version, its source and a re-detect control; new owner-only `clientVersion` API action.

## Impact

- Backend: `src/models/ProviderDefinition.ts`, `src/models/$modelProvider_claude.ts`, `src/models/$modelProvider_codex.ts`, `src/models/provider/claude/claudeValidate.ts`, `src/models/provider/claude/claudeWireHeaders.ts`, `src/models/provider/claude/claudeCodeCliVersion.ts`, `src/models/provider/codex/codexValidate.ts`, `src/models/provider/codex/codexVersion.ts` (becomes async; its callers `codexListModels`, `codexTest`, `codexWireResponses` await it), new resolver and detection procedures, `src/models/api.ts`, `src/models/fixtures/public-contract.baseline.json`.
- Frontend: `frontend/src/lib/modelConnections.ts`, `frontend/src/extensions/types.ts`, `frontend/src/components/settings/ModelsPanel.tsx`.
- Docs: `docs/models-providers.md`, `docs/anthropic-subscription-operations.md` (environment variables removed).
- Deployments that set `CLAUDE_CODE_CLI_VERSION` or `CLAUDE_CODE_USER_AGENT` must move the version to the connection override; a custom full user agent is no longer possible.
- No database, secret or wire-format changes; no new dependencies. Codex connections with the checkbox enabled may send a different version than today.
