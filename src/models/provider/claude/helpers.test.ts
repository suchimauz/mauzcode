import { expect, test } from "bun:test";
import classify from "./classifyError";
import constants from "./anthropicOAuthConstants";
import parse from "./parseAnthropicAuthorizationInput";
const ctx = { env: {} } as Context;
test("Claude HTTP failure categories and subscription timing remain stable", () => {
    for (const [status, body, code, retryable] of [[401, "bad", "AUTH", false], [403, "bad", "AUTH", false], [429, '{"error":{"type":"rate_limit_error"}}', "RATE_LIMIT", true], [413, "large", "OVERFLOW", false], [500, "oops", "SERVER", true], [408, "timeout", "TIMEOUT", true], [400, "insufficient_quota", "QUOTA", false], [400, "empty_response", "EMPTY_RESPONSE", true], [400, "bad input", "FATAL", false]] as const) {
        expect(classify(ctx, null, { status, body, now: 1000 })).toMatchObject({ code, retryable, provider: "anthropic-oauth", account: "default" });
    }
    expect(classify(ctx, null, { status: 429, body: '{"error":{"type":"usage_limit_reached"}}', headers: { "Anthropic-Ratelimit-Unified-5h-Reset": "2000" }, now: 1000 })).toMatchObject({ code: "USAGE_LIMIT", retryable: false, resetsAt: 2000000 });
    expect(classify(ctx, null, { status: 429, body: "usage limit reached", now: 1000 })).toMatchObject({ code: "USAGE_LIMIT", resetsAt: null });
    expect(classify(ctx, null, { status: 429, headers: new Headers({ "retry-after": "2.5" }), now: 1000 })).toMatchObject({ code: "RATE_LIMIT", retryAfterMs: 2500 });
    expect(classify(ctx, null, { status: 429, headers: { "Retry-After": new Date(5000).toUTCString() }, now: 1000 })).toMatchObject({ retryAfterMs: 4000 });
    expect(classify(ctx, null, { body: "x".repeat(3000) }).raw).toHaveLength(2000);
});
test("OAuth defaults and explicit overrides remain provider-local", () => {
    expect(constants(ctx, null, {})).toMatchObject({ clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e", authorizeUrl: "https://claude.ai/oauth/authorize", tokenUrl: "https://platform.claude.com/v1/oauth/token", redirectUri: "http://localhost:53692/callback" });
    const overridden = { env: { ANTHROPIC_OAUTH_CLIENT_ID: "id", ANTHROPIC_OAUTH_AUTHORIZE_URL: "https://auth.invalid", ANTHROPIC_OAUTH_TOKEN_URL: "https://token.invalid", ANTHROPIC_OAUTH_REDIRECT_URI: "http://localhost:1/callback" } } as unknown as Context;
    expect(constants(overridden, null, {})).toMatchObject({ clientId: "id", authorizeUrl: "https://auth.invalid", tokenUrl: "https://token.invalid", redirectUri: "http://localhost:1/callback" });
});
test("OAuth parser accepts callback URL, code#state, plain code and blank input", () => {
    for (const [input, output] of [["", { code: null, state: null }], [" abc ", { code: "abc", state: null }], ["abc#state", { code: "abc", state: "state" }], ["http://localhost/callback?code=a%2Bb&state=s", { code: "a+b", state: "s" }]] as const) expect(parse(ctx, null, { input })).toEqual(output);
});
