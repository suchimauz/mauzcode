import { expect, test } from "bun:test";
import leafVersion from "./codexVersion";
import leafProfile from "./codexReasoningProfile";
import leafQuota from "./codexQuota";
import leafFailure from "./codexFailure";
import leafInput from "./codexInput";

// Static expected values characterized from the former root implementations.
const sentinel = new Error("safe input failure");
let failureOptions: Record<string, unknown> | undefined;
const ctx = { fns: { models: {
    inference: { failure: (opts: Record<string, unknown>) => { failureOptions = opts; return sentinel; } },
    provider: { codex: {
        codexVersion: (opts: Parameters<typeof leafVersion>[2]) => leafVersion(ctx, null, opts),
        codexReasoningProfile: (opts: Parameters<typeof leafProfile>[2]) => leafProfile(ctx, null, opts),
        codexQuota: (opts: Parameters<typeof leafQuota>[2]) => leafQuota(ctx, null, opts),
        codexFailure: (opts: Parameters<typeof leafFailure>[2]) => leafFailure(ctx, null, opts),
        codexInput: (opts: Parameters<typeof leafInput>[2]) => leafInput(ctx, null, opts),
    } },
} } } as unknown as Context;

for (const [label, version, profile, quota, failure, input] of [
    ["leaf", leafVersion, leafProfile, leafQuota, leafFailure, leafInput],
] as const) {
    test(`${label}: version validation and reasoning boundaries preserve fixed contracts`, () => {
        for (const value of [null, "", "bad version", "x".repeat(41), "\r\nInjected: yes"])
            expect(version(ctx, null, { config: { clientVersion: value } })).toBe("0.157.1");
        expect(version(ctx, null, { config: { clientVersion: " 0.160.2+custom " } })).toBe("0.160.2+custom");
        expect(profile(ctx, null, { model: "gpt-6" })).toEqual({ supported: ["low", "medium", "high", "xhigh"], default: "medium", source: "profile", profile: "codex-2026-07" });
        expect(profile(ctx, null, { model: "gpt-5.1-codex" })?.supported).toEqual(["off", "minimal", "low", "medium", "high"]);
        expect(profile(ctx, null, { model: "codex-max" })?.supported).toEqual(["off", "minimal", "low", "medium", "high", "xhigh"]);
        for (const model of ["gpt-60", "gpt-50", "unknown", "GPT-6"]) expect(profile(ctx, null, { model })).toBeNull();
    });

    test(`${label}: quota precedence, clamps and units`, () => {
        const headers = new Headers({ "x-codex-primary-used-percent": "105", "x-codex-primary-window-minutes": "300", "x-codex-primary-reset-at": "42" });
        expect(quota(ctx, null, { headers })).toEqual({ source: "headers", windows: [{ name: "primary", usedPercent: 100, windowMinutes: 300, resetAt: 42000 }] });
        expect(quota(ctx, null, { headers, rateLimits: { secondary: { used_percent: -2, window_minutes: 0, resets_at: 9 } } })).toEqual({ source: "stream", windows: [{ name: "secondary", usedPercent: 0, resetAt: 9000 }] });
        expect(quota(ctx, null, { headers, rateLimits: { primary: { used_percent: "invalid" } } })).toEqual(quota(ctx, null, { headers }));
        expect(quota(ctx, null, { headers: new Headers() })).toBeNull();
        expect(quota(ctx, null, {})).toBeNull();
    });

    test(`${label}: failure classification, retry timing and secret-safe messages`, () => {
        expect(failure(ctx, null, { phase: "http", status: 401, error: { message: "secret-token" }, now: 1000 })).toEqual({ status: 409, message: "Codex login required: the backend rejected the access token", info: { code: "LOGIN_REQUIRED", classification: "auth", retryable: false, upstreamStatus: 401, acceptance: "rejected", replaySafe: true } });
        const throttled = failure(ctx, null, { phase: "stream", status: 429, retryAfter: "2", now: 1000 });
        expect(throttled.info).toEqual({ code: "RATE_LIMITED", classification: "throttled", retryable: true, retryAfterMs: 2000, upstreamStatus: 429, acceptance: "accepted", replaySafe: false });
        expect(failure(ctx, null, { phase: "http", status: 429, error: { code: "quota_exceeded", resets_at: 5 }, retryAfter: "99", now: 1000 }).info).toEqual({ code: "QUOTA_EXHAUSTED", classification: "quota", retryable: false, retryAfterMs: 4000, resetAt: 5000, upstreamStatus: 429, acceptance: "rejected", replaySafe: true });
        expect(failure(ctx, null, { phase: "http", status: 503 }).info.classification).toBe("provider");
        expect(failure(ctx, null, { phase: "http", status: 400, error: { code: "secret-token", message: "secret-token" } }).message).toBe("Codex rejected the request (HTTP 400)");
    });

    test(`${label}: input ordering, tool arguments, checkpoint and failure callback identity`, () => {
        expect(input(ctx, null, { messages: [
            { role: "system", content: "old" }, { role: "system", content: "current" },
            { role: "user", content: "hello" },
            { role: "assistant", content: "working", tool_calls: [{ id: "call", name: "lookup", args: { q: 1 } }] },
            { role: "tool", tool_call_id: "call", content: "result" },
            { type: "checkpoint", checkpoint: { payload: { type: "compaction", id: "cp", encrypted_content: "opaque" } } },
        ] })).toEqual({ instructions: "current", input: [
            { type: "message", role: "user", content: [{ type: "input_text", text: "hello" }] },
            { type: "message", role: "assistant", content: [{ type: "output_text", text: "working" }] },
            { type: "function_call", call_id: "call", name: "lookup", arguments: '{"q":1}' },
            { type: "function_call_output", call_id: "call", output: "result" },
            { type: "compaction", id: "cp", encrypted_content: "opaque" },
        ] });
        for (const message of [{ type: "checkpoint", checkpoint: { payload: { encrypted_content: "do-not-echo" } } }, { message_type: "codex_compaction", content: "do-not-echo" }]) {
            failureOptions = undefined;
            let caught: unknown;
            try { input(ctx, null, { messages: [message] }); } catch (error) { caught = error; }
            expect(caught).toBe(sentinel);
            expect((failureOptions as Record<string, unknown> | undefined)?.status).toBe(400);
            expect((failureOptions as Record<string, unknown> | undefined)?.info).toEqual({ code: "INVALID_INPUT", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true });
            expect(JSON.stringify(failureOptions)).not.toContain("do-not-echo");
        }
    });
}
