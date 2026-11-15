# Design

## Context

- Every runtime function lives in `ctx.state.registry` and is reached through the `ctx.fns` proxy (`src/$main.ts`, `wrapFns`). The proxy calls `fn(ctx, ctx.session, opts)` with the ctx it was read from, so a derived ctx propagates to every nested call.
- Agents reach functions in two ways: native tools (`tools.list` → `agent.wireTools` → `tools.call`) and `tools_eval` (`tools.eval` → `repl.eval` → `procs.repl.eval`, which runs code with `new Function` and a derived `rctx`).
- The system prompt is assembled by `agent.fullSystemPrompt` from `SYSTEM_PROMPT_CORE.txt` (≈20 KB, centred on `ctx.fns` through eval), `tools.promptSection`, `markdown/input/canvas.promptSection`, a plugin index from `plugins.list` and fixed blocks (shared agents, runtime context).
- `agent.tools` already narrows native tools (`wireTools`, `promptSection({ only })`) and is persisted in `agents.tools` by `session.save`.
- Plugins (`plugins.list`) declare their namespaces (`browser` → `browser`, `cdp`, `chrome`). User plugins live in `USER_PLUGINS`; `.mauzcode/<mod>/` project functions are not plugins.
- Children are created through `session.fork` (used by `agent.delegate`, `agent.delegateTask`, `agent.publishGoalDelegation`, `sharedAgent.delegate`, the fork route and goal sidecars). New sessions are created through `ui.createAgent` and `/ui-lab-api/new-session` (`src/$middleware_ui-lab-api.ts`).
- DeepSeek Harness composes a preset from child plugins chosen at agent creation; edits affect only new agents. We keep that model, but our unit is a function name pattern, not a plugin package.

## Goals / Non-Goals

**Goals:**
- A modular system prompt: one base prompt plus capability sections selected by access.
- One composition object per agent that drives native tools, prompt sections and eval access.
- Database-stored presets, editable by a Creator agent, with shipped defaults and reset.
- Per-agent immutable snapshot; children can only narrow.
- Zero behaviour change for existing agents.
- A new-session preset chip.

**Non-Goals:**
- Process isolation or any security boundary for eval and bash.
- A preset editor UI or a plugin toggle on the Plugins page.
- Limits, SSH hosts, secrets, triggers or budgets in presets.
- A Code-first (PTC) preset.
- Restricting calls made inside an allowed function.

## Decisions

### D1. Data model

```sql
CREATE TABLE agent_presets (
  id          text PRIMARY KEY,             -- kebab-case
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  builtin     boolean NOT NULL DEFAULT false,
  allow       jsonb NOT NULL DEFAULT '[]',  -- string[] of function patterns
  deny        jsonb NOT NULL DEFAULT '[]',
  plugins     jsonb NOT NULL DEFAULT '[]',  -- plugin names or "*"
  exclude_sections jsonb NOT NULL DEFAULT '[]', -- prompt section ids
  prompt      text NOT NULL DEFAULT '',
  updated_at  bigint NOT NULL
);
ALTER TABLE agents ADD COLUMN preset_id text, ADD COLUMN preset_snapshot jsonb;
```

`preset_id` has no foreign key: a deleted preset must not affect agents that use its snapshot.

Type `types.agentPreset.Preset` = the row; `types.agentPreset.Snapshot`:

```ts
{ presetId: string; name: string; layers: Array<{ id: string; allow: string[]; deny: string[]; plugins: string[]; excludeSections: string[]; prompt: string }> }
```

The live `types.agent.Agent` gains `preset?: Snapshot`, loaded and saved with the agent.

*Alternative:* columns for capability groups. Rejected: the person chose name patterns; groups are only code-side constants used to build defaults.

### D2. Access resolution (`agentPreset.allows`)

For a function name `n` (`ns.fn` or `ns.sub.fn`) and a snapshot, `n` is allowed if and only if **every layer** allows it. A layer allows `n` when:
1. no `deny` pattern matches `n`, and
2. by origin of `n`'s top namespace:
   - **plugin** namespace → the layer's `plugins` contains that plugin or `*`;
   - **project-local** namespace (defined only under a project `.mauzcode/<mod>/` root) → allowed;
   - **core** → an `allow` pattern matches `n`.

