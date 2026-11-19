# Proposal

## Why

A generic voice-provider failure protects sensitive data but gives the owner no way to distinguish a timeout from rejected credentials. A short-lived diagnostic record can explain future failures without storing conversations.

## What Changes

- Show a short reference beside a live dictation provider error when a diagnostic record was saved.
- Let the owner look up the reference in Settings → Voice → Errors, including failure time, stage, provider, model and a known safe cause when available.
- Store only allowlisted metadata and automatically delete records after seven days. Do not backfill historical failures.

## Capabilities

### New Capabilities
- `voice-error-journal`: privacy-preserving recording, lookup and expiry of live voice-provider failures.

### Modified Capabilities

## Impact

Touches the voice adapter and session error path, persistent storage and cleanup, the voice settings API and UI, and both dictation entry points. Existing public error codes remain unchanged; provider payloads are not exposed.
