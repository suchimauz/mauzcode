# Tasks

## 1. Stale contracts

- [ ] 1.1 Rewrite the two `src/repl/preset.test.ts` openspec cases to use a Standard snapshot without the `openspec` grant; verify that both pass and still fail if discovery leaks a denied plugin (temporarily drop the predicate)
- [ ] 1.2 Do the same for the Standard plugin case in `src/agent/presetPrompt.test.ts`; verify that the file passes
- [ ] 1.3 Measure fixture prompt sizes at HEAD and set the budget limits with documented headroom; verify that the budget test passes and that the measured numbers are recorded in the commit body
- [ ] 1.4 Make the `internalCompatibility` contract check accept only added optional properties; verify that it passes for `listModels` and fails for a removed or newly required property (unit case)

## 2. Slow tests

- [ ] 2.1 Profile the slowest test in each of `agent/syncWorldState`, `procs/auth/keys`, `plugins/rtk/src/rtk/bash`, `git/stageCommitPush`, and record the cause
- [ ] 2.2 Fix the cause or move the test to the integration kind with a reason; verify each file well under 20 s, or that it appears in `bun script/test.ts it --list`

## 3. Acceptance

- [ ] 3.1 Run `bun run test` once and a full typecheck once; record the complete failure inventory (expected: none) in the commit body
