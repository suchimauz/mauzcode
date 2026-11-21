# Proposal

## Why

Users with a Google account (free Gemini Code Assist tier or a Google AI subscription) cannot use Gemini models in MauzCode without an API key, while Gemini CLI offers exactly this through Google sign-in and the Code Assist API. A built-in provider gives the same access and reuses the existing `gemini` protocol code. It also fixes a gap in that protocol: tool calls lose their `thoughtSignature`, which breaks tool loops on Gemini 3 models.

## What Changes

- New built-in model provider `gemini` ("Gemini (Google account)") in the Models module, not a plugin. Connections have no credential fields and allow the direct, SOCKS and SSH tunnel transports.
- Google OAuth 2.0 authorization-code login with PKCE, using Gemini CLI's public installed-app client: a link with a paste-the-code fallback (`https://codeassist.google.com/authcode`) plus an optional loopback callback on `127.0.0.1` for a browser on the same machine, shown as a second link through a new optional `LoginFlow.callbackAuthorizationUrl`. Encrypted token storage, refresh, logout and revocation.
- Automatic Code Assist setup after login: `loadCodeAssist` and, when needed, `onboardUser` to the default tier with a managed project. There is no manual project field. Accounts that need their own Google Cloud project get a clear error.
- Inference through the Code Assist API (`https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent`), whose request and response wrap the Gemini `generateContent` shapes. Streaming reuses the shared Gemini conversion and parsing.
- Reasoning: `thinkingLevel` for Gemini 3 models and `thinkingBudget` for Gemini 2.5 models, with thought summaries streamed as thinking.
- A static, versioned model list that matches Gemini CLI's supported models. Limits come from the public `google` catalogue.
- Per-model quota on the usage card from `retrieveUserQuota`, plus exact token counting through `countTokens`.
- Provider failure classification for quota, rate limit, plan/permission and unknown-model errors.
- Shared `gemini` protocol: the stream keeps each function call's `thoughtSignature` on the returned tool call, so the stored transcript sends it back on the next turn.

## Capabilities

### New Capabilities
- `llm-gemini-code-assist-provider`: covers the built-in Gemini Google-account provider: OAuth login through the connection transport, token storage and refresh, Code Assist onboarding, model list, streaming inference, reasoning, quota usage, token counting, failures and connection test.

### Modified Capabilities
- `llm-model-protocols`: the shared `gemini` protocol now returns each streamed function call's `thoughtSignature` on its tool call, and that signature is replayed on later turns.

## Impact

- New `src/models/$modelProvider_gemini.ts` and helpers in `src/models/provider/gemini/` (namespace `models.provider.gemini`).
- `src/models/protocol/gemini/`: shared SSE reading extracted for reuse by the provider. The stream returns `thoughtSignature`. `StreamResult.toolCalls` gains an optional `thoughtSignature` field.
- `LoginFlow` gains optional `callbackAuthorizationUrl`; `frontend/src/components/settings/ModelsPanel.tsx` shows it as a same-machine login link.
- New encrypted local secret per connection (`models/<id>.gemini-auth`). No database migration.
- Outbound endpoints: `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com/oauth2/v2/userinfo`, `cloudcode-pa.googleapis.com`. The Code Assist API and Gemini CLI's client id are unofficial for third-party use and may change, and Google may limit or block accounts used this way. The provider description and the docs will state this and advise a non-critical Google account.
- Docs: new section in `docs/models-providers.md`. Tests use mocked fetch only.
