## Why

Providers such as Z.ai Coding Plan list model ids without any context size, so every such model silently gets the 200,000-token fallback even when it really accepts 1,000,000 tokens. Compaction then starts far too early and the Models tab shows a misleading limit. Public model catalogues already describe these sizes, and MauzCode already downloads one of them (models.dev) for prices.

## What Changes

- Add two public model catalogues as context-limit sources between provider metadata and the 200,000 fallback: the cached models.dev snapshot (`limit.context`, `limit.output`), then the bundled `@earendil-works/pi-ai` model catalogue (`contextWindow`, `maxTokens`).
- New precedence: owner override → provider listing → models.dev → pi-ai → 200,000. The effective limit reports a new source `catalog` and the catalogue value.
- Providers may declare which catalogue sections describe their models (`inference.catalog`, e.g. Z.ai Coding Plan uses models.dev `zai-coding-plan` then `zai`, and pi-ai `zai`); otherwise the price vendor is used. Providers without either get no catalogue lookup.
- Route resolution also fills the output limit from the catalogue when the provider gives none.
- Route resolution stays free of provider requests: it reads only the cached models.dev snapshot (starting a background refresh when it is empty) and the bundled pi-ai data.
- Models tab shows the source "Catalog" for catalogue-derived limits.
- New runtime dependency `@earendil-works/pi-ai` (pinned), used only for its static model data.

## Capabilities

### New Capabilities
- `model-context-catalogs`: catalogue-derived context and output limits, their sources, order and offline behaviour.

### Modified Capabilities
- `model-routing`: route resolution reports catalogue-derived context and output limits.
- `llm-provider-sdk`: provider inference descriptors may name catalogue sections.

## Impact

- `src/models/catalog/` (`contextLimit`, `priceCatalog`, new `catalogLimits`, `setContextLimits`), `src/models/inference/resolveRoute.ts`, `src/models/api.ts`, `src/models/ContextLimit.ts`, `src/models/ProviderDefinition.ts`, `src/models/$modelProvider_zai-coding.ts`.
- `frontend/src/lib/modelConnections.ts`, `frontend/src/components/settings/ModelsPanel.tsx`.
- `package.json`/`bun.lock`: `@earendil-works/pi-ai@1.5.2`.
- Owner overrides, provider metadata and the 200,000 fallback keep their meaning; no upstream request body changes.
