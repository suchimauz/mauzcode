# A/B baseline: eval-only vs native tools

Prepared for task 5.3. Not yet run (see "Preconditions").

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
