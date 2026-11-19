# Submission and regression verification

## Targeted checks (4.3)

2026-11-19, worktree at `834d8ae5` plus the uncommitted submission/browser changes; Bun 1.4.4. Commands below ran from the project root (Bash brace expansion). No live model or voice provider, user microphone, developer Chrome profile or working database was used.

| Scope | Result | What was exercised |
| --- | --- | --- |
| Editor, composer, queue and Models UI | 133 passed, 12 files, no skips | Command chips and caret, Enter/Shift+Enter, menu navigation, Ctrl/Cmd+Enter steering, attachments, ordinary send vs. queue, finalization, retry identity, model selection and settings. |
| Ordinary composer controls | 2 passed, 4 unrelated cases filtered out | Trim and clear on send; Shift+Enter does not submit. |
| Server send/queue, model and voice routing | 44 passed, 7 files, no skips | Queue request deduplication and worker state, ordinary message persistence, cache-only Models resolution, disabled routes, protocol selection with fixture transports, model UI projection, independent voice default and per-chat routes. |
| Inline and panel in private Chromium | **2 passed**, no skips, 96 assertions | Synthetic audio through the AudioWorklet and authenticated local WS to the fake Realtime server. No interim history, queue writes, audio files or fixture key in observed browser traffic. Inline stop left the draft unsent; explicit double panel send produced one pending queue row. |
| Browser opt-out | **0 passed, 2 skipped** | Smoke check of explicit opt-out for hosts without Chromium or the shipped disposable DB. Not acceptance evidence. |
| Missing Chromium, no opt-out | Expected setup failure, exit 1 | With no binary in the default locations, the fixture reported that private Chromium was required. It did not report success or fall back to a running browser. |

```bash
bun run frontend:test -- frontend/src/test/{command-editor,command-menu,command-events,input-caret,attachments,composer-footer,message-queue,model-picker,settings-models,inline-dictation-composer,voice-panel,voice-submission}.test.tsx
bun run frontend:test -- frontend/src/test/components.test.tsx -t 'sends trimmed text|does not send on Shift'
bun test --timeout=20000 ./src/agent/{queue,queueRequest,route_post_dup}.test.ts ./src/models/{protocolRoute,routeResolution}.test.ts ./src/frontendBridge/models.test.ts ./src/voice/route.test.ts
MAUZCODE_SKIP_VOICE_BROWSER_TESTS=0 CHROME_BIN=/home/suchimauz/.cache/rod/browser/chromium-1321438/chrome bun test ./src/voice/composer.browser.it.test.ts
MAUZCODE_SKIP_VOICE_BROWSER_TESTS=1 bun test ./src/voice/composer.browser.it.test.ts
env -u CHROME_BIN MAUZCODE_SKIP_VOICE_BROWSER_TESTS=0 bun test ./src/voice/composer.browser.it.test.ts  # expected failure on this host
```

Models independence: `git diff --exit-code eb145cc7 -- src/models` returned 0 (unchanged since before the Voice SDK), and `rg -in 'voice|whisper' src/models -g '*.ts'` returned 1 (no matches). The Models tests above resolve model routes without configuring a voice connection. Browser coverage used the disposable DB at `127.0.0.1:54399`; it does not claim vendor or physical microphone compatibility. These are targeted checks; broader results follow.

## Whole-project checks (4.3)

- The runtime TypeScript check (`procs.dev.typecheck({})`, isolated workdir with the repository's `opencode-go` module) passed with zero diagnostics. Strict OpenSpec validation passed.
- `bun run test`: 4,028 passed, 12 skipped, 18 failed. The same 18 test names failed before block 4; none is new.
- `bun run frontend:test`: 962 tests passed; five Git/Terminal suites failed during import. `bun run frontend:build` remains blocked by the missing `react-diff-view` and xterm dependencies. The failing suites and build diagnostics match the prior baseline. Neither full check is reported as green.
- Indexed the checkout against a disposable test DB, with `gh`, `browser`, `telegram` and `opencode-go` mounted, then ran `code.quality({})`. Of 1,637 indexed functions, the report flagged one error: `screen.openTab` depends on the private `browser.tabs` plugin. The same check on `834d8ae5` flagged exactly the same error; warnings were 563 vs. 564 on that baseline. This is not a clean quality gate and is unrelated to dictation.
