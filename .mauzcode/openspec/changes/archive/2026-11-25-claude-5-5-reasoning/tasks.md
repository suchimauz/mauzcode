# Tasks

## 1. Effort resolution

- [x] 1.1 Recognise Opus, Sonnet, Haiku and Fable Claude 5 ids in the effort resolver, with `xhigh` for Opus, Fable and Sonnet/Haiku 5.5+; verify by extending `src/models/inference/resolveReasoningEffort.test.ts`
- [x] 1.2 Apply the same Claude 5 family match to the `off` rule in the Claude stream; verify with the reasoning wire matrix in `src/models/claudeProtocol.test.ts` covering `claude-haiku-5-5` and `claude-fable-5-2`

## 2. Catalogue

- [x] 2.1 Verify the Claude catalogue offers `low`…`xhigh` for all four current models by updating `src/agent/effort.test.ts` and `src/agent/modelsMigration.unit.test.ts`, and check the live catalogue after hot reload

## Workflow follow-up

- Archive the change and run full OpenSpec validation.
