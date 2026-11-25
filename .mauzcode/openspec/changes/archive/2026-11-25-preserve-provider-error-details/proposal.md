# Proposal

## Why

An Antigravity generation failed with only `Antigravity request failed (HTTP 400)` in the agent's history. A status tells the operator that a request failed, not what the provider said was wrong. Special-casing Antigravity 403 leaves other statuses and providers with the same problem.

## What Changes

- Preserve a bounded, redacted diagnostic from failed agent model calls across providers and protocols, including plugin and custom inference paths. Show the provider, HTTP status if known, and the actual upstream code/reason and wording when safely available.
- Distinguish a rejection before streaming, a provider error inside an accepted stream, and a transport failure with no provider response. Do not invent an upstream explanation.
- Keep terminal diagnostics in the affected run's history across reloads and subsequent turns. No raw-body logging, changes to retry policy or backfill of previously discarded responses.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-model-inference`: Make terminal model-call errors actionable and durable for the owner of the affected run, independently of provider or transport.

## Impact

Shared protocol HTTP and stream decoders, standalone provider and plugin adapters, SDK failure propagation, and the existing agent error history/readback. No external dependency or provider-account action is required. Authentication setup, catalogue probes and unrelated runtime errors are outside the agent inference scope.