**Plugin functions are reachable only through `plugins`; `allow` patterns never grant them.** This lets Standard use broad core patterns without a newly installed plugin leaking in. Origin comes from the loader: `plugins.list` gives plugin namespaces; the module loader records which namespaces come only from a project `.mauzcode/` root (exposed as `agentPreset.origin({ name })`). Everything else is core. A project-local file that overrides a core function by name keeps the core origin, so it cannot be used to slip past Standard's list.

Patterns are compiled once per snapshot into a RegExp (`*` → `.*`, other characters escaped; allowed characters `[A-Za-z0-9_.*$-]`, otherwise the definition is rejected). Results are memoised per snapshot, function name and registry generation. Loading, unloading or overriding core, plugin or project-local functions, or changing namespace origin metadata, advances the registry generation; cached decisions from older generations must not be reused. Compiled patterns remain reusable because snapshot rules do not change.

**Snapshot semantics:** snapshots freeze access rules, not the set of functions installed at creation. Existing agents gain newly registered functions matching their rules, subject to every layer's deny patterns and plugin grants. `plugins: ["*"]` grants subsequently installed plugins; `files.*` covers subsequently added core functions in that namespace. Registry changes never rewrite the stored snapshot.

*Why layers instead of computing an intersection:* the intersection of two glob sets is not a glob set. A list of layers evaluated with AND is exact and keeps the parent's rules readable.

### D3. Built-in defaults (shipped constants in `src/agentPreset/defaults.ts`)

- **creator** — `allow: ["*"]`, `deny: []`, `plugins: ["*"]`, `prompt: ""`, sort 20.
- **standard** — sort 10, `plugins: []`, `deny: []`, `excludeSections: []`, `prompt: ""`, explicit core allowlist:
  ```
  tools.read tools.write tools.edit tools.grep tools.find tools.bash tools.eval
  files.* workspace.* git.* markdown.* attachments.* resultStore.*
  session.plan session.done session.updatePlan session.removePlan session.get* session.search*
  input.* canvas.* planning.* goal.tool* agent.respondHtml agent.readResult agent.compact
  agent.delegate agent.team agent.ask agent.steer agent.finishTask agent.archiveMember
  agent.archiveCompleted agent.unarchiveMember agent.search agent.message agent.current
  agent.wake agent.cron agent.watch agent.triggers agent.cancelTrigger agent.cancelAllTriggers
  sharedAgent.list sharedAgent.delegate sharedAgent.result
  runtime.docs.search runtime.docs.get code.callers code.slice code.quality code.coverage code.dead code.boundary
  settings.get settings.getString settings.getNumber settings.list secrets.list remote.servers remote.status
  agentPreset.list agentPreset.get
  plugins.search plugins.read plugins.functions
  ```
  The exact list is fixed in the implementation task after a pass over every core namespace (each one is classified as *Standard*, *Creator only* or *internal*, recorded in `src/agentPreset/coreCatalogue.ts`).
- **minimal** — sort 30, `allow: ["tools.bash", "tools.read", "tools.write", "tools.edit"]`, `deny: []`, `plugins: []`, `excludeSections: []`, `prompt: ""`.

*Alternative for Standard:* `allow: ["*"]` with an admin deny list. Rejected by the person: a new core admin function would leak into Standard by default. Cost of the chosen form: a new core namespace is unavailable to Standard until classified. The catalogue test (task list) fails when a core namespace is missing from `coreCatalogue.ts`, which forces the decision in the same commit.

### D4. Seeding, reset and the default setting

- The migration creates the table and columns, inserts the three built-ins from the constants (`ON CONFLICT DO NOTHING`) and back-fills `agents` with `preset_id = 'creator'` and a Creator snapshot.
- `agentPreset.ensureBuiltins` runs at boot (lifecycle hook) and inserts missing built-ins; it never overwrites edits.
- `agentPreset.reset({ id })` rewrites a built-in from its constant.
- Setting `src/agentPreset/$setting_default.ts`: `{ type: "string", default: "standard" }`.
- `remove` refuses built-ins and the current default.

### D5. Runtime API (`src/agentPreset/`)

| Function | Purpose |
|---|---|
| `list({})` | rows ordered by `sort_order, id` |
| `get({ id })` | one row or `null` |
| `create({ preset })` / `update({ id, patch })` | validate (known fields, kebab id, pattern syntax, string arrays) and write |
| `remove({ id })` / `reset({ id })` | see D4 |
| `resolve({ id?, parent? })` | snapshot of `id` (or the default); with `parent`, returns `parent.layers` followed by the new layer |
| `allows({ snapshot, name })` | D2 |
| `guardFns({ ctx, snapshot })` | D6 |
| `ensureBuiltins({})` | D4 |

