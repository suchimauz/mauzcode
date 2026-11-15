# Proposal

## Why

OpenAI-compatible gateways such as One API may omit context limits from their model catalogue. MauzCode then uses its documented 200,000-token fallback, which need not match the upstream deployment. Owners need an explicit per-model setting rather than a guessed global limit. This does not establish that context overflow caused any particular HTTP 400.

## What Changes

- Add owner-managed context-window overrides for an exact model ID on an individual connection.
- Resolve limits as owner override, then provider metadata, then the existing 200,000-token fallback; expose the value and its source.
- Provide an accessible numeric editor, explicit Save and reset-to-default behavior in Models.
- Preserve overrides independently of catalogue refreshes and apply effective limits to existing context budgeting and compaction consumers.
- Keep automatic compaction percentages, absolute thresholds, native compaction and upstream request parameters unchanged.

## Capabilities

### New Capabilities

- `model-context-limits`: Durable per-connection model overrides, validation, precedence, provenance and lifecycle.

### Modified Capabilities

- `models-settings-ui`: Context-limit editing and display without accidental availability toggles or discarded drafts.
- `agent-model-inference`: Compaction uses the resolved effective context limit rather than provider catalogue metadata alone.

## Impact

Models storage and migration, owner-authorized Models API/public types, route resolution, context-budget consumers, React Models panel and regression tests. Existing model-routing and llm-model-cache guarantees remain intact: no network discovery during route resolution and no owner values written into the provider cache. Active changes `restore-model-retry-policy` and `edit-new-session-title-in-header` address separate behavior; this change does not modify retry classification or session titles.

This delivery contains specification artifacts only. It does not implement tasks, infer a limit for Qwen, change the global fallback, replay requests, retain upstream error bodies, or add gateway limit discovery.
