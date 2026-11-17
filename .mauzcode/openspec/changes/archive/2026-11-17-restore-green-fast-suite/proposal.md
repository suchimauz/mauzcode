## Why

The fast suite is not green: the add-p0-native-agent-tools check run recorded 9 failures. Five predate that change and come from test contracts that later commits made stale. Four are files whose tests take close to or over the 20-second default timeout even when run alone, so they fail under parallel load. While the suite is red, a real regression cannot be told apart from known noise, and `project-check-integrity` says a batch must not be reported green with failures in it.

## What Changes

- Update stale assertions to the current specified behaviour, without weakening what they protect:
  - `src/repl/preset.test.ts` (2 tests) and `src/agent/presetPrompt.test.ts` (Standard plugin case) assume Standard grants no `openspec`. Since `023f4405`, the `agent-presets` spec makes Standard grant `openspec` and other plugins by default, so these tests must build a Standard snapshot without the plugin grant explicitly.
  - `src/agent/presetPrompt.test.ts` prompt budget: the Standard fixture prompt is 18–19k characters, against a 17,500 limit set before Standard gained plugins and native tools. Re-derive the limit from a fresh, reviewed measurement. The historical "before" fixture is not regenerated.
  - `src/models/internalCompatibility.test.ts`: `listModels` gained an optional `cacheOnly` option (additive, `87327e1d`). Allow additive optional options in the public-contract comparison rather than rewriting the baseline.
- Make the four slow tests (`agent/syncWorldState`, `procs/auth/keys`, `rtk/bash`, `git/stageCommitPush`) reliable: find why each takes ~20 seconds, fix the cause, or move them to the integration kind with an explicit reason.
- Record the before/after failure inventory as required by `project-check-integrity`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This only changes tests and the test harness, so no spec-level behaviour changes.

## Impact

Test files and fixtures listed above, possibly `script/test.ts` kind classification and test helpers. No runtime code changes are expected. If one of them turns out to be needed, it is a separate finding and must be raised before it is made.