Writes need no confirmation. Standard and Minimal cannot reach them by D3 and D6.

### D6. Eval guard

`repl.eval` (the agent-facing wrapper) receives `agent`. When `agent.preset` is present it passes `procs.repl.eval` a guarded ctx:

```ts
const guarded = Object.create(ctx);
Object.defineProperty(guarded, "fns", { get: () => guardProxy(ctx, snapshot) });
```

`guardProxy` mirrors `wrapFns` path by path. When a function value is reached at path `n`, it checks `allows(snapshot, n)`. If denied, it throws `Error("<n> is not available in preset <name>")` before calling. If allowed, it calls the raw function with the **unguarded** parent ctx. Calls made inside the function therefore use the normal proxy, so internal calls are not checked (spec: boundary-only). Namespace objects stay readable, so `if (ctx.fns.services)` probes keep working.

`procs.repl.eval` gets an optional `ctx` override (`opts.evalCtx`) instead of always using `Object.create(ctx)`. Nothing else changes there.

Known bypasses, documented and accepted: `ctx.state.registry`, `await import()`, `Bun.$`, `process`, and bash. The guard steers the agent; it does not isolate it.

### D7. Native tools and `tools.call`

- `agent.wireTools`: keep a tool when `allows(snapshot, tool.fn ?? module + "." + name)` and, if `agent.tools` is non-empty, it is also in `agent.tools`.
- `tools.call` with `agent`: rejects a tool whose function is denied, with the same error text. This covers a model that calls a tool name it was not offered.
- `tools.promptSection` gains `allow?: (name: string) => boolean` and filters the same way.

### D8. Modular system prompt

`SYSTEM_PROMPT_CORE.txt` (one 20 KB block) is split into a **base prompt** and **capability sections**.

**Base** (`src/agent/SYSTEM_PROMPT_BASE.md`): identity, reply rules, tool discipline for the native tools, workspace and scratch-file rules, hard rules that hold for every agent (never mutate transcript directly, compact large results, secrets never in chat). It contains no `ctx.fns` API. It includes a generic requirement to read and follow applicable workspace `AGENTS.md` instructions, without embedding MauzCode-specific project policies.

**Sections** are files `src/<mod>/$prompt_<id>.md` (and `<plugin>/src/<mod>/$prompt_<id>.md`), loaded by a new `$loader_prompt` the same way `$loader_tool` loads `$tool_`:

```md
---
id: delegation            # unique; default <mod>.<file id>
title: Delegation         # heading
requires: [agent.delegate, agent.team]   # all must be allowed
order: 40                 # position in the prompt
---
…markdown body…
```

Initial sections, cut from today's CORE and `fullSystemPrompt` inline blocks:

