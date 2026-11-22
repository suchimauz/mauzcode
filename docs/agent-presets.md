# Agent presets

A preset is a named composition of core function patterns, plugin grants, excluded prompt sections and additional instructions. Built-ins are generated from shipped code; custom definitions are stored only in PostgreSQL, never generated into source files. At creation an agent receives an independent snapshot of those rules. Changing shipped code or editing/deleting a custom definition does not change existing snapshots. There is no switch-preset operation for an existing agent.

## Built-ins and defaults

- **Standard**: reviewed core code/task functions, discovery and delegation; exactly `openspec`, `git`, `websearch`, `browser`, `gh`, `terminal` and `glab` plugin grants (no wildcard). Project discovery grants only `projects.list` and `projects.get`, not project creation, deletion, modification or `projects.chats`. Existing `planning.*` and `input.*` grants remain available. Runtime management and settings/preset writes remain denied.
- **Creator**: `allow: ["*"]`, `plugins: ["*"]`.
- **Minimal**: `tools.bash`, `tools.read`, `tools.write`, `tools.edit`; no plugins.

`agentPreset.defaults` generates fresh built-in definitions, including Standard's reviewed core catalogue. `get` and `list` combine these with custom database rows; stored reserved-ID rows can never shadow code. Reads and startup never seed, repair or upgrade stored copies. Built-ins have `builtin: true` and deterministic `updated_at: 0` (code-managed, not an epoch update date). Custom rows retain their database timestamps.

The built-in identifiers `standard`, `creator` and `minimal` are reserved even with an empty table: create, update and remove reject them. Customize a distinct custom ID instead. `agentPreset.reset({ id: "standard" })` is a compatibility read returning today's code definition without writes; its existing capability gate is unchanged. Custom presets can be deleted unless selected by `agentPreset.default` (which defaults to `standard`). A missing default is an explicit error, not an implicit fallback. Historical migration of pre-preset agents to Creator remains unchanged.

The core entrypoints `websearch.search`, `providers`, `answer`, `read` and `fetch` retain the mounted `websearch` plugin grant. Neither a core wildcard alone nor a disabled plugin grants them. Explicit denies and parent layers apply to nested stages too: allowing `answer` does not grant `search`. Physical engine handlers and setting descriptors remain plugin-owned; discovery lists permitted facade members under that plugin without exposing denied handlers.

## Legacy transition and future upgrades

The forward migration `20380105120000_separate_builtin_presets` runs after the historical preset migrations, atomically under a table lock. It compares each reserved-ID row with current code across every editable field; rule arrays are compared as sets, ignoring order, timestamps and storage flags. An equivalent row is removed without a copy. Every differing definition—including an old factory version whose provenance cannot be proved—is preserved under `<id>-custom`, then `<id>-custom-2`, etc. on collision, with a name such as `Standard (preserved custom)`. Rules, description, sort order, prompt and timestamp are retained. Other legacy `builtin=true` rows keep their ID and become custom. Existing custom rows are not overwritten. Failures roll back; reruns create no extra copies.

Migration diagnostics report old-to-preserved identifiers, never prompt contents. Discover the actual ID in Settings → Agent presets or `agentPreset.list({})`; do not assume `standard-custom` was available. A preserved Standard with `nrepl` and `openspec` intentionally differs from today's shipped Standard and is shown as a separate Custom card. To keep those old settings for future agents, explicitly select its actual ID, or explicitly configure it as `agentPreset.default`.

**Breaking default meaning:** the migration never changes `agentPreset.default`, agent `preset_id` or snapshot bytes. A default of `standard` still names `standard`, but future agents now receive current shipped Standard. Existing agents retain their old rules. Subsequent shipped-definition updates require neither stored-Standard upgrades nor reset: new snapshots read code directly. Custom copies remain independent.

### Guarded deployment and downgrade

Implementation and tests do not authorize production migration. Obtain separate deployment/maintenance approval, quiesce preset writes and agent creation, and back up the database (including presets, settings, agent identifiers and snapshots) before running normal migrations. Run the complete forward chain before agents resume; verify only custom rows remain, built-ins resolve to code, preserved IDs are discoverable, and defaults/snapshot bytes are unchanged. Repeated boot must not recreate built-in rows.

Downgrade is a separately approved maintenance operation, not an automatic destructive down migration. Old binaries expect stored built-ins: restore from the backup or explicitly reconstruct the intended old built-in rows before loading old code. Reconcile and preserve custom records and snapshots created since the backup; never blindly restore over or delete preserved custom data.

