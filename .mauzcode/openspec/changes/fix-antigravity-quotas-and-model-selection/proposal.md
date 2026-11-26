# Proposal

## Why

Antigravity's model inventory exposes one remaining fraction per native model, not separate five-hour and weekly limits. The sidebar currently presents that figure as a family allowance; a three-minute provider cache can also mask changes between one-minute UI polls. Separately, a model switch can carry yesterday's effort choice to a different model, and Settings makes individual efforts look like independently configurable models.

## What Changes

- Read the authenticated quota summary for the connection's project. Show the reported five-hour and weekly buckets separately for Gemini and for Claude (which shares a pool with GPT); never infer an absent window from inventory or a nearby reset.
- Replace the family remaining figure with ordinary five-hour / week / month **used** cells. Retain the Antigravity icon, family and accessible account identity; leave unmeasured periods blank (`—`). Refresh visible data every minute, share observations with Settings, and distinguish stale data from a successful measurement.
- Reset requested effort to Default (`auto`) when the model changes for any provider, in an existing chat or a draft. Keep manual selection on the same route, and keep an effort the target catalogue lists as supported when only the account (connection) changes (unknown support resets to Default); connection renames never touch effort.
- **BREAKING (Antigravity availability policy):** configure whole catalogue models/groups, not individual efforts. Restore all provider-available levels of a partially disabled group; keep an explicitly or fully disabled group off. Preserve exact native dispatch and unrelated settings.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `llm-antigravity-provider`: authoritative quota summary and group/period identities.
- `model-defaults-and-pricing`: one-account family period views, refresh and failure semantics.
- `models-settings-ui`: one switch per Antigravity catalogue choice.
- `llm-model-availability`: Antigravity group members are not individually configurable models.
- `llm-model-cache`: connection-local conversion of legacy member disables without losing group mappings; enabling a group clears its proven member disables.
- `llm-provider-sdk`: variant normalization honours provider-declared group-level availability instead of per-member disables.
- `agent-model-inference`: atomic effort reset on a real model switch.
- `new-session-options`: draft route changes, replacements and same-route restoration.

## Impact

Touches the Antigravity control API allow-list, usage cache and normalized quota data, `/api/v1/quotas`, Models settings, navigation cards, agent model switching and new-session selection. Keeps the saved transport, existing account-wide period columns, other providers' refresh policies, and native model IDs. No generation, new credential, external dependency, or global reconfiguration is needed. Implementation, a live acceptance check and documentation updates are future tasks, not part of this proposal's delivery.