| id | requires | content |
|---|---|---|
| `eval` | `tools.eval` | calling convention, ctx shape, namespaces, docs search |
| `storage` | `procs.db.select` | Postgres rules, queue facts |
| `codeGraph` | `code.slice` | call-graph usage |
| `authoring` | `procs.dev.createFunction`, `procs.repl.load` | architecture conventions, createFunction, hot-reload, typecheck rules |
| `plans` | `session.plan` | plans |
| `delegation` | `agent.delegate` | delegate, team, children |
| `agentMessaging` | `agent.message` | agent search and messages |
| `sharedAgents` | `sharedAgent.delegate` | shared context agents |
| `triggers` | `agent.wake` | wake, cron, watch |
| `secrets` | `secrets.list` | secret handling |
| `input` | `input.request` | chat inputs (today's `input.promptSection`) |
| `canvas` | `canvas.show` | canvas (today's `canvas.promptSection`) |
| `plugins` | `plugins.search` | plugin workflow + index of **granted** plugins only |
| `tools` | — | generated from allowed `$tool_` declarations (today's `tools.promptSection`) |
| `fences` | — | markdown fences (output channel, always on) |

Dynamic sections (`tools`, `plugins`, `input`, `canvas`, `fences`) keep their generator functions. Their `$prompt_` file declares `generator: <mod>.<fn>`, and the generator receives the `allows` predicate.

**Assembly** in `agent.fullSystemPrompt`: base → sections sorted by `order` where `requires ⊆ allowed` and `id ∉ excludeSections` of any layer → `## Preset instructions` (each layer's non-empty `prompt`) → `## Per-agent instructions` (`agent.systemPrompt`) → runtime context block (always).

Minimal therefore gets: base + `tools` + `fences` + runtime context, with no special case.

**Project instructions:** MauzCode UI design and implementation policies belong in the repository's `AGENTS.md` (`CLAUDE.md` links to it), not in the base prompt or a capability section. Preserve the required design-guide and UI-architecture reading links there, scoped to work on MauzCode itself. Reading these project instructions must not depend on access to `ui.eval`.

**Creator equivalence:** compare the assembled Creator prompt with the reviewed snapshot, allowing reordering and only the explicitly enumerated MauzCode project-policy paragraphs moved to `AGENTS.md`. Record those exact paragraphs in a reviewed relocation manifest and verify their coverage in `AGENTS.md`; no other omissions are allowed. Verify that every preset retains the generic project-instructions rule and that generated system prompts do not embed the relocated MauzCode UI policies.

Plugins may ship sections; they are included only when the plugin is granted (because their `requires` names plugin functions). `plugins.search/read/functions` and `runtime.docs.search/get` accept an optional `allow` predicate, and the eval guard passes it, so discovery shows only reachable functions. Standard explicitly allows these discovery functions; ungranted plugins are omitted from search and their read/functions requests return no documentation. The generated plugin workflow/index section is omitted when no granted mounted plugin has a reachable function.

### D9. Spec refinements (already applied in specs/)

- "Function access resolution": plugin functions only through `plugins`; project-local functions allowed unless denied; core through `allow`.
- "Standard preset defaults": explicit core list; a new core namespace is denied until classified.
- "Modular system prompt": base + sections with `requires`, preset `excludeSections`, plugin-shipped sections.

### D10. Snapshot lifecycle

- `ui.createAgent({ presetId? })` → `agentPreset.resolve({ id })` → `agent.preset`, saved by `session.save` (`preset_id`, `preset_snapshot`). An unknown id throws.
- `session.fork({ presetId? })` → `resolve({ id: presetId, parent: parent.preset })`; without `presetId` it copies the parent snapshot. The goal sidecar and every existing fork caller inherit unchanged.
- `agent.delegate`, `agent.delegateTask` and `sharedAgent.delegate` accept an optional `presetId` and pass it through.
- `session.load` reads the snapshot. A row without a snapshot (should not exist after the migration) is treated as Creator and logged with `procs.log.warn`.
- No API changes `preset_id` after creation; `session.save` writes the columns only on insert.

### D11. HTTP and UI

- `GET /ui-lab-api/new-session` adds `presets: [{ id, name, description, sortOrder }]` and `defaultPresetId`.
- `POST` accepts `presetId` (string, optional); an unknown id returns 400 before anything is created.
- `frontend/src/lib/newSession.ts`: `NewSessionDraft.presetId?`, sent when set. A restored draft with an unknown id falls back to the default.
- `NewSessionComposer.tsx`: replace the static `Standard mode` span with a `Menu.Root` built like the Workspace chip (radio items, description as secondary text, `Network` icon, disabled while `busy || pending`).
- Chat header: the agent meta payload adds `presetName`, shown as a small read-only label.

## Risks / Trade-offs

- **Not a sandbox** → stated in specs, the CORE prompt (Creator) and `docs/agent-presets.md`; nobody should rely on it for untrusted agents.
- **Standard allowlist drift:** new namespaces are denied until classified, but new functions under existing wildcard grants become available → catalogue coverage plus an `AGENTS.md` review checklist requiring review of new functions within granted namespaces.
- **Plugin namespace mapping at check time:** uninstalling a plugin turns its namespace into core, which `allow: ["*"]` would grant if code remained loaded → `plugins.remove` unloads namespaces; a test covers an unmounted namespace.
- **Prompt split regressions:** Creator could silently lose an instruction → equivalence snapshot test (D8).
- **Unclassified core namespace:** Standard silently lacks a new feature → catalogue test forces classification.
- **Prompt cache:** registry changes can change discovery, tools and capability sections for an unchanged snapshot → invalidate any derived prompt/discovery cache on the relevant registry generation; never assume immutable rules mean immutable assembled prompts.
- **Hidden-tool rejections:** older transcripts of agents back-filled as Creator are unaffected; Standard agents never saw denied tools.
- **Two "preset" words:** legacy prompt presets (removed) versus agent presets → the UI says "Режим" and the code uses `agentPreset`; the `new-session-options` delta clarifies the difference.
- **Performance:** one memoised regex check per tool and per eval call; negligible.
