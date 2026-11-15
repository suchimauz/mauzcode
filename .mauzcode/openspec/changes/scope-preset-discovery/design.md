# Design

## Context

`agentPreset.allows` already intersects frozen snapshot layers with live origins. `guardFns` currently implements only `get`, checking access when a function is invoked and injecting `allows` into five discovery procedures. The underlying injecting proxy in `src/$main.ts` also implements only `get`. Consequently reflection passes through to raw registry properties.

Read-only reproduction against the existing Standard agent `np` confirmed:

- `Object.keys(guarded)` includes `gh`, `glab`, `redmine`, `telegram` and denied core branches.
- `Object.keys(guarded.plugins)` includes denied functions such as `list` and `reload`; `'redmine' in guarded` is true.
- Root and leaf property descriptors expose the actual raw namespace and procedure from `ctx.state.registry`.
- The generated Standard mounted-plugin section is empty; this is not primarily a prompt-generation regression.

The adjacent audit confirmed additional live leaks:

- `canvas.search({query: 'openspec'})` returns `openspec.workspace`; `canvas.kinds` exposes plugin kinds.
- `input.kinds` exposes Redmine approval/time kinds.
- Direct allowed calls to `canvas.promptSection` and `input.promptSection` omit the predicate and advertise hidden kinds, although `fullSystemPrompt` correctly passes it.
- Standard native tool declarations and the main generated prompt are already filtered. `tools.list`, `tools.schemas` and `runtime.docs.list` are not granted to Standard; do not claim their unrestricted internal implementations are a Standard bypass.
- The compatibility prompt section is gated only by `ui.eval`; a custom preset allowing that function can receive guidance for denied `screen.*` and browser capabilities.

## Goals / Non-Goals

**Goals:**

- Align supported discovery with actual snapshot permissions, including reflection and canvas/input metadata.
- Preserve useful denied-call errors, unguarded internal calls, Creator behaviour and immutable snapshots.
- Make registry changes visible without stale namespace caches or session recreation.
- Add regression coverage for the reported behaviour and adjacent confirmed leaks.

**Non-Goals:**

- A security sandbox, removal of shell/eval privileges, hiding raw `ctx.state`, source files, environment data or arbitrary database contents.
- Recursively redacting arbitrary prose, source snippets, previous transcripts, user instructions or administrative preset definitions.
- Changing markdown output-fence availability: `markdown.promptSection` intentionally treats renderers independently of runtime-call grants.
- Changing canvas/input action authorization or interpreting a catalogued form as approval. Existing action-specific confirmation rules remain authoritative.
- Changing preset defaults, existing snapshots or persisted chat history.

## Decisions

### 1. A guarded reflection facade rather than raw-target forwarding

Implement a namespace facade whose `ownKeys`, `has` and `getOwnPropertyDescriptor` agree with the allowed live descendant set. A virtual, extensible target avoids Proxy invariant failures when hiding raw target properties. Descriptor values must be produced through the same guarded dispatch path as ordinary reads, never copied from raw descriptors. Reject facade mutation/freeze operations that could corrupt the shared registry or make dynamic key reporting violate Proxy invariants.

Direct access to a known denied function may retain a rejection callable to preserve the existing error contract; it is not an advertised own property. The change does not promise that `typeof` on a guessed denied name proves absence. Allowed functions still call the original injecting proxy, retaining the ordinary caller context for internal work.

Resolve namespaces/functions from the current registry rather than retaining stale raw nodes. Use existing access-generation invalidation for visibility caches, if caching is necessary; test retained namespace views across load, reload and unload. Do not modify the shared registry to hide entries for one agent.

### 2. An explicit discovery-boundary inventory

Keep filtering scoped to supported catalogues. Extend the existing predicate-injection mechanism to confirmed missing canvas/input catalogues and direct prompt generators, adding internal filter options where needed. Define explicit required runtime-function names in each canvas/input kind's registration metadata, including the public entrypoint needed to use it (`canvas.show` or `input.request`). These names describe permissions needed to use the kind, not every unrestricted internal call. Use one shared visibility predicate for kind catalogues and prompt generators: every declared required function must be live and allowed by the trusted snapshot. An unrelated permitted function in the owner module is not evidence of kind reachability. Replace the existing any-function-in-module prompt checks rather than reusing them. Populate metadata for built-in and shipped kinds; kinds without dependency metadata are omitted from scoped discovery until annotated, while unscoped internal discovery retains its existing behaviour. Document this compatibility rule for external plugins. Apply filtering before limits/pagination so inaccessible entries do not consume result slots.

Audit exact lookup, function-level entries and aggregate groups in plugin/runtime docs. Validate currently filtered native tool and prompt paths with regression tests rather than rewriting them unnecessarily. The supported inventory includes `tools.list`, `tools.schemas` and `runtime.docs.list`: when custom presets explicitly grant these helpers, filter their advertised callable entries by the same live snapshot policy and omit empty groups. Granting a helper never grants the capabilities it describes; unscoped internal calls remain unchanged.

### 3. Capability-specific prompt requirements

Split or dynamically gate mixed compatibility guidance so granting `ui.eval` alone does not advertise denied screen/browser functions. Apply the same rule to general canvas/input instructions, not just their kind lists: each generated instruction block declares the functions it advertises and is included only when all are allowed. Split mixed blocks to retain useful permitted guidance when, for example, `canvas.show` is allowed but `canvas.close` or `canvas.setState` is denied. Granting `canvas.promptSection` or `input.promptSection` alone must not advertise denied actions, including `input.request`. Direct prompt calls and full-system-prompt assembly use the same trusted predicate and kind visibility logic. Do not suppress unrelated permitted guidance and do not attempt keyword-based prose redaction. Preserve the intentional markdown-renderer exception.

### 4. Acceptance through both fixtures and the actual eval boundary

Unit-test reflection operators, safe descriptor values, nested/partial namespaces, layer intersection and generation changes. Integration tests must exercise agent-facing eval, not only an isolated proxy, plus supported discovery and generated model requests for Standard, Creator, custom partial grants and narrowed children. Use fixtures for registry mutation; do not load/unload a person's live plugins just to test lifecycle behaviour.

## Risks / Trade-offs

- Proxy invariants and inspection/serialization behaviour can differ across runtimes: run tests under Bun and cover descriptors, spread, own-property checks and mutation/freeze attempts.
- Namespace traversal can be expensive: prefer generation-scoped memoization if necessary and test correctness before optimization.
- Caller-provided `allows` must not replace the trusted snapshot predicate at the agent boundary.
- Names already present in old conversation messages remain known; report that limitation rather than rewriting history.
- New discovery helpers may regress: maintain a tested inventory of guarded discovery entrypoints.

## Rollout and Validation

No migration is needed. After approval and implementation, run focused tests, hot-reload changed functions, validate their runtime metadata, and run one coordinated full-project typecheck for the settled batch. Verify the next evaluation of an existing Standard session sees filtered reflection and catalogues, while Creator retains annotated, live permitted kinds and internal consumers remain unchanged. Explicitly verify that Creator omits unannotated external canvas/input kinds from scoped catalogues and guidance until dependency metadata is supplied; action authorization remains unchanged. Rollback is a source rollback and hot reload; snapshots and transcripts remain intact.
