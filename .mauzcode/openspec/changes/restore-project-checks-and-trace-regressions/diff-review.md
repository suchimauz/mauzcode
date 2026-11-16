# Repair diff review

Scope: uncommitted repair batch based on `20d72297fb331a10488d33bc3385fadb5d73ab28`. This is a source review, not evidence of historical causal attribution or a claim that persistent working data was inspected exhaustively. Final acceptance must identify the checked tree separately.

## Implementation boundaries inspected

- `src/socksProxy/list.ts` and `remove.ts` now resolve binding ownership from `llm_connections.transport` instead of the retired `llm_account_proxies`. The removal path retains revision checking, transaction/row locking and credential ownership validation. Bindings are not filtered by `enabled`: disabled connections continue to prevent deletion. `registry.test.ts` adds that regression case. No migration or working-data rewrite was introduced.
- `src/files/$route__PUT.ts` explicitly narrows parsed JSON and returned browser data before accessing content. The expected-content comparison and authoritative write conflict protection remain. Root/files GET routes retain the React proxy target and return 502 when no proxy response is available; they do not claim a successful empty UI response.
- `src/update/$route_apply_POST.ts` retains owner-role and CSRF guards, explicit `confirmed:true`, string target and refreshed-target equality. JSON is narrowed from unknown; approval is not inferred from truthiness.
- `src/plugins/saveConfiguration.ts` narrows secret values to strings after existing validation; secret values are not added to logs. `ConfigurationResult.ts` acknowledges the already-supported file source. `$loader_plugin.ts` handles an absent boot entry array without resurrecting declarations; the existing-entry identity checks remain.
- `src/codexTunnel/identity.ts` rejects a missing token payload before decoding. `sshArgs.ts` bounds an optional following argument. Added tests cover these boundaries. `encryptedStore.ts` declares the existing nullable read result rather than assuming a record exists. SOCKS byte non-null assertions follow minimum packet-length checks; protocol validation is retained.
- `src/_testDb.entry.ts` changes two array type annotations only; template/reset SQL and DB selection are unchanged. The repair does not redirect automated tests to working storage.
- `src/code/TestRun.ts` moves TestKind to a separate declaration file and uses the generated namespace type. The kind union remains fast/it/live/all; check scope is not reduced.
- Frontend error-body narrowing preserves message/error precedence for strings and produces a generic HTTP error for invalid bodies. Workspace-view access and transcript index annotations do not redesign the UI. New boundary coverage is part of the follow-up batch.
- Vendored `src/procs/` changes are confined to existing tests: typed transaction PID assertion, explicit registered event-handler access, known fixture indexes/values. No vendored runtime behavior is changed.

## Assertion and scope review

The model fixture updates use current model routing rather than the retired llm namespace. Existing cancellation, persistence, steering, quota and access assertions remain in the reviewed tests. The sidecar route-resolver-call assertion was removed with the obsolete resolver mock; result/parent-model/goal-policy assertions remain, and real isolated model resolution supplies the route. Model compatibility tests explicitly assert additive affinity fields rather than dropping comparison wholesale. Optional-directory architecture traversal still performs the facade assertions.

No tsconfig/package runner coverage narrowing is present in the repair diff. A scan of added lines found no new `@ts-ignore`, `@ts-nocheck`, `.skip(` or `.todo(` markers. Existing fixture casts and locally justified non-null assertions are not a substitute for the final complete typecheck. The tracked deletion list is limited to the previously documented myhealthGaps and two private procedure paths; approval evidence and external plugin dependency impact are recorded separately. This review does not authorize additional deletion.

## Acceptance limits

Source inspection cannot prove the absence of unrelated out-of-band working-data changes. This follow-up performs no working-data mutation, installation, live inference, commit, push or deployment. Existing approval/removal records are the evidence for the earlier actions. Runtime graph warnings remain explicit, not silently waived by zero errors. Full fast/root/frontend checks and enriched failure reconciliation are required after all new source edits settle.
