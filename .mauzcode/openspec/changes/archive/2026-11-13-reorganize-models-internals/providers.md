# Block 2 implementation evidence

All eleven original provider helpers now retain typed root delegates; implementation lives in `models.provider.claude`, `models.provider.codex`, and `models.provider.custom`. Root provider declarations retain metadata, callback availability and owner identities, dispatching operations dynamically through ctx.fns. No storage, HTTP, UI or credential migration.

## New implementation inventory

- Claude original helpers: claudeAuth, claudeLogin, claudeRequest.
- Claude operations: claudeValidate, claudeTest, claudeListModels, claudeUsage, claudeStream, claudeCompact, claudeLoginStart, claudeLoginStatus, claudeSubmitLogin, claudeCancelLogin, claudeLogout.
- Claude shared protocol: claudeWireHeaders, claudeWireFailure, claudeWireRequest, claudeWireWindowOf, claudeWireRecordHeaders.
- Codex original helpers: codexAuth, codexFailure, codexInput, codexLogin, codexQuota, codexReasoningProfile, codexVersion.
- Codex operations: codexValidate, codexTest, codexListModels, codexUsage, codexStream, codexCompact, codexLoginStart, codexLoginStatus, codexCancelLogin, codexLogout.
- Codex shared protocol: codexWireAuth, codexWireChecked, codexWireResponses, codexWireInterrupted, codexWireStreamFailed, codexWireParseArgs, codexWireLevel, codexWireDiscoveredReasoning, codexWireWindowOf, codexWireEvents.
- Custom: customProtocol, customValidate, customTest, customListModels.

Shared protocol implementations are not duplicated in operation bodies. The Codex static boundary test now also inspects nested implementation files. Existing auth mocks target internal registry entries where necessary; public facade characterization remains covered. New helperParity tests exercise both root and leaf entry points against fixed expectations.

## Verification

After stopping duplicate checking workers, the parent alone performed the settled-batch checks:

- All 50 new runtime functions reloaded by full dotted names and validated with `strict:true,typecheck:false`: zero failures. Then root `models` reloaded to refresh declarations.
- One `procs.dev.typecheck({})`: 418 diagnostics, exactly identical to the pre-migration baseline (zero added/removed diagnostic lines). Project remains globally typecheck-failed due to recorded existing errors; no new diagnostics.
- `bun test ./src/models/ ./src/frontendBridge/models.test.ts ./src/code/index.test.ts ./src/code/quality.test.ts ./src/code/callers.test.ts --timeout 20000`: 180 pass, zero fail, 1205 assertions, 16 files.
- Full call-graph reindex: quality errors remain baseline 8; zero model errors. Warnings 577 versus baseline 529; internal implementation additions increase warnings, so this is not a claim of warning-free quality.
- Isolated compatibility tests verify original procedure signatures, sync/generator behavior, provider metadata, public types, HTTP source, fresh discovery, nested targets, collision/missing-target controls, and dynamic leaf/declaration reload.
- Raw full diagnostics and checks: `.mauzcode/tmp/hl/provider-typecheck.json`, `provider-validation.json`, `providers-tests.log`, `providers-quality.json`.

## Necessary indexing prerequisite

`code.index` previously truncated calls to at most three name segments, incorrectly reporting `models.provider` as missing. It now selects the longest registered procedure prefix, preserving unknown full names for diagnostics. A regression test covers four-segment provider targets and missing leaves; existing method-on-call-result tests remain green. This is needed for accurate architecture verification, not a change to runtime loading semantics.

## Reload and rollback

Reload leaves using full dotted names or exact slash directories (`models/provider/claude`, `models/provider/codex`, `models/provider/custom`) before reloading root `models`; regenerate types after file additions/removals. Do not restart the service. Rollback restores original helper/declaration bodies and matching tests, removes newly introduced source files only as a reviewed rollback operation, regenerates types and explicitly reloads restored roots. Reload does not delete retained registry entries: verify restored facades no longer reference new leaves and run isolated fresh-discovery tests. Registry cleanup or operational restart is a separate action.
