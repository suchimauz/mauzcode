## Why

OpenCode Go is a subscription that serves many open and proprietary coding models through one key, but MauzCode's Models stack cannot connect to it: a provider can only stream through its own code, plugins cannot reach the shared wire protocols, and the protocols do not send reasoning settings. Adding it cleanly needs small generic SDK extensions so any multi-protocol provider can be declared from a plugin without core vendor code.

## What Changes

- Provider SDK: a provider MAY declare a per-model **protocol route** (shared protocol id, base URL, headers) instead of a stream operation; the core then streams through the selected shared protocol over the connection's transport.
- Model metadata MAY carry the model's native shared protocol and native reasoning wire values (`wire`, `disable`); the reasoning default becomes optional, and an auto preference without a default applies `auto`, meaning no reasoning setting is sent.
- Shared protocols send normalized reasoning in their native fields when the request carries SDK reasoning; requests without it are unchanged.
- The model cache keeps the protocol and the reasoning wire metadata.
- New official optional plugin `opencode-go` declares provider `opencode-go`: API key, model discovery from `/inference/go/v1/models`, per-model native routing, usage windows from `/inference/go/v1/usage`, connection test, `opencode-go` price vendor.
- No change to the public `models` facade, existing providers, legacy OpenCode code or SSH provider code.

## Capabilities

### New Capabilities
- `llm-opencode-go-provider`: OpenCode Go connections — authentication, discovery, routing, session identity, reasoning metadata, usage and test behavior.

### Modified Capabilities
- `llm-provider-sdk`: protocol-route providers; optional reasoning default and native wire metadata.
- `llm-model-protocols`: reasoning on the wire; endpoints supplied by protocol-route providers.
- `llm-model-cache`: cached model metadata includes protocol and reasoning wire values.
- `models-module-boundaries`: plugin providers reach shared protocols only through the SDK route contract.

## Impact

- Core: `src/models` types (`ProviderDefinition`, `ModelInfo`, `ReasoningCapabilities`, `ReasoningResolution`, new `ProtocolRoute`), provider loader, `inference/stream`, `inference/resolveReasoning`, `catalog/listModels`, four protocol stream implementations; `frontendBridge.modelEffort` for an optional default.
- New plugin `plugins/opencode-go`.
- External: HTTPS to `opencode.ai` only through the connection's saved transport.
