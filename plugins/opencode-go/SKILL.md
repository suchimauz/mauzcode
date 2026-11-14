---
name: opencode-go
description: "OpenCode Go subscription as a Models provider. Use when the owner wants to connect OpenCode Go models (GLM, Kimi, Qwen, DeepSeek, MiniMax, GPT Luna, Claude Haiku, Gemini) to agents through Models connections."
---

# OpenCode Go

Registers model provider `opencode-go`. Create a connection in Models with the Console API key (secret field `apiKey`); pick a direct, SOCKS or SSH-tunnel transport. Agents then use routes `opencode-go/<account>:<model-id>`.

- Discovery: `GET https://opencode.ai/inference/go/v1/models` — only tool-capable chat models. Each model keeps its native API (Chat Completions, Responses, Anthropic Messages, Gemini); the core streams through the matching shared protocol via the SDK `route` contract. Uncached models use Chat Completions (Console translates).
- Reasoning: levels come only from discovery metadata; `none`→off, `max`→xhigh when xhigh is absent, Anthropic toggle → thinking disabled for off. Auto without a reported default sends nothing.
- Every request carries `Authorization: Bearer`, `user-agent: MauzCode/opencode-go` and `x-opencode-session` = the agent session id.
- Usage: `GET /inference/go/v1/usage` → 5h / weekly / monthly used percent with reset times. The connection test performs the same read (401/403 → unauthorized).
- Prices: models.dev vendor `opencode-go`.
- Go only: no fallback to pay-as-you-go `/inference` or other providers. Use only through `models.*` facade functions; plugin functions are adapters for the provider declaration.
