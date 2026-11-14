# Tasks

## 1. Display names

- [x] 1.1 Add `models.catalog.displayNames({ routes })` (label → models.dev via priceCatalog → prettify) and verify its bun tests: label priority, vendor-first lookup, any-vendor lookup, "(latest)" stripping, empty-catalogue prettify table
- [x] 1.2 Add facade `models.displayNames` delegating to the catalog procedure and add it to the facade list in `facadeRemoval.test.ts`; verify the models architecture and facade tests pass
- [x] 1.3 Use it in `frontendBridge.modelCatalogue` and for out-of-catalogue routes in `modelData`, `newSession`, `chatHeader`, `navigationData`; verify the frontendBridge tests show "Claude Opus 4.5" for `claude-opus-4-5`

## 2. Marks

- [x] 2.1 Make `ui.modelLogo` match brands by model id first and provider second, add Google, Qwen, Meta, Mistral and DeepSeek marks; verify modelLogo tests (custom claude id → Anthropic, gemma → Google, unknown → generic)
- [x] 2.2 Add `frontendBridge.modelMark({ model?, provider? })` and verify its matrix test (claude/codex/custom provider, known/unknown model)
- [x] 2.3 Route `iconData`, `providerIcons`, `models.api` providerLogos and `/api/v1/quotas` account icons through `modelMark`; verify their tests and that quota accounts carry the Anthropic/OpenAI marks
- [x] 2.4 Keep `useQuotas` preferring the server icon with provider-icons fallback; verify frontend vitest (use-quotas, quota-matrix, model-picker, settings-models)

## 3. Integration checks

- [x] 3.1 Run docs validation for changed functions, one project typecheck and code.quality, and verify no new diagnostics

## 4. Review follow-ups

- [x] 4.1 Name welcome-screen statistics models (`frontendBridge.statsData`) through `models.displayNames`, grouping routes that share a display name; verify stats test
- [x] 4.2 Add `fromLabel`/`toLabel` display names to `model_changed` lifecycle data in `/api/v1/agents/:id/events` and show them in `LifecycleRow`; verify route tests
- [x] 4.3 Return `modelLabel` and `modelIcon` from `sidebar.draft` and show them on the sidebar draft page; verify draft API and people-draft tests
- [x] 4.4 Ignore a persisted `ssh/<host>:` prefix in `models.catalog.displayNames` so new-session statistics and chats name the same model identically on every host; verify displayNames test
- [x] 4.5 Return shared display names from the Models settings `models` action for every provider (not only codex labels); verify models.api test
