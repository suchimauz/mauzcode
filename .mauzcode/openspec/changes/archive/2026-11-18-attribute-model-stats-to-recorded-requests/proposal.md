## Why

New Session used the session’s current model to label historical activity. A model switch could relabel earlier work, and an archived session with no current model could make `null` the favorite. This change documents the correction already implemented in `c1e55b5c`.

## What Changes

- Rank models by completed requests with a recorded model in the selected period, not by messages attributed to the session’s current model.
- Omit unattributed usage from model rankings and charts without removing it from overall activity or measured token totals.
- **BREAKING** for consumers of the internal statistics endpoint: `models[].requests` replaces `models[].messages`; the overall `messages` count is unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `model-presentation`: define attribution, ranking and missing-data behavior for New Session model statistics.

## Impact

Affects the internal welcome statistics response and the New Session overview, list and chart. No stored sessions or historical records are modified.
