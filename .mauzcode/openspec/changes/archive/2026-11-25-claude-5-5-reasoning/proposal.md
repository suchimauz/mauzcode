# Proposal

## Why

The Claude catalogue now lists only the current models: Fable 5.2, Opus 5.5, Sonnet 5.5 and Haiku 5.5. Reasoning-effort detection still recognises only Opus and Sonnet ids, so Fable 5.2 and Haiku 5.5 show no effort levels and always run with the model default, although Anthropic documents adaptive thinking with selectable effort for all four.

## What Changes

- Treat every Claude 5 model id (Opus, Sonnet, Haiku, Fable) as an adaptive-thinking model with effort `low`, `medium`, `high` and `xhigh` (sent as `max`); `auto` keeps omitting effort.
- Offer `xhigh` on Sonnet and Haiku from version 5.5 on, as Anthropic now supports the maximum effort level on all current models; earlier Sonnet 5 keeps its previous levels.
- Never send `thinking: { type: "disabled" }` to any Claude 5 model, since Fable and Opus 5.5 reject it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `llm-claude-provider`: Thinking rules cover all Claude 5 models, and the catalogue states which effort levels each Claude 5 model offers.

## Impact

- `src/models/inference/resolveReasoningEffort.ts` and `src/models/provider/claude/claudeStream.ts` model matching.
- Effort pickers for Claude connections; no data migration, no new dependencies.
