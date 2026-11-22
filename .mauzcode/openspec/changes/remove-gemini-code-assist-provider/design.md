# Design

## Context

The `gemini` provider (change `add-gemini-code-assist-provider`) is self-contained: a declaration file, a `models.provider.gemini` namespace, process-local state fields in `models.State`, one optional `LoginFlow` field and one UI branch in the Models settings panel. The shared `gemini` protocol was refactored in the same change (`buildRequest`/`readStream`, thought signatures) and is now used by `custom` and OpenCode Go.

## Goals / Non-Goals

**Goals:**
- Remove every provider-specific file, type field, UI branch, test and doc section.
- Leave the build, typecheck and all test suites green.

**Non-Goals:**
- Changing or removing the shared `gemini` protocol, `thoughtSignature` on tool calls, or the `brand:gemini`/Google model logos.
- Automatically deleting existing `gemini` connections or their secrets.
- Rewriting Git history to purge the OAuth constants from earlier commits (a separate, explicitly approved action).

## Decisions

- **Delete, not disable:** `models.disabledProviders` would keep the embedded client constants in the tree; full removal is what is wanted.
- **Also remove `callbackAuthorizationUrl`:** only the Gemini provider sets it; keeping a dead optional field and UI branch adds noise. The compatibility test's additive allowance for it goes too.
- **Keep the protocol refactor:** `buildRequest`/`readStream` and signature replay are part of the `llm-model-protocols` capability and have other callers.
- **Leftover connections:** the Models UI already shows connections whose provider is not registered; the owner can remove them there. No migration.

## Risks / Trade-offs

- [An owner still uses a `gemini` connection] → it stops working; migration text points to `custom` + API key.
- [Stale secret `models/<id>.gemini-auth` remains] → encrypted and inert; removed with the connection.
- [Secret still present in Git history] → push protection keeps blocking until history is fixed or the secret is allowed; out of scope here.
