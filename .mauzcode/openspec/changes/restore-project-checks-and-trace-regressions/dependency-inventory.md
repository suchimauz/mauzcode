# Dependency inventory and approved-removal impact (tasks 5.1 / 5.3)

## Scope and evidence boundary

Read-only follow-up against the current working tree and running registry. Read root AGENTS.md and this change's proposal/design/tasks/verification; no additional applicable AGENTS file was found on the change-directory ancestry. This follow-up changes only this document: no installs, removals, reloads, provider calls, secret reads, source edits or full checks. Saved acceptance checks remain evidence for their recorded revision, not a new check of concurrent changes.

Primary receipts: `.mauzcode/tmp/ol/ledger.json`, `removal-verification.json`, `backups/approved-extensions.tar.gz`, `backups/remaining-procedures/`, and this change's `verification.md:34`. Live inventory was read with `plugins.list({})`, which delegates to the already mounted module records (`src/plugins/list.ts`, `src/procs/modules/list.ts`). Directory listing independently covered `plugins/` and `/home/suchimauz/.mauzcode/user/`.

## Mounted versus source-only inventory

All 12 official plugin source directories and all 3 current user-plugin directories are mounted. There are **no source-only plugin directories in those two roots**. This does not claim that every arbitrary workspace directory is a plugin, or that configured remote/npm roots were audited as filesystem directories.

| Plugin | Source | Live functions / routes | Disposition |
|---|---|---:|---|
| architecture-map | official | 4 / 2 | retain |
| browser | official | 39 / 1 | retain and repair |
| gh | official | 16 / 0 | retain |
| git | official | 29 / 2 | retain |
| icons | official | 3 / 2 | retain |
| opencode-go | official | 7 / 0 | retain and repair |
| openspec | official | 6 / 2 | retain |
| rtk | official | 12 / 2 | retain |
| telegram | official | 29 / 5 | retain and repair |
| terminal | official | 1 / 1 | retain |
| websearch | official | 4 / 0 | retain; browser consumer |
| whisper | official | 6 / 4 | retain |
| glab | user | 1 / 0 | retain |
| nrepl | user | 8 / 0 | retain |
| redmine | user | 22 / 7 | retain |

Counts are catalogue counts, not every special loader/type/UI file. The affected private procedures below are **overlays**, not separately mounted plugins. Other visible overlay directories (`anna`, `bench`, `htmx-migration`, `ui`, `watch`, etc.) are not removal candidates; scratch/results/runtime data are not plugin source.

## Diagnostic and dependency matrix

Counts are individual baseline diagnostics, not files. Ledger total: 330 type diagnostics and 86 fast-test failures. Type totals reconcile as core 294 + frontend 6 + browser 3 + opencode-go 4 + telegram 3 + gh overlay 5 + myhealthGaps 9 + skill 1 + tunnel 5 = 330. Thus retained-source resolution is 315 and explicitly approved removal is 15. Browser additionally accounts for one directly located fast-test failure (`plugins/browser/src/cdp/prompt.test.ts`); five `src/socksProxy/browserApi.test.ts` failures are core/browser integration, not five extra plugin compiler diagnostics. No baseline compiler diagnostic is assigned to the other mounted plugin paths.

| Component | Baseline type diagnostics | Source, callers, types and UI impact | Disposition |
|---|---:|---|---|
| browser / cdp / chrome | 3 | `plugins/browser/src/browser/$route_live_GET.ts`; browser actions call CDP; `plugins/websearch/src/websearch/search.ts:141` uses `browser.googleSearch`, `read.ts:52,57,88` uses navigate/snapshot/tabClose; `src/screen/openTab.ts:24` uses browser.tabs. `plugins/browser/ui/index.tsx` is the live-view React/canvas/WebSocket consumer; removing only ordinary tools would not remove its UI/socket contracts. Generated `src/ctx_ns.d.ts` imports plugin functions/types. | retain; saved typecheck resolves all 3; prompt fixture repair recorded in ledger |
| opencode-go | 4 | `$modelProvider_opencode-go.ts` is a `types.models.ProviderDefinition`; its test/listModels/usage/route callbacks call `opencodeGo.*`. It advertises direct/socks/ssh-tunnel transports and uses the Models provider settings/UI rather than its own `ui/` directory. `mapModel.ts`, `route.ts`, `listModels.ts` depend on Models contracts. Provider registration is a dependency even without ordinary static caller edges. | retain; all 4 absent in saved final typecheck; no live inference/connectivity claim |
| telegram | 3 | Avatar and dialogs routes, personal Telegram React extension (`plugins/telegram/ui/index.tsx`), attach/news hooks and ordinary tools share the telegram namespace. `newsDiscover.ts` calls telegram folders/folder/newsChannelAdd: the word discovery here is not a dependency on the removed discovery plugin. `.mauzcode/telegram/replyAfter.ts:21,24` dynamically calls telegram.me/messages; a cast through `any` means static type success alone cannot prove this consumer. | retain; all 3 absent in saved typecheck; personal Telegram is distinct from removed telegram-bot |
| `.mauzcode/gh/gist` | 5 | Five retained files create/get/list/remove/update call mounted `gh.api`; create/update also read files. Official gh removal would break them. Generated declarations import the overlay files (`src/ctx_ns.d.ts:519–523` at inspection). No own UI bundle. | retain and repair; all 5 resolved, not removed |
| `.mauzcode/myhealthGaps` | 9 | Removed medicationContext/medicationRecordGaps/submitMedication and `$gap_medication.ts`; archived hook uses `types.flow.FlowRequest/FlowOutput` and delegates to the removed namespace. Loss is medication-gap preview/submission integration, not a generic compiler repair. | exact owner-approved removal |
| `.mauzcode/skill` | 1 | Only circlebackMeetingReady removed; archived file calls `circleback.sql`. Retained greet/issueFileReady/uptime remain; issueFileReady uses workspace.get and local file reads. Live skill namespace still includes inspect/hello/wordCount/greet/issueFileReady/uptime. No own UI. | remove exact approved procedure; retain namespace and other procedures |
| `.mauzcode/tunnel/ensure.ts` | 5 | Archived ensure calls tunnel status/close/open and performs retries/health checks. Removed procedure would otherwise depend on tunnel API not present in current registry. Directory remains but contains no source files. | exact approved removal; automatic tunnel healing is no longer available |
| `.mauzcode/chrome` | 0 | Retained profileDir/start/reloadExtension overlay; runtime discovery scans overlays after src, so overlapping names can override host definitions. start uses procs.env.cdpUrl. Browser functionality must not be equated with official files alone. | retain |
| `.mauzcode/telegram/replyAfter.ts` | 0 | Dynamic personal-Telegram predicate described above; no own route/UI. | retain |

