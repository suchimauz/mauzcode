# Tasks

## 1. Remove the provider

- [x] 1.1 Delete `src/models/$modelProvider_gemini.ts`, `src/models/provider/gemini/` and `src/models/gemini.test.ts`; remove the `gemini*` fields from `src/models/State.ts` — verified by `rg -n "provider\.gemini|modelProvider_gemini|geminiLogin" src` returning nothing.
- [x] 1.2 Remove `LoginFlow.callbackAuthorizationUrl`, its additive allowance and the `GEMINI_STATE` handling in `src/models/internalCompatibility.test.ts`, and `gemini` from the provider id lists in `internalCompatibility.test.ts` and `defaultsPricing.test.ts` — verified by `bun test src/models`.
- [x] 1.3 Drop `gemini` and the same-machine link branch from `frontend/src/components/settings/ModelsPanel.tsx` and its test in `frontend/src/test/settings-models.test.tsx` — verified by `bun run frontend:test -- settings-models`.
- [x] 1.4 Remove the Gemini provider section and namespace mention from `docs/models-providers.md` — verified by reading the doc; protocol sections remain.

## 2. Verification

- [x] 2.1 Run `bun run test`, `bun run frontend:test`, project `tsc --noEmit` and `tsc -b frontend/tsconfig.json`; all pass.
