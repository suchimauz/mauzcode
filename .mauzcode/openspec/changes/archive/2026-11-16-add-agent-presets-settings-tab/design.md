## Context

Presets are stored in `agent_presets` and read with `agentPreset.list` (ordered by `sort_order`, then `id`). The `agentPreset.default` setting names the preset for new sessions; a missing preset makes creation fail. The React Settings dialog (`SettingsDialog.tsx`) has fixed core tabs whose panels load data through `/ui-lab-api/*` bridge endpoints (for example `frontendBridge.sshInstances`, which requires an authenticated owner and returns `no-store` JSON). `frontendBridge.newSession` deliberately returns only `id`, `name`, `description` and `sortOrder` for presets, and a test asserts that access rules do not leak there.

## Goals / Non-Goals

**Goals:** Let the owner inspect every stored preset and the default selection in Settings, read-only, with accessible presentation consistent with existing panels.

**Non-Goals:** Preset writes or default changes from the UI, snapshot inspection, changing preset semantics or storage, exposing rules through the new-session endpoint, or treating the view as a security boundary.

## Decisions

- **Dedicated endpoint.** Add `frontendBridge.agentPresets` routed at `/ui-lab-api/agent-presets` instead of widening `newSession`. Keeps the menu contract minimal and the existing leak test valid.
- **Owner-only GET.** Unauthenticated → 401; non-owner → 403; any method other than GET → 405 with `Allow: GET`. No CSRF token is needed because there are no writes. Responses use `Cache-Control: no-store` and `Vary: Cookie`.
- **Response shape.** `{ version: 1, presets: Array<{ id, name, description, sortOrder, builtin, allow, deny, plugins, excludeSections, prompt, updatedAt }>, defaultPresetId: string, defaultPresetMissing: boolean }` in `agentPreset.list` order. Field names are camelCase for the browser; values are copied from stored rows without reinterpretation.
- **Rendering.** One card/section per preset with a heading (name), identifier, description, badges (Built-in / Custom, Default for new sessions). Rule lists are rendered as lists of monospace patterns; an empty list renders "none"; the `*` pattern is labelled "everything" while still showing the literal. An empty prompt renders "none"; a non-empty prompt is shown as preformatted text that preserves whitespace. Updated time uses the local date-time format of existing panels.
- **Missing default.** When `defaultPresetMissing` is true, show a warning naming the configured identifier and explaining that new sessions without an explicit preset will fail to be created.
- **Explanatory note.** A short note states that edits affect only new agents (existing snapshots are unchanged) and that presets are a guardrail, not a sandbox.
- **States.** Loading status, error message with a Retry button, and an empty-list message.
- **UI guidance.** Follow the Apple Design skill, existing settings tokens (light/dark), focus styles and reduced motion. No interactive controls other than Retry.

## Risks / Trade-offs

- Exposing allow/deny/prompt text in the browser reveals configuration to anyone with the owner session; acceptable because the owner can already read it through the runtime, and the endpoint is owner-only and uncached.
- Long prompts or long allow lists may make cards tall; mitigate with wrapping and scrollable preformatted blocks rather than truncation.
- Data is a point-in-time read; the panel reloads on open and on Retry, without live updates.
