# Design

## Context

`mapUsage` emits Antigravity general buckets as `scope: "group"` windows with `family`, `period` and `bucket`; other buckets are `scope: "unknown"`. `/v1/quotas` keeps one account per connection, puts these readings into `additionalWindows` and adds `families` from the cached catalogue. The frontend then has a parallel path: `summarizeQuotaFamily`, `quotaFamilySummaries`, `quotaAccountExtras`, `FamilyCard`, `FamilyTooltipBody`, family texts (`FAMILY_TEXT`, `PERIOD_TEXT`, pool titles) in the sidebar, and `usageFamilies`/`FamilyUsage` in Settings. Standard accounts use `windows` + `additionalWindows`, `QuotaCard`, `QuotaTooltipBody`, `CompactRows` and the generic window list in `UsageView`.

## Goals / Non-Goals

**Goals:**
- One rendering path for every provider; Antigravity differs only in data (two accounts, a family caption, two Settings sections).

**Non-Goals:**
- Changing how quota is read, cached, refreshed or classified by `mapUsage` (identity, `scope: "group"`, conflicts).
- Changing other providers' accounts or labels.

## Decisions

1. **Split in `/v1/quotas`, not in the provider.** The usage report stays one per connection (Settings, failure handling and the cache depend on it). The route projects each eligible family into its own account: id `<connection>:<family>`, `family` field, `label` `Antigravity · <account>`, `windows` filled from that family's unique `group` readings, `additionalWindows` = that family's other windows; windows with no eligible family go to the first pool account (Gemini, else Claude) so nothing is dropped. Partial (truncated) families are surfaced through the existing stale/partial hint of that account. *Alternative:* split in the frontend — rejected, it keeps a special data path in `quotas.ts`.
2. **Caption via a `family` field on `QuotaAccount`.** `quotaAccountCaption` returns `<Family title> · <account>` when `family` is set; `QuotaCard`, tooltip and compact rows need no other change. Click passes `{ account: connectionId, family }` so Settings can scroll to the section.
3. **Settings sections reuse the generic window list.** `UsageView` groups windows by structured `family` into titled sections and renders each with the same `<li class="models-window">` markup as ungrouped windows; `FamilyUsage`, `usageFamilies` and the pool caption go away. Focus on selection stays (accessibility), the persistent `data-selected` outline is removed.
4. **Standard labels.** Antigravity general windows get the shared labels used by Z.ai/MiniMax (`Session (5h)`, `Weekly (7d)`) instead of upstream display names, so Settings lists read the same; extra buckets keep their own names.
5. **Delete family-only helpers.** `summarizeQuotaFamily`, `quotaFamilySummaries`, `quotaFamilyReadings`, `quotaAccountExtras`, `quotaFamilyHeadline/Details/Note`, `FAMILY_TEXT`/`PERIOD_TEXT`, `FamilyCard`, `FamilyTooltipBody` and their CSS are removed; `QUOTA_FAMILIES` stays only for titles and order.

## Risks / Trade-offs

- [API consumers expecting `families`] → only the bundled frontend consumes `/v1/quotas`; tests and fixtures are updated in the same change.
- [Account ids change for Antigravity] → quota UI state keyed by account id (expanded/compact) is not persisted per id; Settings targets use connection id + family.
