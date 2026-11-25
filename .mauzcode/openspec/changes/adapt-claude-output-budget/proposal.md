# Proposal

## Why

Claude subscription requests default to 16,384 output tokens even when the model supports 128,000. A long reasoning or writing turn can stop before it produces a usable tool call, leaving the user to ask the agent to continue.

## What Changes

- Choose a default output budget by Claude model. Start current catalogue models at 128,000; use 64,000 for unrecognized IDs. Honor explicit caller limits.
- Step down through smaller limits only when the API rejects the automatic budget as too large. Do not retry an accepted stream on this path.
- For Claude agent replies cut off before a tool call, request a shorter reply at most twice without publishing partial output as a final answer. Keep the prohibition on executing truncated tool batches.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `llm-claude-provider`: model-aware default budgets, safe negotiation and bounded recovery for truncated Claude agent replies.

## Impact

Claude subscription streaming and the Claude-specific branch of the agent loop. No changes to native compaction, provider-neutral sampling contracts, other providers, UI settings or persistent storage.
