## Context

Native tools are declared by `$tool_*.md` files and dispatched by `src/tools/call.ts`; `src/agent/wireTools.ts` builds the per-agent tool list filtered by `agent.tools` and the frozen preset. Discovery (`runtime.docs.search/get`, `plugins.search/read`), `agent.readResult` and `input.request` are eval-only today. In eval, `src/agentPreset/guardFns.ts` injects a trusted `allows` predicate into discovery calls; a plain native mapping to the same functions would skip it. `runtime.docs.search` filters after taking a 60-row candidate pool, and the dispatcher's unknown-tool error prints unfiltered names. `src/goal/toolCreate.ts` is the existing example of a native adapter that takes authority from the trusted invocation. `tools.call` and `wireTools` check the preset only against the tool's own `fn`, so an adapter function would be checked instead of the capability it wraps. `agent.stashResult` stores any tool output over 6000 characters and leaves an eval-only hint, so a 16000-unit `read_result` would itself be re-stored. Source analysis: `research/` (README sections 5–6, `appendices/adapter-review.md`).

## Goals / Non-Goals

**Goals:**
- Four typed native tools over existing capabilities, with no new authority.
- Same permission, ownership and result semantics as the eval route, plus closing the two known discovery leaks.
- A measurable baseline to decide on the next bundles.

**Non-Goals:**
- Deferred schema activation, a generic `call(name, args)` bridge, MCP.
- Background process tools, plan/delegation tools, web tools.
- Removing or restricting `tools_eval`.

## Decisions

1. **Dedicated adapters, not aliases.** Each tool gets its own handler (e.g. `src/tools/toolSearch.ts`, `toolDescribe.ts`, `readResult.ts`, `requestInput.ts`) that rejects unknown keys, builds the trusted context and calls the underlying function. Alternative — declare `fn: runtime.docs.search` directly — rejected because it loses the preset predicate and accepts model-supplied `allows`.
2. **One trusted permission predicate.** Extract the predicate used by `guardFns` into a function that the adapters call with the invocation's frozen preset, so eval and native paths cannot diverge.
3. **Filter before ranking.** Push the predicate into candidate selection of `runtime.docs.search` (SQL-side name filter or iterative widening until `limit` allowed rows or exhaustion). This also fixes the eval path.
4. **Merged search.** `tool_search` merges runtime function hits and plugin workflow hits into one compact list `{ name, kind: "function"|"workflow", summary, source }`. There is no `available` field: denied entries are filtered out, so every returned entry is available. `tool_describe` accepts an exact function name or an exact mounted plugin name. For a function it uses `runtime.docs.get` metadata and strips `ctx`, `session`, `agent`, `agentId`, `allows` and similar trusted fields; for a plugin it uses `plugins.read` with the trusted predicate and returns the workflow overview plus the index of allowed functions. Function names win when a string matches both.
5. **Unknown and denied tool errors.** The dispatcher returns one message for an unknown tool and for a tool denied by the preset; it lists only names from the caller's wire tool list and never names the denied implementing function or preset.
6. **`request_input` binding and stop.** The adapter passes the trusted agent id and never reads `agentId` from args. When `waitForAnswer` is true, the run loop treats the result like other terminal control results: skip remaining calls of that response and end the turn; answers queued earlier are delivered once on the next turn.
7. **Capability mapping.** Tool frontmatter gains an optional `requires: string[]` of wrapped function names: `tool_search` → `runtime.docs.search`, `plugins.search`; `tool_describe` → `runtime.docs.get`, `plugins.read`; `read_result` → `agent.readResult`; `request_input` → `input.request`. `wireTools` advertises and `tools.call` executes a tool only when the preset allows its own `fn` and every `requires` entry; the adapter functions are classified in `coreCatalogue` beside the functions they wrap. The handler still applies the trusted predicate to each result; wire-list presence never replaces it.
8. **Prompts.** Prompt sections that teach `ctx.fns.agent.readResult`, `runtime.docs.search` and `input.request` through eval switch to the native tool when it is present in the agent's tool list and keep the eval text otherwise.
9. **Inline `read_result`.** `agent.stashResult` returns `read_result` output inline (at most 16000 units plus a small envelope) instead of storing it again, and the large-result preview hint names `read_result` when that tool is in the agent's tool list, otherwise the eval call.
10. **Two discovery tools.** `tool_search` and `tool_describe` stay separate tools rather than one tool with a mode, matching the analysis and keeping each schema small.

## Risks / Trade-offs

- Schema tokens grow for every request → keep descriptions short; measure in the A/B before adding more tools.
- Divergence between native and eval paths → shared predicate and parity tests.
- Provider schema differences (strict mode, unions in `spec`) → `spec` is a free object validated by the handler; strict mode only where the schema is compatible; test OpenAI Chat/Responses, Anthropic and Gemini adapters.
- Hot reload between advertise and call → the dispatcher resolves the current handler; a removed tool returns a clear error, never a different handler.

## Migration Plan

Additive. Ship the tools enabled for presets that already allow the underlying capability; rollback by removing the declarations — the eval route keeps working throughout.

## A/B Baseline

A fixed scenario set (discovery, large-result recovery, structured question, mixed) runs once with only `tools_eval` and once with the native tools, same model and preset. Metrics: task success, calls failing on parameters or typecheck, total tokens, p50/p95 model turns. Proceed to the next bundle only if success does not drop and either tokens or p50 turns fall by at least 10%.
