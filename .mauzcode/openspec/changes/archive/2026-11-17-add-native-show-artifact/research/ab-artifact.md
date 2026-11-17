# A/B: native show_artifact vs eval route (`bench.routes`)

Run for task 3.2 with `.mauzcode/bench/routes.ts`, scenarios `artifact` and `question`, 2 arms × 3 repetitions per report, concurrency 2, model `claude/brailyndaishaun14091998:claude-opus-5-5`.

Reports (both 12/12 success, `openInputsLeft: 0`):

1. `.mauzcode/bench/results/routes-2026-11-17T12-28-19-340Z.json` (label `ab-artifact-1-…`)
2. `.mauzcode/bench/results/routes-2026-11-17T12-29-10-333Z.json` (label `ab-artifact-2-…`)

## Procedure

- `NATIVE` now also lists `tools.showArtifact`; the eval arm denies all nine adapters. Both arms start from the stored default preset plus allow of all nine (as in P1), so a customized stored Standard cannot silently turn the native arm into a second eval arm. Self-test passed in every run (arms differ only by the denies).
- New `artifact` scenario: the bench writes `report.md` (random marker) into the run's scratch workspace and asks the agent to show it on the canvas beside the chat. The check reads `canvas_items`/`canvas_state` for an open canvas whose active tab is a `file` tab pinned to that absolute path.
- Harness: the worktree's registry was booted with `bootRegistry` against a fresh disposable database on the test Postgres (127.0.0.1:54399), never the working DB; model connection rows, encrypted secret envelopes, SOCKS proxy rows and public SSH descriptors were copied from the working DB so the real claude route resolves. Runner kept at `~/mauzcode/.mauzcode/tmp/wt/bench/run-artifact.ts` (scratch, not part of the change). Earlier debug reports (`artifact-smoke`, `artifact`, `artifact-debug*`) are harness bring-up, not measurements: they hit a missing generated `ctx_ns.d.ts` in the fresh worktree (eval typecheck failed until `procs.dev.genTypes` ran), a check bug (missing `id` column, bigint compared as number) and account rate limits.
- The first measurement account `claude/2yfl55fsh` hit RATE_LIMITED mid-run (retryAfter ≈ 47 min); the final reports use the second claude account end to end.

## Results (both reports, 3 runs per arm and scenario per report)

| Arm / scenario | Success | Calls/run | Tokens/run | p50 turns |
|---|---|---|---|---|
| eval / artifact | 6/6 | 4.5 (3–4 `tools_eval` + `bash`) | 73,753 (55k–83k) | 6, 4 |
| native / artifact | 6/6 | 1 (`show_artifact`) | 32,752 (±2) | 2 |
| eval / question | 6/6 | 1 (`request_input` via eval) | 13,607 | 1 |
| native / question | 6/6 | 1 (`request_input`) | 16,471 | 1 |

- **artifact**: native costs ≈56% fewer tokens per run (report 1: 248,836 → 98,256; report 2: 193,679 → 98,254) and 2 turns instead of 4–6. The eval route spends 3–4 evals discovering/using `canvas.show`; the native route is one typed call. Zero rejected calls in both arms.
- **question** (no artifact use): native costs +2,864 prompt tokens per single-turn run (13,462 → 16,262, +21%) — the price of the eight extra native schemas in every request, consistent with P0/P1 (≈22%).

## Per-request cost of the show_artifact schema alone

Fixed one-turn request ("capital of France", one word), same preset in three arms, 3 reps each, identical prompt tokens in every rep:

| Arm | Wire tools | Prompt tokens |
|---|---|---|
| eval (all nine adapters denied) | 13 | 13,007 |
| P1 native (only `tools.showArtifact` denied) | 20 | 15,422 |
| P2 native (all nine) | 21 | 15,808 |

**`show_artifact` adds exactly +386 prompt tokens per request** (15,808 − 15,422; schema + the one-line Canvas guidance swap), on top of the +2,415 already shipped by P0+P1. That is ~2.5% of a ~15.4k-token request — small next to the ≈41k tokens saved per artifact show. The P1 follow-up (deferred exposure of native schemas before the web tools) remains worth proposing for the cumulative +2.8k, but this change alone does not make it urgent.

## Decision

Rule: native success ≥ eval success and tokens or p50 turns fall ≥10%, exercised runs only. For the `artifact` capability the threshold is met by a wide margin (equal success 6/6, −56% tokens, p50 turns 6/4 → 2). The aggregate `decision.met:false` in the reports is driven by the `question` scenario, where the native arm cannot save turns (both are one call) and pays the schema overhead — the known cost side of the bundle, measured above.
