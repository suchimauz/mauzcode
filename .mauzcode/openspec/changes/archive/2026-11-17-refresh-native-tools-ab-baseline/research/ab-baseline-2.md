# A/B baseline 2: eval-only vs native tools (`bench.routes`)

Run for task 3.1 with the reproducible procedure `.mauzcode/bench/routes.ts` (`bench.routes`). Full report with every run: `.mauzcode/bench/results/routes-2026-11-17T09-10-17-098Z.json` (label `ab2-2026-11-17T09-08-00-811Z`).

## Setup

- Model `claude/2yfl55fsh:claude-opus-5-5`; base snapshot: stored Standard resolved once (already grants the four native adapters).
- Arm `eval` = base + deny `tools.toolSearch`, `tools.toolDescribe`, `tools.readResult`, `tools.requestInput`; arm `native` = unmodified base. The procedure asserts that the snapshots differ only by these denies before running.
- 6 scenarios × 2 arms × 3 repetitions = 36 runs, concurrency 4, fresh hidden agent and scratch directory per run. Mean run duration 14 s.
- Checks are objective (see `.mauzcode/bench/GUIDE.md`). All forms left open were cancelled by the procedure (`openInputsLeft: 0`).
- Self-test (`bench.routes({ selfTest: true })`): arms differ only by the denies, a synthetic `large_result` transcript without a stored result is `not_exercised`, the threshold rule rejects the "−7% tokens, more turns" case.

## Results

| Arm | Success (exercised) | not_exercised | Tool calls | Rejected | Total tokens | p50 turns | p95 turns |
|---|---|---|---|---|---|---|---|
| eval | 18/18 | 0 | 62 | 5 | 1,154,124 | 3 | 7 |
| native | 18/18 | 0 | 42 | 1 | 927,120 | 3 | 4 |

Per scenario, eval → native (3 runs summed; tokens = prompt + completion, root and children):

| Scenario | Success eval | Success native | Tool calls | Rejected | Tokens | p50 turns |
|---|---|---|---|---|---|---|
| `discovery` | 3/3 | 3/3 | 7 → 6 | 0 → 0 | 140,074 → 136,363 (−2.6%) | 3 → 3 |
| `question` | 3/3 | 3/3 | 3 → 3 | 0 → 0 | 40,138 → 44,307 (+10.4%) | 1 → 1 |
| `mixed` | 3/3 | 3/3 | 10 → 9 | 0 → 0 | 135,889 → 135,629 (−0.2%) | 3 → 3 |
| `large_result` | 3/3 | 3/3 | 17 → 8 | 3 → 0 | 320,568 → 187,102 (−41.6%) | 7 → 4 |
| `plan` | 3/3 | 3/3 | 7 → 7 | 1 → 1 | 139,788 → 153,802 (+10.0%) | 3 → 3 |
| `delegate` | 3/3 | 3/3 | 18 → 9 | 1 → 0 | 377,667 → 269,917 (−28.5%) | 5 → 3 |

Observations:

- `large_result` is now exercised: every run in both arms produced a stored result (`cat` output ≈37k characters). Native runs used `read_result` 1–2 times; eval runs needed 4–5 `tools_eval` calls to page through `agent.readResult`, and each eval run hit one typecheck error on the union return type (`Property 'text' does not exist`). This is the largest single gain.
- `discovery`/`mixed`: with a lookup that `runtime.docs.get` answers directly, the eval route is nearly as cheap; the native route saves about one call.
- `question`: one call in both arms; native costs ≈1.4k tokens more per request for the extra schemas (same as baseline 1).
- `plan` and `delegate` use the eval route in both arms (no native plan/delegation tools exist yet). They are the P1 baseline: every `session.plan`/`session.done`/`agent.delegate` call goes through `tools_eval`. `plan` has one typecheck rejection per arm. In `delegate`, the eval arm needed extra turns to read the child result (one typecheck error on `agent.team` member fields, 5–7 root turns versus 3), so part of the delegate saving comes from P0 `read_result`/discovery rather than a native delegation tool.
- Excluding the two P1-baseline scenarios, P0 scenarios alone: 636,669 → 503,401 tokens (−20.9%).

## Decision

Rule (design of `add-p0-native-agent-tools`): native success ≥ eval success and total tokens or p50 turns fall by ≥10%, exercised runs only.

- Success: 18/18 = 18/18 → not lower.
- Total tokens: −19.7% (−20.9% on P0 scenarios only) → ≥10%.
- p50 turns: 3 → 3 (p95 7 → 4).

**The threshold is met.** Per task 3.2 the first P1 bundle proceeds as a separate change: `add-p1-plan-delegation-tools` (native `plan_update`/`plan_done`, `delegate_task` and child-only `finish_task`). Its effect will be measured with the existing `plan` and `delegate` scenarios of `bench.routes`, whose eval-route numbers above are the baseline (plan 139,788 tokens / 7 calls / 1 rejection; delegate 377,667 tokens / 18 calls / 1 rejection, eval arm).
