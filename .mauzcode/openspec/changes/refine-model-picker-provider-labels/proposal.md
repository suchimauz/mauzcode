# Proposal

## Why

Disabled models clutter model selection even though they cannot be chosen. Account-only group headings and model-only chat captions make it difficult to distinguish routes offered by different providers.

## What Changes

- Hide disabled models and models belonging to disabled connections in every model picker; omit empty groups.
- Label connection groups with both provider and connection/account name, preserving connection identity and SSH context.
- Show the selected model's provider alongside its human-readable name in the chat model control.
- Keep disabled entries visible and manageable in Models settings, and retain server-side availability enforcement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `llm-model-availability`: require disabled choices to be hidden rather than merely marked in model pickers.
- `models-settings-ui`: require provider-and-account group headings in all model selection surfaces.
- `model-presentation`: require a visible provider caption for the chat's selected model.

## Impact

Expected implementation touchpoints are the shared React model helpers and ModelPicker used by chat and new-session surfaces, plus model picker/group/header tests. Review model API projections only if provider metadata is missing. No routing format, database migration, provider integration, pricing, or Models settings enable/disable control changes are intended.