A grant enables capability-filtered documentation and instructions for installed plugins, not installation, authentication or external-service setup. CLI tools, credentials, browser connections and other plugin prerequisites must still be configured separately. Denies and parent/child intersections still apply. Plugin-specific input kinds require their declared plugin capabilities. Outward actions still require their existing human confirmation process; Plan mode still prohibits OpenSpec artifact writes before approval. Presets do not grant permission to bypass either guard.

## Patterns and origins

Patterns match the complete dotted runtime name. `*` matches any sequence, including dots: `procs.*` matches `procs.dev.typecheck`. Allowed pattern characters are letters, digits, `_`, `.`, `*`, `$` and `-`; these are globs, not regular expressions. A matching deny always wins.

- Core functions require a matching `allow` pattern.
- Plugin functions require their plugin identifier in `plugins`, or `"*"`. Core `allow` patterns never grant plugins. A plugin grant covers all of its declared namespaces; missing plugins are harmless. Denies can narrow a plugin grant.
- Project-local namespaces defined only in `.mauzcode/` are allowed unless denied. A local override of a core name keeps its core origin.

Snapshots freeze **rules**, not installed functions. New core functions matching an existing `files.*` grant become available. `plugins: ["*"]` includes plugins installed later. Current registry origins and generation determine access; changing registration or origin invalidates cached decisions without rewriting a snapshot. New core namespaces are unavailable to Standard until classified in `coreCatalogue.ts`.

### Native tools and `requires`

A native tool (`$tool_<name>.md`) is advertised by `agent.wireTools` and executed by `tools.call` only when the preset allows its `fn` **and** every name in its optional `requires` list (`tools.permitted`). Adapters that wrap existing capabilities list them there, so the check covers the capability rather than just the adapter; a malformed `requires` denies the tool. Unknown and preset-denied tool calls return the same `unknown tool` error, listing only tools the agent may call. Trusted discovery filtering comes from `agentPreset.predicate`, shared by the eval boundary (`guardFns`), the system prompt and native adapters; it is never taken from model arguments.

Native discovery tools: `tool_search` (`requires`: `runtime.docs.search`, `plugins.search`) returns compact `{ name, kind: function|workflow, summary, source }` entries for allowed functions and plugin workflows; `tool_describe` (`requires`: `runtime.docs.get`, `plugins.read`) returns one allowed function's docs, input schema without trusted parameters, and return type, or one plugin's workflow overview with its allowed functions. Exact function names win over plugin names; denied and missing names fail identically; neither tool returns source code or adds tools to the wire list.

Children inherit an independent copy when no preset is selected. Selecting a child preset appends its layer after the parent's layers; every layer must allow the call. Thus Creator cannot widen a Standard parent's access. Both prompt additions and exclusions remain represented in the layers.

## Effective-catalogue consumer inventory

- `agentPreset.defaults` generates built-ins from the reviewed `coreCatalogue`; `get` and `list` are the shared effective read boundary. Only preset CRUD and historical/forward migrations access `agent_presets` directly.
- `agentPreset.resolve` reads `get` and the `agentPreset.default` setting, then copies or intersects snapshot layers. Root creation (`agent.start`, `agent.createFromValues`, `ui.createAgent`) and delegation (`agent.delegateTask`) use this boundary. Stored agent snapshots are loaded independently; catalogue reads never refresh them.
- `frontendBridge.agentPresets` reads `list` for full owner Settings definitions and checks the configured default against the catalogue. `frontendBridge.newSession` uses `list` for the minimal menu projection and `get` for explicit selection validation; creation ultimately uses `resolve`.
- Startup's `agentPreset.$start` and the test harness historically called `ensureBuiltins`; these compatibility paths must not seed or repair rows. Historical preset migrations remain intact; the forward transition removes their obsolete rows before normal startup.
- The React `AgentPresetsPanel` displays the owner endpoint projection, not a separate database query. No other production table consumers were found by the scoped `agent_presets` audit.

## Management API

Use `agentPreset.list({})` for the effective catalogue in menu order (`sort_order`, then `id`), and `get({ id })` for an independent effective definition or `null`. `create({ preset })` requires a unique kebab-case `id` and nonempty `name`; other writable fields are `description`, `sort_order`, `allow`, `deny`, `plugins`, `exclude_sections` and `prompt`. Omitted arrays default to empty, text to empty, and sort order to zero. `update({ id, patch })` changes only supplied fields of a custom preset. Creating, updating or deleting any built-in ID fails without writes and directs callers to a distinct custom preset. Storage owns `builtin` and `updated_at`; they and `id` are not patchable. Unknown fields, malformed patterns, invalid plugin identifiers and non-string array entries fail validation. Writes do not require an additional confirmation when the calling agent is allowed to perform them.

