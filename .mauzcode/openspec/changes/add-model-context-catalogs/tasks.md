# Tasks

## 1. Catalogue data

- [x] 1.1 Add pinned dependency `@earendil-works/pi-ai@1.5.2` (registry lockfile entries only)
- [x] 1.2 `models.catalog.priceCatalog`: `cacheOnly` option returning the current snapshot and refreshing in the background; type includes `limit`
- [x] 1.3 `inference.catalog` on `ProviderDefinition`; Z.ai Coding Plan declares `zai-coding-plan`, `zai` / `zai`
- [x] 1.4 New `models.catalog.catalogLimits`: per-model context/output from models.dev then pi-ai, exact ids, failures as no data

## 2. Precedence and consumers

- [x] 2.1 `ContextLimit` gains `catalog` and source `catalog`; `contextLimit` order override → provider → catalog → 200,000
- [x] 2.2 `resolveRoute`, `api` models action and `setContextLimits` pass catalogue values; route output limit from catalogue when absent
- [x] 2.3 Models tab: `catalog` source label and placeholder; frontend type

## 3. Verification

- [x] 3.1 Unit tests: precedence, sections order and default, custom without lookup, cold cache without waiting, output limit
- [x] 3.2 Existing models/compaction/frontend settings tests and public-contract baseline; typecheck diff against main
- [ ] 3.3 Hot-reload in the live runtime, strict docs validation, check a real `zai-coding` route
