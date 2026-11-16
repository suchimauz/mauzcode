# A/B baseline: eval-only vs native tools

Prepared and run for task 5.3; results below.

## Arms

- **A — eval-only:** Standard rules with `deny: ["tools.toolSearch", "tools.toolDescribe", "tools.readResult", "tools.requestInput"]`.
- **B — native:** Standard rules including those four adapters (the shipped Standard after `20380103120000_native_agent_tools`).

Same model, same workspace (this repository at a fixed commit), fresh agent per run, no other differences.

## Scenarios

Each prompt is sent as the first user message. Run each scenario 3 times per arm.

1. **Discovery.** "Which runtime function lets me schedule a recurring agent turn, and what are its required options? Answer with the exact name and options only."
   Success: `agent.cron` with `id`, `expression`, `prompt` (and timezone optional) named correctly.
2. **Large result recovery.** "Run `git log --stat -200` in this repo and tell me which file appears in the most commits among the shown entries." (Output exceeds the 6000-character inline limit.)
   Success: answer derived from the stored result read in ranges, with no rerun of the git command.
3. **Structured question.** "Ask me, with a proper form, which of these three branches to delete: feature/a, feature/b, feature/c. Do not delete anything."
   Success: one choice form opened with waitForAnswer, turn ends, no further tool calls, nothing deleted. The operator cancels the form.
4. **Mixed.** "Find the function that lists input kinds, describe its options, then ask me with a confirm form whether to print the kinds."
   Success: correct function (`input.kinds`), its option described, one confirm form opened last in the turn.

## Metrics

Per run, from the agent's events: success (operator-judged against the criteria above), number of tool calls, calls rejected for parameters or eval typecheck, total input+output tokens, model turns. Report success rate, error count, total tokens and p50/p95 turns per arm.

## Decision threshold

Proceed to the next bundle only if B's success rate is not lower than A's and either total tokens or p50 turns fall by at least 10%.

## Preconditions

Both arms need agents created after the change with the matching rules. An agent's preset snapshot is frozen at creation, and a child's preset is intersected with its parent's, so an older session (or a child of one) cannot run arm B. The stored Standard on this installation is customized (it keeps the old description and `nrepl` and `openspec` plugin grants), so the conservative upgrade correctly did not change it; arm B needs the four adapter names added in the preset editor, or a separate preset.

## Results (run 2026-11-17)

Setup: model `claude/2yfl55fsh:claude-opus-5-5`, workspace at `7a35d6cd`, fresh hidden agent per run, 3 runs × 4 scenarios × 2 arms, 4 runs in parallel. The stored Standard was given the four adapter grants for arm B; arm A used the same snapshot plus the four denies. Wire tools: A 16, B 20. Open forms were cancelled by the operator afterwards.

| Arm | Success | Tool calls | Param/typecheck errors | Total tokens | p50 turns | p95 turns |
|---|---|---|---|---|---|---|
| A — eval-only | 12/12 | 27 | 1 | 449,169 | 2 | 6 |
| B — native | 12/12 | 22 | 0 | 416,619 | 3 | 3 |

Tokens per scenario (3 runs summed), A → B: discovery 151,337 → 118,985 (−21%); large result 81,204 → 118,857 (+46%); structured question 39,835 → 44,039 (+11%); mixed 176,793 → 134,738 (−24%).

Observations:
- Discovery and mixed: B used `tool_search`/`tool_describe`/`request_input` in 1–3 calls with stable turn counts; A used 2–6 `tools_eval` calls, including one typecheck failure.
- Large result: in both arms the model aggregated with a shell pipeline and never produced a stored result, so `read_result` was not exercised. The difference is noise from extra `bash` calls plus the larger schema.
- Structured question: one call in both arms. B costs about 1.4k more tokens per request for the four extra schemas.

## Decision

Totals: success unchanged (12/12), tokens −7.2%, p50 turns 2 → 3 (p95 6 → 3). **The threshold is not met** (neither tokens nor p50 turns falls by ≥10%), so the next bundle does not proceed on this evidence. The native tools stay shipped: they cut tokens by about 20% in the scenarios that use them, remove the parameter error and cap the worst case. Before a re-run, rebuild the large-result scenario so that it forces a stored result (for example, quoting raw output), since the current prompt does not measure `read_result`.

## Project checks (task 5.3, at `7a35d6cd`)

- `code.quality`: ok:true, 0 errors; no findings for the new adapters, `wireTools`, `stashResult` or `guardFns`.
- `bunx tsc --noEmit -p .`: clean.
- `bun run test` (fast): 3736 pass, 12 skip, 9 fail. Four were 20 s timeouts under parallel load (`syncWorldState`, `rtk/bash`, `git/stageCommitPush`, `procs/auth/keys`); each file passes alone. The other five (`repl/preset` ×2, `agent/presetPrompt` ×2, `models/internalCompatibility`) already failed at the pre-change commit `fab93567`, which had more failures in the same files. The fixture Standard prompt is shorter after the change: 20,608 characters, against 24,147 before.