For example, a Creator can make an independent custom copy of shipped Standard with an additional grant:

```ts
const preset = await ctx.fns.agentPreset.get({ id: "standard" });
if (!preset) throw new Error("Missing standard preset");
const { builtin, updated_at, ...definition } = preset;
await ctx.fns.agentPreset.create({
    preset: { ...definition, id: "team-standard", name: "Team Standard",
        plugins: [...new Set([...preset.plugins, "nrepl"])] },
});
```

Select `team-standard` explicitly for a new agent. Later `update` calls target that custom ID, not `standard`. `plugins` replaces the list, so merge current grants to retain unrelated choices. The same applies to a preserved custom ID discovered after migration. Plugin grants remain subject to denies, inherited layers and action-specific approvals. `remove({ id })` returns whether a custom row was deleted. `reset({ id })` accepts built-ins only and never writes. `resolve({ id?, parent? })` copies rules into a snapshot, using the configured default for root creation and copying the parent when both a parent and no explicit id are supplied. Unknown identifiers fail explicitly.

## Settings view

Settings → **Agent presets** is a read-only owner view of generated built-ins and stored custom presets in `list` order: name, id, description, Built-in/Custom badge, allow/deny/plugin/excluded-section lists (`none` when empty, `*` labelled as everything), prompt text, sort order and source/update information: built-ins say "Managed by code", while custom cards show their stored update time. The configured default carries a "Default for new sessions" marker; when that preset is missing the panel warns instead. It offers no write controls — edit presets through the Management API above.

The panel reads `GET /ui-lab-api/agent-presets` (`frontendBridge.agentPresets`): owner-only (401 unauthenticated, 403 non-owner, 405 with `Allow: GET` otherwise), `Cache-Control: no-store`, `Vary: Cookie`. Response: `{ version: 1, presets: [{ id, name, description, sortOrder, builtin, allow, deny, plugins, excludeSections, prompt, updatedAt }], defaultPresetId, defaultPresetMissing }`. The new-session menu endpoint deliberately keeps exposing only `id`, `name`, `description` and `sortOrder`.

## Prompt size and exclusions

Prompt brevity changes presentation, **not access rules or snapshots**. All presets use the same compact, API-free base; capability-specific sections are included only when every required runtime function is allowed by every snapshot layer. Standard should not inherit Creator-only runtime-management instructions simply because it can edit target-project files. MauzCode is the host, not necessarily the target project: follow the target's own stack and instructions.

Keep section IDs, ordering and exclusion behavior stable when shortening prose; required APIs must cover the workflow actually advertised. An `excludeSections` entry in **any** frozen layer still removes the matching section. Excluded sections must not leak back through a catch-all section, generator, preset-specific summary or base text. Stored `exclude_sections`, snapshot layers, denies, plugin grants and user-added instructions are unchanged; shortening shipped prompt text does not rewrite any of them. Generators filter advertised functions with their supplied `allows` predicate. See [architecture](architecture.md#capability-prompt-sections).

Detailed host policies live in `AGENTS.md` and linked topic docs rather than duplicated UI/SSR/runtime paragraphs in each turn. Runtime authoring remains discoverable from external workspaces through `runtime.docs.get({ name: "procs.dev.createFunction" })`; [runtime-authoring.md](runtime-authoring.md) is the longer reference in the host checkout. The historical Creator fixture is retained as evidence, while active regression tests cover intentional concise wording, important invariants, preset capability boundaries and unchanged exclusions—not verbatim preservation of superseded paragraphs.

## Guardrail, not a sandbox

See the [optimization record](agent-prompt-optimization.md) for controlled measurements, reviewed relocations and verification limitations.

Presets steer what an agent is offered and calls directly. They are **not a security or isolation boundary**. Evaluation and shell commands still execute with server-process privileges; imports, raw runtime state, process APIs and shell access are not isolated by presets. Calls made internally by an allowed function use normal access. Do not use presets to execute untrusted agents or code safely; actual isolation requires a separate security boundary.

The management/storage API does not itself authorize callers: preset guards at the direct invocation boundary are responsible for limiting Standard and Minimal. Native tools, discovery and prompt sections must follow that same boundary policy.
