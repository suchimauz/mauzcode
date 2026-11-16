## Why

Agents reach runtime discovery, stored result retrieval and human input only through `tools_eval`, so every such step costs a code-writing round trip, typecheck failures and untyped results (see `research/README.md`, section 5). A small set of typed native tools over existing capabilities should cut that friction without granting any new authority, and gives a measurable first step before larger work such as background process management.

## What Changes

- Add native tool `tool_search`: permission-scoped search over runtime functions and plugin workflows, returning compact exact names, kinds, summaries and source.
- Add native tool `tool_describe`: input schema, return type and documentation for one available function, or the workflow overview and allowed function index for one mounted plugin, without source code or internal authority parameters.
- Add native tool `read_result`: bounded range reads of a stored result UUID with the same ownership, limits and error codes as the existing eval API.
- Add native tool `request_input`: open a structured chat input (choice, confirm, grid, batch, secret and other registered kinds) bound to the invoking agent, returning the request id and stopping the turn when waiting.
- Discovery tools only find APIs; they do not activate new native schemas or offer a generic invoke bridge. `tools_eval` stays unchanged.
- No new grants: each tool declares the capabilities it wraps (`requires`), and is advertised and executed only when the caller's preset allows both the adapter and every required capability; results never reveal denied functions, including through error messages.

## Capabilities

### New Capabilities

- `native-capability-discovery`: native `tool_search` and `tool_describe` contracts, permission filtering before ranking, and leak-free negative paths.
- `native-result-retrieval`: native `read_result` contract for bounded, ownership-checked reads of stored tool and trigger results.
- `native-user-input`: native `request_input` contract for structured chat inputs with trusted agent binding, wait semantics and secret-safe results.

### Modified Capabilities

None. Preset classification of the new tools is covered by the new capabilities' requirements; existing `agent-presets` requirements are unchanged.

Research behind this change (harness comparison with pinned source links) is kept in `research/`.

## Impact

- New tool declarations and thin adapters beside existing ones (`src/tools`, `src/goal` style), over `runtime.docs.search/get`, `plugins.search/read`, `agent.readResult` and `input.request`.
- Tool declarations: optional `requires` list checked by `agent/wireTools.ts` and `tools/call.ts`; native results from `read_result` are returned inline, not re-stored by `agent.stashResult`.
- Discovery filtering: `runtime.docs.search` must filter before candidate truncation; unknown-tool and preset-denied errors in the dispatcher must be identical and must not list denied names.
- Agent presets, wire tool lists for OpenAI Chat/Responses, Anthropic and Gemini adapters, prompt sections that currently teach the eval-only route, and runtime docs.
- Out of scope: background processes (`exec_*`), plan/delegation tools, web tools, deferred schema activation, MCP and any generic call bridge — separate changes.
