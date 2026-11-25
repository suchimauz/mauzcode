# Proposal

## Why

Antigravity already advertises model groups, their selectable thinking levels and per-model quota measurements. MauzCode discards those groups and measurements: one Gemini model can appear several times with the wrong effort choices, Claude is filtered out, and the sidebar shows connection health instead of the remaining quota.

## What Changes

- Offer one choice per advertised Gemini or Claude group. Select only an effort backed by a visible native model ID on that connection; a saved level the group lacks follows the SDK nearest-level rule, an explicit unsupported level at an entry point is rejected. Keep eligible standalone models. Existing chats are not migrated: a route that is not in the current catalogue fails `MODEL_UNAVAILABLE` instead of being substituted.
- Use the same cached choices for the chat picker and `list_models`. Send the selected native ID on the signed-in Antigravity connection; discovery alone is not evidence that a Claude tool round trip works.
- Read the remaining fraction and reset time per eligible native ID **before** grouping. Report Gemini and Claude separately on one account, without inventing shared quota pools, periods or additional accounts.
- Show adjacent Antigravity cards in the sidebar grid, **Gemini** and **Claude**, one per family that has at least one enabled model. Each shows the remaining percentage, or a range when measurements differ, without opening a tooltip. The settings view and card details use the same observations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `llm-antigravity-provider`: Account-scoped Gemini and Claude discovery, exact variant dispatch, and measured family quotas.
- `llm-provider-sdk`: Variant-backed reasoning levels resolved by `models.stream` to a native member ID, and the `MODEL_UNAVAILABLE` failure.
- `llm-model-cache`: Preserve connection-specific group-to-native-ID mappings across cache reads; routes resolve only against the current catalogue.
- `model-defaults-and-pricing`: Expose typed family measurements for one connection and display per-family remaining-quota cards without changing other providers' cards.

## Impact

Affects the Antigravity adapter, the shared reasoning normalization in `models.stream` and delegation, catalogue and inference resolution, usage normalization and quota API, and the React sidebar and Models settings. The API retains one account per connection. No change to OAuth, account-switching policy, other providers' routing or pricing; no GPT-OSS or internal-model support. This change specifies work only: it requires no live-account probes or credential transfer.
