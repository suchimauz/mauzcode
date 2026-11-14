## Context

`frontendBridge.modelCatalogue` is the single projection behind every picker, chat list and header, and it uses `ModelInfo.label || id`. Only `codexListModels` sets labels. `models.catalog.priceCatalog` already keeps an hourly models.dev snapshot for pricing. Marks: `ui.modelLogo` (brand SVG paths matched against the whole route), `frontendBridge.declaredIcon` (Lucide glyph from `ProviderDefinition.icon`), and `models.api` special-casing `custom` to null.

## Goals / Non-Goals

**Goals:** one name resolver and one mark resolver, used by every UI projection.

**Non-Goals:** user-defined model renames; changing custom chat icons (`agents.icon` stays first); changing routes.

## Decisions

- **Names: label → models.dev → prettify.** Provider labels are authoritative (Codex). models.dev covers Claude and most open models without hard-coded tables. The legacy prettifier is restored as the offline fallback. Lookup tries the provider's `inference.priceVendor`, then the id's own `vendor/` prefix, then well-known vendors, then every vendor. Alternative — static names inside `claudeListModels` — rejected: it only fixes Claude.
- **Reuse `priceCatalog`.** No second fetch or cache; the first call may wait for the initial fetch exactly as pricing already does, later calls use the snapshot; failures fall back to prettify.
- **`models.catalog.displayNames` lives in models**, since it needs provider metadata (`priceVendor`) and the catalogue; `modelCatalogue` calls it once per projection with all routes. Routes outside the catalogue (stale agent selections) use the same function.
- **Marks: `frontendBridge.modelMark({ model?, provider? })`** returns `{ src, custom } | null`. With a model it asks `ui.modelLogo` for a brand by the model id; with no brand it uses the provider brand (`ui.modelLogo` for `<provider>:x`); custom/unknown providers get the Lucide `plug` via `declaredIcon`. `ui.modelLogo` matches the model id first and the provider prefix second, and gains Simple Icons (CC0) paths for Google/Gemini/Gemma, Qwen, Meta/Llama, Mistral and DeepSeek.
- **Quotas get icons server-side.** `/api/v1/quotas` adds `icon` per account (`modelMark({ provider })`); the client fallback to `/ui-lab-api/provider-icons` stays for older responses, and that endpoint also uses `modelMark`.

## Risks / Trade-offs

- [models.dev unreachable on first start] → first projection waits up to the existing 20 s fetch timeout once; afterwards prettify fallback. Same behaviour pricing already has.
- [Wrong models.dev match across vendors] → exact id match only, provider vendor first.
- [Brand substring false positives, e.g. "meta" in an id] → match on id tokens at the start (`llama`, `meta-llama/`), not anywhere.
