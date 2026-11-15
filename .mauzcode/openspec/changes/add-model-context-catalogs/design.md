## Context

`models.catalog.contextLimit` resolves override → provider `contextWindow` → 200,000. Many providers' `/models` listings carry no size (Z.ai returns only ids). `models.catalog.priceCatalog` already caches `https://models.dev/api.json` (hourly refresh, last good snapshot kept) and that file has `limit.context`/`limit.output` per vendor section. deepseek-harness solves the same gap with the `@earendil-works/pi-ai` catalogue, which ships the data offline.

## Goals / Non-Goals

**Goals:** correct limits for models whose provider does not report them; no provider network access during route resolution; keep the owner override first; work on a cold start without network.

**Non-Goals:** guessing limits for `custom` connections by model id across all vendors; using pi-ai for inference; changing upstream request bodies; per-model matching heuristics (exact id only).

## Decisions

- **Order: override → provider → models.dev → pi-ai → 200,000.** Provider listing is the most specific; models.dev refreshes hourly so it is fresher than a pinned npm package; pi-ai covers cold start and network failures.
- **Section mapping.** `ProviderDefinition.inference.catalog?: { modelsDev?: string[]; piAi?: string[] }`. When a list is absent the price vendor is used as the single section. Sections are tried in order with exact model ids. Z.ai Coding Plan: models.dev `zai-coding-plan`, `zai`; pi-ai `zai`.
- **One lookup function.** New `models.catalog.catalogLimits({ provider, models })` returns per model `{ context, output, source: "models.dev" | "pi-ai" }` or nothing. Callers (`resolveRoute`, `api` models action, `setContextLimits`) pass the value to the pure `contextLimit`.
- **No blocking network in resolution.** `priceCatalog` gains `cacheOnly`: returns the current snapshot (possibly empty) and starts a background refresh instead of awaiting it. `catalogLimits` always uses it.
- **pi-ai through its public entry.** `@earendil-works/pi-ai/providers/all` `getBuiltinModels(section)`; loaded lazily once, failures treated as no data. Pinned exact version.
- **Provenance.** `ContextLimit` gains `catalog: number | null` and source `catalog`. Output limit is filled into `ResolvedRoute.maxOutputTokens` only when the provider gives none.

## Risks / Trade-offs

- Catalogue values can be wrong or stale → the owner override still wins, and models.dev refreshes hourly.
- Larger install (pi-ai pulls provider SDKs, ~8 MB own size) → only static data is loaded at runtime; pinned version.
- Section names may diverge between catalogues → explicit per-provider lists.
