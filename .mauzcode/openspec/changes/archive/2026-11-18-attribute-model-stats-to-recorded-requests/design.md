## Context

The welcome screen reads separate aggregates for messages and `context_usage` events. The latter are recorded after a completed request and can carry its model even if the provider returned no usable token counts. Older events may lack the model.

## Goals / Non-Goals

Keep overall activity independent of model attribution. Do not backfill historical records, guess a missing model or change owner and date filters.

## Decisions

- Use the model recorded on each request event. Looking up the session model instead loses information after a switch or archival. Group by the existing display-name resolver before ranking.
- Count completed requests rather than tokens or conversation messages. Token volume measures consumption rather than frequency; messages do not reliably identify which model answered. Keep measured token totals separate from request counts.
- Preserve unattributed tokens in daily and overall totals, but draw chart segments only from known models. This keeps the overview accurate without suggesting an unknown model was used more than a known one.

## Risks / Trade-offs

- Incomplete historical coverage → model shares need not add up to 100% of all tokens; the overview explains that unattributed activity contributes only to totals.
- Internal response field changed → the welcome screen and its typed response were updated together in `c1e55b5c`. No storage migration is needed.
