# Tasks

## 1. Shared permission and leak fixes

- [x] 1.1 Extract the preset discovery predicate from `guardFns` into a shared trusted helper; verify eval discovery tests still pass
- [x] 1.2 Filter `runtime.docs.search` candidates before ranking/truncation; verify a test with more than 60 denied hits above one allowed hit returns the allowed one in bm25, vector and hybrid modes
- [x] 1.3 Make the dispatcher's unknown-tool and preset-denied errors identical and list only the caller's wire tools; verify a restricted-preset test shows no denied tool, function or preset names
- [x] 1.4 Add optional `requires: string[]` to tool declarations and check it in `agent/wireTools.ts` and `tools/call.ts`; verify tests where the adapter is allowed but a wrapped function is denied

## 2. tool_search and tool_describe

- [ ] 2.1 Add `tool_search` declaration (`requires`: `runtime.docs.search`, `plugins.search`) and adapter merging function and plugin workflow hits as `{ name, kind, summary, source }`; verify tests for ranking, limit, unknown-argument rejection and preset filtering
- [ ] 2.2 Add `tool_describe` adapter (`requires`: `runtime.docs.get`, `plugins.read`) for function and plugin names with stripped trusted parameters; verify tests for plugin overview with only allowed functions, function-over-plugin precedence, identical errors for denied and nonexistent names, and no source
- [ ] 2.3 Verify the wire tool list is unchanged after discovery calls (test) and document both tools in runtime docs

## 3. read_result

- [ ] 3.1 Add `read_result` declaration (`requires`: `agent.readResult`) and adapter bound to the trusted agent; verify parity tests with `agent.readResult` for ranges, clamping, foreign id `not_found` and `legacy_unavailable`
- [ ] 3.2 Return `read_result` output inline in `agent.stashResult` (no re-store); verify a 16000-unit read creates no new result id
- [ ] 3.3 Make the stored-result preview hint and prompt guidance name `read_result` when it is in the agent's tool list, eval otherwise; verify both variants in tests

## 4. request_input

- [ ] 4.1 Add `request_input` declaration (`requires`: `input.request`) and adapter with trusted agent binding and kind/spec validation; verify tests for invalid spec, unavailable kind, rejected `agentId`, missing trusted context
- [ ] 4.2 End the turn after a waiting `request_input` and skip remaining calls; verify run-loop tests for skipped calls and exactly-once early answer delivery
- [ ] 4.3 Verify secret kinds return only references and that generic confirm does not satisfy protected approvals (tests); update chat-input prompt guidance

## 5. Presets, adapters and integration

- [ ] 5.1 Classify the four adapter functions in `coreCatalogue` beside the functions they wrap; verify preset tests that each tool is absent when its wrapped capability is denied
- [ ] 5.2 Verify tool schemas through OpenAI Chat/Responses, Anthropic and Gemini adapters (schema tests)
- [ ] 5.3 Run `code.quality` and the full test suite; record the A/B baseline from design.md (eval-only vs native) and compare against its threshold

## Workflow follow-up

- Agree the change with the person before implementation.
- Archive after implementation and review.
