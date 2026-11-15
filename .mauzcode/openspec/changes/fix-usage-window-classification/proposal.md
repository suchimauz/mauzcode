# Proposal

## Why

Codex primary and secondary slots are currently treated as fixed session and weekly periods, so a primary seven-day quota is displayed in the five-hour column. Claude's additional model-specific limits are discarded, leaving people unaware of restrictions outside the main quota matrix.

## What Changes

- Classify Codex quota periods by reported duration, never by primary/secondary position or display-label prefix.
- Preserve provider window identity, period evidence and scope through the usage report and quota API. Only explicitly identified account-wide windows populate the five-hour, weekly and monthly columns.
- Preserve valid additional quota windows for every provider that reports them (Claude model-specific records, additional Codex `rate_limits` entries, OpenCode Go extras) without hard-coding a list of model names; distinguish model-specific restrictions from account-wide limits even when their periods match.
- Carry the new window metadata through the core usage normalization (`models.connections.usage`), which currently rebuilds windows from label and measurements only.
- Breaking for label-only providers: a window without explicit period/scope is shown only as an additional limit. The presentation layer never guesses a period from the label.
- Keep unmapped, ambiguous and additional windows visible through a compact additional-limits indicator and accessible tooltip, with name, available usage and reset information. Do not invent zero usage or a period for missing data.
- Keep existing main columns and status/balance-only behavior. Maintain currently supported providers, including OpenCode Go, during the additive contract transition.
- Add provider, API and UI regression tests, including a weekly-only Codex primary window and model-specific Claude windows.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `llm-codex-provider`: Determine usage periods from duration, retain unknown windows without slot-based assumptions and keep additional `rate_limits` entries.
- `llm-claude-provider`: Preserve additional valid quota windows, identify account-wide periods and keep additional windows during header-only updates.
- `model-defaults-and-pricing`: Carry structured quota metadata, map main columns safely and expose additional limits in an accessible tooltip.

## Impact

Affected areas include `models.UsageReport`, `models.connections.usage` normalization, Codex and Claude usage normalization/header cache, `frontendBridge.modelUsage` and its view types, `/api/v1/quotas`, frontend quota types/helpers and sidebar quota rendering. Existing provider adapters and tests need a compatibility audit (currently only Claude, Codex and OpenCode Go report windows; the custom provider and installed user plugins do not); no new service, dependency or database migration is intended.

Out of scope: `codexQuota` inference-response quota observations, changing provider limits, inference scheduling, automatic model switching, purchasing extra usage, replacing the quota matrix, or assuming a particular model name such as the user's Fable5 example is an actual upstream field. Provider payloads remain the source of truth.