Runtime/compiler inclusion chain: `src/procs/modules/discover.ts:53–77` discovers roots in override order including `.mauzcode`; `src/procs/project/scan.ts` classifies each root and skips tmp/results/runtime payloads; runtime declarations generated by `src/procs/dev/genTypes.ts` import those sources into `src/ctx_ns.d.ts`. Root tsconfig includes `src/**/*.ts` and `src/**/*.d.ts` and excludes `.mauzcode`, but exclude controls root discovery, not imports from generated declarations. Therefore a mounted/source-only distinction and removing a plugin entry cannot by themselves prove compiler exclusion. No exclusion was added here.

## Already approved removal: verified effects and limits

The earlier three-directory approval is recorded in design.md; the later **separate exact two-file approval** is recorded in verification.md:34. Do not generalize either into permission to remove other plugins or the whole skill namespace.

* `approved-extensions.tar.gz` hash was independently recomputed: `f1dab25cbb70d8de9d6b6eb6e46985c4c02d01cd205d7f7f2122f60d13fc1855`, matching `removal-verification.json` (115 entries, 106 readable files reported there). Archive entry listing confirms discovery, telegram-bot, and myhealthGaps source. No extraction or secret-value inspection was performed.
* Remaining-procedures backup hashes independently match verification.md: circlebackMeetingReady `45ea6d236f6c16cf6879ce4d55c87ba61158e16ef5542a9f334b82ff810345e6`; ensure `7f3e8d7312c060bb24e0e816bd1df1f2414322ebadc941607999b72aa31cc578`.
* Current plugin directories/mounted catalogue omit discovery and telegram-bot. Removed overlay source is absent. Live namespace-key inspection returns no functions for discovery, telegramBot, myhealthGaps or tunnel; skill.circlebackMeetingReady is absent while the retained skill functions remain.
* Current generated declarations contain no imports for those removed sources/functions. A scoped source search across src/frontend/plugins and retained overlay directories found no `ctx.fns` or `types` references to the three removed namespaces and no tunnel.ensure/circlebackMeetingReady consumer. This does not inspect historical transcripts or prove absence of arbitrary computed names.
* `ctx.state.procs.http.routes` contains no route keys matching discovery, telegramBot or myhealthGaps. No top-level flow/gap/discovery/telegramBot state namespace was present. This is bounded live inspection, not a request to removed HTTP endpoints and not proof about unknown third-party handler caches.
* `src/procs/repl/unload.ts:19–35` only deletes ordinary registry functions and updates boot metadata. It does **not** itself remove routes, handlers, in-flight invocations or persisted jobs. Accordingly the earlier report of 48 unloads plus 2 later unloads is not used as route/handler proof.
* Before DB reads, `information_schema.columns` was inspected for agent_triggers, agent_trigger_runs, cron_tasks, cron_runs and cron_grants. A count-only query of `agent_triggers.config::text` matching removed namespace prefixes/circlebackMeetingReady/tunnel.ensure returned **0**. Grouped queries of cron_tasks.fn and cron_runs.fn for those exact namespace/function patterns returned no rows. No prompt, args, result, credential, account or secret values were returned. This is current persisted-consumer evidence, not historical absence and not a broad scan of trigger prompt text.
* Discovery's archived route/action pages and telegramBot.request are lost capabilities; personal Telegram remains mounted. The archived myhealthGaps hook cannot compute/submit its medication gaps. The deleted Circleback predicate and tunnel health-retry helper cannot be called. No records, settings, secrets, histories or triggers were deleted in this follow-up.

## Dangling-consumer assessment / follow-up

No active static caller or matching persisted runtime.fn/cron target was established for the removed functions in the inspected scope. One stale **permissive UI reference** remains: `src/frontendBridge/searchData.ts:28` still allows `/discovery` (and `/gaps`) in its href allowlist. It does not generate navigation or invoke a handler, so it is not proof of an active broken caller; historical search data can nevertheless retain dead links. Do not call this fully cleaned UI surface. If route retirement cleanup is desired, reconcile this allowlist against mounted routes and add a search-link regression test; preserve historical records. No source change is included in this inventory task.

Remaining epistemic limits: no provider/browser/Telegram end-to-end action was run; no arbitrary computed callers or historical prompt instructions were exhaustively scanned; no independent draining of pre-existing invocations was demonstrated. These are explicitly outside the bounded read-only evidence, not silently inferred from green typecheck. If stronger runtime removal acceptance is required, assign a separate owner to verify special-handler registries and in-flight work without restoring or invoking removed integrations. The dependency inventory and approved-loss accounting are complete within the stated scope; this document does not close unrelated verification tasks or grant new action authority.
