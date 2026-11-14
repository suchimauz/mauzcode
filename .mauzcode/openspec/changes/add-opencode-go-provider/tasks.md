## 1. SDK types and registration

- [x] 1.1 Add ProtocolRoute, ProviderDefinition.route, optional reasoning default, wire/disable, applied auto and ModelInfo.protocol
- [x] 1.2 Loader validates route and rejects stream together with route

## 2. SDK inference

- [x] 2.1 Route dispatch uses cached info, validates protocol/base/headers with credential-safe INVALID_INPUT, uses conn.fetch after gates
- [x] 2.2 Reasoning resolver supports optional default, validates wire/disable
- [x] 2.3 Catalogue caches protocol and reasoning metadata
- [x] 2.4 Shared protocols send reasoning in native fields
- [x] 2.5 Reviewed codex/claude profiles, frontendBridge.modelEffort and agent.setReasoningEffort

## 3. OpenCode Go plugin

- [x] 3.1 package.json and SKILL.md
- [x] 3.2 Provider declaration
- [x] 3.3 headers, listModels, route, usage, test and pure discovery/usage validation helpers. Required secret validation uses the shared Models field schema and safe missing-key guard; no redundant custom validate hook.

## 4. Tests

- [x] 4.1 Core route dispatch, header order, invalid protocol/base/headers, stream+route rejection, disabled model gate, invalid effort gate, native reasoning fields and auto without default
- [x] 4.2 Plugin discovery fixtures, native routing, usage windows, test statuses and secret-safe outputs

## 5. Verification

- [x] 5.1 Checks executed: 17 runtime functions reloaded and strict metadata validation passed; models/plugin suite 315 pass, 0 fail. Final full typecheck has 315 diagnostics (460 lines), none in changed/new files; existing errors remain in unrelated tests/local plugins. code.quality: 15 unrelated unresolved errors, 552 warnings. This marks checks run, NOT a clean whole project. Full artifacts: .mauzcode/tmp/kf/full-typecheck-final.json, code-quality.json, models-tests-final.log. Typecheck was repeated after repairing two new test type errors; the initial printed diagnostic array was truncated, so its complete capture also required a repeat.
- [x] 5.2 Owner authorized connecting and live checks, supplied key through secure input. Created direct Models connection `Go`; public Models facade health accepted key, discovery returned 30 models, usage returned 5h/Weekly/Monthly windows. Minimal streams returned `OK`: glm-5.3-flash (openai-chat), gpt-5.6-luna (openai-responses), qwen3.8-flash (anthropic), gemini-4-argon (gemini). No privacy/billing settings changed; no agent model switched.
- [x] 5.3 docs/opencode.md updated by parent, separating current Models plugin from legacy and historical live checks
