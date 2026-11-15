# Tasks

## 1. Reflection contract and regression coverage

- [x] 1.1 Add failing tests for Standard root/nested enumeration, partial namespaces, `Object.keys/values/entries`, spread, `for...in`, `Reflect.ownKeys`, own-property names, membership and descriptors.
- [x] 1.2 Add tests proving visible descriptor values remain guarded and cannot expose raw procedures or raw namespace objects; preserve explicit denied-call errors and allowed internal calls.
- [x] 1.3 Cover Creator, project-local origins, explicit denies, narrowed children, cross-agent independence and retained views across registry generation changes.

## 2. Guarded runtime view

- [x] 2.1 Implement a reflection-safe, non-mutating namespace facade with live path resolution and a consistent visibility predicate.
- [x] 2.2 Preserve Proxy invariants under property-descriptor inspection and attempted mutation/freeze operations; prevent accidental writes to shared registry state.
- [x] 2.3 Add generation-scoped visibility caching only if needed; verify mount/reload/unload and origin changes without stale entries.

## 3. Adjacent capability discovery

- [ ] 3.1 Define and validate required-function metadata for canvas/input kinds, including public use entrypoints; annotate built-in and shipped kinds and document omission of unannotated kinds from scoped discovery. Implement one shared predicate requiring all dependencies to be live and allowed; use it in `canvas.search`, `canvas.kinds`, `input.kinds` and prompt generation, before result limits. Test unrelated module grants, explicit dependency denies and missing metadata.
- [ ] 3.2 Inject the predicate for direct `canvas.promptSection` and `input.promptSection` calls; test that caller-supplied options cannot widen access. Gate general instruction blocks by all advertised functions and split mixed blocks to preserve permitted guidance. Test allowed prompt generators with denied `input.request`, and allowed `canvas.show` with denied `canvas.close`/`canvas.setState`, through direct calls and fullSystemPrompt.
- [ ] 3.3 Audit plugin search/read/functions and runtime docs search/get exact lookup and partial-plugin results; add regressions and correct any structured-entry leaks found.
- [ ] 3.4 Implement consistent filtering for explicitly granted `tools.list`, `tools.schemas` and `runtime.docs.list`; test custom presets that grant these helpers but deny some represented capabilities, omission of empty groups and unchanged unscoped internal results.
- [ ] 3.5 Split or conditionally generate mixed compatibility prompt guidance so custom `ui.eval` grants do not advertise denied browser/screen capabilities; preserve intentional markdown-renderer behaviour.
- [ ] 3.6 Verify native tool schemas and fullSystemPrompt remain filtered for Standard, Creator, partial-plugin and inherited snapshots. Add compatibility regressions for fully permitted annotated kinds under Creator, unchanged unscoped internal catalogues/prompts and unrestricted internal calls of allowed procedures. Add a fixture regression proving Creator omits unannotated external canvas/input kinds from scoped catalogues and guidance, internal discovery retains them, and supplying valid dependency metadata restores scoped visibility without changing action authorization.

## 4. Integration and rollout

- [ ] 4.1 Add an agent-eval integration regression reproducing the original module enumeration and the adjacent canvas/input leaks; verify existing sessions use their unchanged snapshots.
- [ ] 4.2 Run focused Bun tests, strict runtime-doc validation for changed functions, one coordinated full-project typecheck and relevant quality checks; preserve complete diagnostics and distinguish pre-existing failures.
- [ ] 4.3 Hot-reload the settled implementation and run read-only smoke checks without changing live plugin installations, presets or transcripts.
- [ ] 4.4 Update guardrail documentation, run strict OpenSpec validation and record acceptance evidence before requesting archive approval.
