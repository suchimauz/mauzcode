# Design

## Context

`agent.delegate` forks the parent through `session.fork`, which calls `agent.start` with `model: parent.model` and a hard-coded `reasoningEffort: "auto"`. The Goal path (`agent.publishGoalDelegation`) and `sharedAgent.delegate` build children the same way. Changing a model later is done by `agent.setModel` (route validation via `models.resolveRoute`) and effort by `agent.setReasoningEffort` (validated against the model catalogue's `reasoning.supported`). Availability is enforced at inference time by `models.inference.assertModelEnabled`.

## Goals / Non-Goals

**Goals:**
- Let the delegating agent choose the child's model and reasoning effort at creation time.
- Fail fast, before a child exists, on invalid or unavailable choices.
- Give agents a cheap, secret-free way to discover selectable routes.

**Non-Goals:**
- Model allowlists in presets or per-parent model limits.
- Shorthand model ids, aliases or automatic model recommendation.
- Changing the model of an already running child (use `agent.setModel`).
- UI changes beyond what already shows an agent's stored model.

## Decisions

1. **Exact routes only.** `model` must be a canonical `provider/accountName:modelId` route resolved by `models.resolveRoute`. Bare model ids are ambiguous across accounts; rejecting them keeps behaviour predictable. Alternative (bare id lookup) rejected for ambiguity.
2. **One shared validation helper** (e.g. `agent.resolveChildModel({ model?, reasoningEffort?, parentModel })`) returns `{ model, reasoningEffort }`. It resolves the route, calls `models.inference.assertModelEnabled`, reads the connection's cached catalogue (`listModels` with `cacheOnly: true`) and checks the effort against `reasoning.supported`. Every entry point calls it before forking, so no orphan child is left on failure.
3. **Effort is not inherited.** Omitted effort means `auto`, which the connection normalizes for the target model; inheriting a parent level could be unsupported on a different model.
4. **Plumbing through `session.fork` and `agent.start`.** `session.fork` gains `model` and `reasoningEffort` options passed to `agent.start`; `agent.start` accepts an optional `reasoningEffort` (default `auto`). Callers that omit them are unchanged.
5. **Discovery via `models.selectable`.** Cache-only: lists enabled connections of enabled providers and their non-disabled models as `{ route, label, reasoning }`. Exposed as native tool `list_models` with `requires: [models.selectable]`. Delegation errors name the rejected route and point to `list_models`.
6. **Transcript visibility.** When a child starts on a non-inherited model or explicit effort, a visible event records the chosen route and effort, so the child chat shows why it differs from the parent.
7. **No preset permission.** Presets govern functions, not models; `presetId` keeps its narrowing-only semantics.

## Risks / Trade-offs

- [Cost] An agent can pick an expensive model for trivial work → mitigated by owner control over enabled models/connections; allowlists left for a later change.
- [Stale cache] `models.selectable` and effort checks use cached catalogues; a model removed upstream fails at inference with the existing error contract.
- [Usage-limit parking] A child on another credential can be parked independently of its parent; existing parking/`setModel` flows apply unchanged.
