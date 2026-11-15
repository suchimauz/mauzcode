# Proposal

## Why

Every MauzCode agent can currently reach every runtime function. Through `tools_eval` and `ctx.fns` it can reload plugins, create runtime functions, change settings and use any mounted plugin, even when it only needs to work on code or tasks. The new-session composer already shows a "Standard mode" chip, but it is a placeholder with no behaviour. DeepSeek Harness (`packages/bundle/web-app/presets/*.patch.yml`, `packages/preset/*`; see `docs/deepseek-harness-review.md`) shows a working model: an agent preset is a named composition that decides what the agent gets, chosen once when a task starts. We need that composition boundary in the architecture now, before more plugins and user plugins arrive, so that ordinary agents get a focused surface and only an explicit Creator agent can change the system.

## What Changes

- Add **agent presets**: named, database-stored compositions of function access patterns (`allow`/`deny` globs over full `ctx.fns` names), allowed plugins and a system-prompt addition.
- Seed three built-in presets: **Standard** (code and task work, no runtime or plugin management, no plugins), **Creator** (everything, all plugins — today's behaviour) and **Minimal** (only bash/read/write/edit, a short prompt; a comparison baseline). Built-ins stay editable and can be reset to code-defined defaults; they cannot be deleted.
- Plugins are granted **manually** (allowlist): a plugin absent from a preset is unavailable. Creator uses `*`, so every new official or user plugin is immediately available there and nowhere else until a Creator agent adds it to another preset. Deny patterns can narrow a granted plugin.
- Each new agent stores an immutable **snapshot** of its preset. Later preset edits affect only new agents. An agent's preset cannot be switched.
- The snapshot is enforced as a **guardrail**, not a sandbox: native tool declarations, system-prompt sections (tools, plugins, canvas, input) and top-level `ctx.fns` calls inside `tools_eval` are filtered; a denied call fails with an error that names the function and the preset. Calls made inside an allowed function are not checked.
- The system prompt becomes modular: one base prompt plus capability sections (`$prompt_<id>.md`, also shippable by plugins), each included only when the preset allows the functions it requires; a preset can exclude sections.
- Delegated and forked children inherit the parent snapshot and may only be narrowed (intersection), never widened.
- A new runtime module `agentPreset` (list, get, create, update, remove, reset, resolve); write operations are reachable only through Creator, without an extra confirmation.
- A setting `agentPreset.default` (default `standard`) selects the preset for new sessions.
- Migration: every existing agent receives the Creator snapshot, so its behaviour is unchanged.
- The new-session composer's "Standard mode" chip becomes a preset menu; the new-session endpoint returns presets and accepts `presetId`; the chat shows the agent's preset read-only.

## Capabilities

### New Capabilities

- `agent-presets`: definition, storage, built-in defaults, plugin grants, per-agent snapshots, guardrail enforcement over tools, prompt and `ctx.fns`, child inheritance and Creator-only management of agent presets.

### Modified Capabilities

- `new-session-options`: the composer gains a preset selector that replaces the static "Standard mode" chip, and the first submit carries the selected preset.

## Impact

- **Database:** new table `agent_presets`; new columns `agents.preset_id` and `agents.preset_snapshot`; a migration that seeds built-ins and back-fills existing agents with Creator.
- **Runtime:** new module `src/agentPreset/`, setting `agentPreset.default`; split of `SYSTEM_PROMPT_CORE.txt` into a base prompt and `$prompt_` sections with a new `$loader_prompt`; changes in `agent.wireTools`, `agent.fullSystemPrompt`, `tools.promptSection`, `repl.eval` / `procs.repl.eval` (filtered `fns` proxy for agent evals), `session.save` / load, `agent.delegate`, `session.fork`, `ui.createAgent`.
- **HTTP/UI:** `/ui-lab-api/new-session` (GET lists presets, POST accepts `presetId`), `frontend/src/lib/newSession.ts`, `NewSessionComposer.tsx`, chat header preset label.
- **Behaviour:** new sessions default to Standard and lose plugin and runtime-management access until a Creator agent grants it. Existing agents are unaffected.
- **Not a security boundary:** eval and bash still run inside the server process; the specs state this explicitly. True isolation, a preset editor UI, a plugin toggle on the Plugins page and a Code-first (PTC) preset are out of scope.
