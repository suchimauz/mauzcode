# Proposal

## Why

Codex primary and secondary slots are currently treated as fixed session and weekly periods, so a primary seven-day quota is displayed in the five-hour column. Claude's additional model-specific limits are discarded, leaving people unaware of restrictions outside the main quota matrix.

## What Changes

- Classify Codex quota periods by reported duration, never by primary/secondary position or display-label prefix.
- Preserve provider window identity, period evidence and scope through the usage report and quota API. Only explicitly identified account-wide windows populate the five-hour, weekly and monthly columns.
- Preserve valid additional Claude quota windows without hard-coding a list of model names; distinguish model-specific restrictions from account-wide limits even when their periods match.
- Keep unmapped, ambiguous and additional windows visible through a compact additional-limits indicator and accessible tooltip, with name, available usage and reset information. Do not invent zero usage or a period for missing data.
- Keep existing main columns and status/balance-only behavior. Maintain currently supported providers, including OpenCode Go, during the additive contract transition.
- Add provider, API and UI regression tests, including a weekly-only Codex primary window and model-specific Claude windows.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `llm-codex-provider`: Determine usage periods from duration and retain unknown windows without slot-based assumptions.
- `llm-claude-provider`: Preserve additional valid quota windows, identify account-wide periods and keep additional windows during header-only updates.
- `model-defaults-and-pricing`: Carry structured quota metadata, map main columns safely and expose additional limits in an accessible tooltip.

## Impact

Affected areas include `models.UsageReport`, Codex and Claude usage normalization/header cache, `frontendBridge.modelUsage` and its view types, `/api/v1/quotas`, frontend quota types/helpers and sidebar quota rendering. Existing provider adapters and tests need a compatibility audit; no new service, dependency or database migration is intended.

Out of scope: changing provider limits, inference scheduling, automatic model switching, purchasing extra usage, replacing the quota matrix, or assuming a particular model name such as the user's Fable5 example is an actual upstream field. Provider payloads remain the source of truth.
