# Agent presets

A preset is a stored, named composition of core function patterns, plugin grants, excluded prompt sections and additional instructions. At creation an agent receives an independent snapshot of those rules. Editing or deleting the stored definition does not change existing snapshots. There is no switch-preset operation for an existing agent.

## Built-ins and defaults

- **Standard**: reviewed core code/task functions, discovery and delegation; exactly `openspec`, `git`, `websearch`, `browser`, `gh`, `terminal` and `glab` plugin grants (no wildcard). Project discovery grants only `projects.list` and `projects.get`, not project creation, deletion, modification or `projects.chats`. Existing `planning.*` and `input.*` grants remain available. Runtime management and settings/preset writes remain denied.
- **Creator**: `allow: ["*"]`, `plugins: ["*"]`.
- **Minimal**: `tools.bash`, `tools.read`, `tools.write`, `tools.edit`; no plugins.

Built-ins are seeded by migration and restored when missing at boot, after migrations and before agents resume. Boot never overwrites edits. `agentPreset.reset({ id: "standard" })` restores the shipped definition. Built-ins cannot be deleted. Custom presets can be deleted unless selected by `agentPreset.default` (which defaults to `standard`). A missing default is an error naming that identifier, not an implicit fallback. Pre-preset agents are migrated to Creator to preserve their behaviour.

## Upgrading Standard

The Standard default upgrade changes a stored definition only if every user-configurable field matches the recognized previous factory definition. Customized definitions are preserved; Creator and Minimal are unchanged. The upgrade is idempotent and never rewrites existing agent snapshots. Only agents created afterwards receive the upgraded stored rules.

To opt in explicitly after customizing Standard, use the preset editor to add the seven plugin grants and `projects.list` / `projects.get` while retaining your other changes. Alternatively, `agentPreset.reset({ id: "standard" })` restores the entire shipped definition, replacing custom rules, prompt and exclusions. Create a new agent to use the resulting grants; an existing agent keeps its snapshot.

A grant enables capability-filtered documentation and instructions for installed plugins, not installation, authentication or external-service setup. CLI tools, credentials, browser connections and other plugin prerequisites must still be configured separately. Denies and parent/child intersections still apply. Plugin-specific input kinds require their declared plugin capabilities. Outward actions still require their existing human confirmation process; Plan mode still prohibits OpenSpec artifact writes before approval. Presets do not grant permission to bypass either guard.

## Patterns and origins

Patterns match the complete dotted runtime name. `*` matches any sequence, including dots: `procs.*` matches `procs.dev.typecheck`. Allowed pattern characters are letters, digits, `_`, `.`, `*`, `$` and `-`; these are globs, not regular expressions. A matching deny always wins.

- Core functions require a matching `allow` pattern.
- Plugin functions require their plugin identifier in `plugins`, or `"*"`. Core `allow` patterns never grant plugins. A plugin grant covers all of its declared namespaces; missing plugins are harmless. Denies can narrow a plugin grant.
- Project-local namespaces defined only in `.mauzcode/` are allowed unless denied. A local override of a core name keeps its core origin.

Snapshots freeze **rules**, not installed functions. New core functions matching an existing `files.*` grant become available. `plugins: ["*"]` includes plugins installed later. Current registry origins and generation determine access; changing registration or origin invalidates cached decisions without rewriting a snapshot. New core namespaces are unavailable to Standard until classified in `coreCatalogue.ts`.

Children inherit an independent copy when no preset is selected. Selecting a child preset appends its layer after the parent's layers; every layer must allow the call. Thus Creator cannot widen a Standard parent's access. Both prompt additions and exclusions remain represented in the layers.

## Management API

Use `agentPreset.list({})` for menu order (`sort_order`, then `id`), and `get({ id })` for a row or `null`. `create({ preset })` requires a unique kebab-case `id` and nonempty `name`; other writable fields are `description`, `sort_order`, `allow`, `deny`, `plugins`, `exclude_sections` and `prompt`. Omitted arrays default to empty, text to empty, and sort order to zero. `update({ id, patch })` changes only supplied fields. Storage owns `builtin` and `updated_at`; they and `id` are not patchable. Unknown fields, malformed patterns, invalid plugin identifiers and non-string array entries fail validation. Writes do not require an additional confirmation when the calling agent is allowed to perform them.

For example, a Creator can grant OpenSpec to future Standard agents:

```ts
await ctx.fns.agentPreset.update({
    id: "standard",
    patch: { plugins: ["openspec"] },
});
```

This replaces the plugin list; read the current row first when preserving other grants. `remove({ id })` returns whether a custom row was deleted. `reset({ id })` is built-in only. `resolve({ id?, parent? })` copies rules into a snapshot, using the configured default for root creation and copying the parent when both a parent and no explicit id are supplied. Unknown identifiers fail explicitly.

## Prompt size and exclusions

Prompt brevity changes presentation, **not access rules or snapshots**. All presets use the same compact, API-free base; capability-specific sections are included only when every required runtime function is allowed by every snapshot layer. Standard should not inherit Creator-only runtime-management instructions simply because it can edit target-project files. MauzCode is the host, not necessarily the target project: follow the target's own stack and instructions.

Keep section IDs, ordering and exclusion behavior stable when shortening prose; required APIs must cover the workflow actually advertised. An `excludeSections` entry in **any** frozen layer still removes the matching section. Excluded sections must not leak back through a catch-all section, generator, preset-specific summary or base text. Stored `exclude_sections`, snapshot layers, denies, plugin grants and user-added instructions are unchanged; shortening shipped prompt text does not rewrite any of them. Generators filter advertised functions with their supplied `allows` predicate. See [architecture](architecture.md#capability-prompt-sections).

Detailed host policies live in `AGENTS.md` and linked topic docs rather than duplicated UI/SSR/runtime paragraphs in each turn. Runtime authoring remains discoverable from external workspaces through `runtime.docs.get({ name: "procs.dev.createFunction" })`; [runtime-authoring.md](runtime-authoring.md) is the longer reference in the host checkout. The historical Creator fixture is retained as evidence, while active regression tests cover intentional concise wording, important invariants, preset capability boundaries and unchanged exclusions—not verbatim preservation of superseded paragraphs.

## Guardrail, not a sandbox

See the [optimization record](agent-prompt-optimization.md) for controlled measurements, reviewed relocations and verification limitations.

Presets steer what an agent is offered and calls directly. They are **not a security or isolation boundary**. Evaluation and shell commands still execute with server-process privileges; imports, raw runtime state, process APIs and shell access are not isolated by presets. Calls made internally by an allowed function use normal access. Do not use presets to execute untrusted agents or code safely; actual isolation requires a separate security boundary.

The management/storage API does not itself authorize callers: preset guards at the direct invocation boundary are responsible for limiting Standard and Minimal. Native tools, discovery and prompt sections must follow that same boundary policy.
