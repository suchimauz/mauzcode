## Why

After the runtime moved to `models.*`, only Codex models show human-readable names (the Codex API returns `display_name`); Claude and custom connections show raw ids such as `claude-opus-4-5` or `gemma4-26b`. Provider marks also come from three different sources, so the quota cards in the navigation show declared Lucide glyphs (sparkles, bot) while pickers and chats show brand logos.

## What Changes

- Add one display-name resolver for model routes: the provider catalogue label first, then the cached models.dev catalogue (provider price vendor, then any vendor), then a deterministic prettified id. Every model picker, chat list, chat header and new-session projection uses it.
- Add one provider/model mark resolver: a brand recognised from the model id first (OpenAI, Anthropic, Google, Qwen, Meta, Mistral, DeepSeek, xAI, Kimi), then the connection provider brand (claude → Anthropic, codex → OpenAI), then a generic plug for custom or unknown providers.
- Route the quota cards, provider icon endpoint, Models settings logos, navigation and picker icons through that resolver so the same model or provider always gets the same mark.
- The model logo now matches brands by the model id instead of substrings anywhere in the route, so `custom/…:claude-x` is Anthropic and `custom/…:gemma…` is Google.

## Capabilities

### New Capabilities
- `model-presentation`: human-readable model names and unified model/provider marks shown across MauzCode UI surfaces.

### Modified Capabilities
- `model-defaults-and-pricing`: "Provider icons from declarations" changes — provider marks come from the shared brand resolver; declared icons are only the fallback.
- `models-module-boundaries`: "Stable public model facade" — adds `models.displayNames` as a facade entry so UI projections outside `src/models` can resolve names.
- `models-settings-ui`: "Provider logos" — custom connections get the generic plug from the server rather than a client-only exception.

## Impact

- Backend: new `models.catalog.displayNames` with facade `models.displayNames`, `frontendBridge.modelMark`; changes to `frontendBridge.modelCatalogue`, `modelData`, `newSession`, `chatHeader`, `navigationData`, `iconData`, `providerIcons`, `models.api`, `ui.modelLogo`, `/api/v1/quotas`.
- Frontend: `useQuotas` prefers the server-provided icon; `ProviderLogo` keeps null compatibility.
- No routing, storage or API shape changes; names and marks are display-only. Network: reuses the existing hourly models.dev snapshot (no new fetch).
