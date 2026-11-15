# Proposal

## Why

An agent with the Standard preset and no plugin grants can enumerate installed integrations through `Object.keys(ctx.fns)` even though direct calls and the mounted-plugin prompt are filtered. Reflection also exposes raw registry values through property descriptors, making the offered API inconsistent with the preset and confusing agents about available capabilities.

## What Changes

- Make the agent-evaluation `ctx.fns` discovery view show only allowed functions and namespaces with at least one allowed descendant, including nested namespaces.
- Cover enumeration, membership and property descriptors together; descriptor values must not expose raw registry objects or unguarded procedures.
- Keep explicit denied calls rejected with the existing function-and-preset diagnostic, and keep allowed procedures' internal calls unrestricted.
- Audit adjacent supported discovery surfaces: runtime documentation, plugin workflows and function catalogues, native tools, generated prompts, canvas kinds and input kinds. Apply the same access predicate wherever these surfaces advertise callable capabilities.
- Add regression coverage for Standard, Creator, restricted/custom and inherited snapshots, partial plugin grants and live registry changes.
- Document the boundary: this removes accidental discovery noise, not server-level access through shell, raw state, files or arbitrary JavaScript. Existing transcripts and preset snapshots are not rewritten.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-presets`: define consistent preset-scoped reflection and supported capability-discovery results, with lifecycle and compatibility guarantees.

## Impact

- Primary implementation: `src/agentPreset/guardFns.ts`, its tests and the agent-facing evaluation boundary.
- Adjacent audit: plugin/runtime discovery, tool schemas, prompt generators, canvas and input capability catalogues.
- No database migration, new dependency, preset-default change, session recreation or UI redesign is required.
- Unscoped internal runtime behaviour remains unchanged. Creator retains discovery of annotated kinds whose required functions are live and allowed; unannotated canvas/input kinds, including those from external plugins, are omitted from scoped catalogues and generated guidance even for Creator until their dependency metadata is supplied. This discovery change does not alter action authorization.
- Code intentionally enumerating denied names through a restricted agent's evaluation context will now see a filtered catalogue.
- This change is a proposal for review; application code is not modified by preparing these artifacts.
