# Proposal

## Why

An API-key Gemini connection does not represent the models or quota of an Antigravity account. We want a separate Models provider that follows the useful part of the OpenCode adapter: one signed-in account, its Gemini catalogue, and streamed turns including tool calls.

## What Changes

- Add a distinct `antigravity` provider with a connection-scoped Google sign-in lifecycle, account project discovery and a Gemini-only model catalogue. Do not revive or migrate the removed `gemini` provider.
- Adapt Antigravity's request and response envelopes to the existing Gemini message, tool and stream handling. Keep ordinary Gemini API-key connections unchanged.
- Use the Antigravity client identity expected by this flow, not a newly registered MauzCode OAuth application. Like the Claude provider, keep its public client ID and client secret as provider constants with environment overrides. The provider stays opt-in: nothing is contacted until the owner creates a connection and signs in. Test against synthetic fixtures.
- Support sign-in when the browser runs on a different machine than the server, by pasting the returned redirect address into the Models login panel.
- Take model limits and reasoning levels from the account's inventory, and map authentication, access, quota and stream failures to distinct, non-substituting outcomes.
- Document that Google disallows third-party access using a personal Antigravity login and may suspend the account. The owner accepts this risk; a working adapter does not confer permission.
- Exclude Claude, account pools, account or quota switching, Gemini CLI fallback, fingerprint emulation, and a separate quota dashboard.

## Capabilities

### New Capabilities
- `llm-antigravity-provider`: single-account Antigravity connection, authorized sign-in, account-specific Gemini discovery, wrapped streaming and failure handling.

### Modified Capabilities

## Impact

Adds a Models provider declaration, provider-owned operations, existing Models login panel integration, offline fixtures, tests and operator documentation. Uses the existing Models transport, connection secret store, call retry policy and Gemini codec. No new public SDK protocol, database migration, OpenCode runtime dependency or change to existing routes is intended.
