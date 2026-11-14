import { describe, expect, test } from "bun:test";
import { mkTestCtx } from "../src/_testCtx.entry";
import claude from "../src/models/$modelProvider_claude";
import oldAnthropic from "../src/llm/toAnthropicMessages";
import newAnthropic from "../src/models/protocol/anthropic/toAnthropicMessages";
import oldOpenAI from "../src/llm/toOpenAIMessages";
import newOpenAI from "../src/models/protocol/openaiChat/toOpenAIMessages";
import oldGemini from "../src/llm/toGeminiContents";
import newGemini from "../src/models/protocol/gemini/toGeminiContents";
import oldReasoning from "../src/llm/resolveReasoningEffort";
import oldCapabilities from "../src/llm/reasoningCapabilities";
import newReasoning from "../src/models/inference/resolveReasoningEffort";
import oldFailure from "../src/llm/classifyError";
import newFailure from "../src/models/provider/claude/classifyError";

const IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";
const req = { model: "claude-sonnet-4-6", instructions: "Follow instructions", messages: [{ role: "user", content: "Hi" }], sessionId: "session" };
const frames = (events: object[]) => new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(""));
const end = () => frames([{ type: "message_stop" }]);
type Call = { url: string; init: RequestInit };
async function setup(handler: (call: Call) => Response = end) {
    const ctx = await mkTestCtx({ env: {} });
    const calls: Call[] = []; let marked = false;
    ctx.state.registry.models.provider.claude.claudeAuth = async (_c: unknown, _s: unknown, o: { op: string }) => { if (o.op === "markLogin") marked = true; return { loggedIn: true, needsLogin: false, accessToken: "test-token", expiresAt: null }; };
    ctx.state.registry.llm.claudeCodeCliVersion = async () => "2.0.0";
    ctx.state.registry.models.provider.claude.claudeCodeCliVersion = async () => "2.0.0";
    const conn: types.models.ResolvedConnection = { id: crypto.randomUUID(), provider: "claude", accountName: "me", config: {}, secret: async () => null, fetch: async (url, init = {}) => { const c = { url, init }; calls.push(c); return handler(c); } };
    return { ctx, conn, calls, marked: () => marked };
}


// Temporary migration oracle: retire with the legacy runtime in block 8.
// Durable standalone wire assertions remain in src/models/claudeProtocol.test.ts.
describe("models / legacy Claude wire parity", () => {
    test("converter corpus preserves byte output and failures", async () => {
        const ctx = {} as Context;
        const transcripts = [[], [{ role: "user", content: "hi" }, { role: "assistant", content: "reply  " }], [{ role: "user", content: [{ type: "image", mimeType: "image/png", data: "AQ==" }] }], [{ role: "assistant", tool_calls: [{ id: "t", name: "read", args: { path: "x" }, thoughtSignature: "signed" }] }, { role: "tool", tool_call_id: "t", content: "result" }], [{ role: "user", content: null }], [{ role: "system", content: "system" }]];
        const outcome = async (run: () => unknown) => { try { return { value: JSON.stringify(await run()) }; } catch (error) { return { error: (error as Error).message }; } };
        for (const messages of transcripts) {
            expect(await outcome(() => newAnthropic(ctx, null, { messages, cacheableMessageCount: 1 }))).toEqual(await outcome(() => oldAnthropic(ctx, null, { messages, cacheableMessageCount: 1 })));
            expect(await outcome(() => newOpenAI(ctx, null, { messages }))).toEqual(await outcome(() => oldOpenAI(ctx, null, { messages })));
            expect(await outcome(() => newGemini(ctx, null, { messages }))).toEqual(await outcome(() => oldGemini(ctx, null, { messages })));
        }
    });
    test("all Claude model families and efforts match legacy reasoning including reasons", async () => {
        const ctx = { fns: { llm: { reasoningCapabilities: (opts: { model: string }) => oldCapabilities(ctx as Context, null, opts) } } } as unknown as Context;
        for (const model of ["claude-opus-5", "claude-sonnet-5", "claude-opus-4-6", "claude-sonnet-4-6", "claude-opus-4-5", "claude-haiku-4-5", "unknown"]) for (const effort of ["auto", "off", "minimal", "low", "medium", "high", "xhigh"] as const) {
            const old = await oldReasoning(ctx, null, { model: `anthropic-oauth:${model}`, effort });
            const next = await newReasoning({} as Context, null, { model, effort });
            expect(next).toEqual({ ...old, reason: old.reason?.replace(`anthropic-oauth:${model}`, model) ?? null });
        }
    });
    test("Claude HTTP classification matches legacy subset, including reset and retry headers", () => {
        const ctx = {} as Context;
        for (const status of [0, 400, 401, 403, 408, 413, 429, 500, 503]) for (const body of ["bad input", "", "empty_response", "upstream timeout", "insufficient_quota", '{"error":{"type":"usage_limit_reached","resets_in_seconds":30}}', '{"error":{"type":"rate_limit_error"}}']) {
            const opts = { status, body, now: 1000, headers: { "Retry-After": "3", "Anthropic-Ratelimit-Unified-5h-Reset": "2000" } };
            expect(newFailure(ctx, null, opts)).toEqual(oldFailure(ctx, null, { ...opts, provider: "anthropic-oauth", kind: "subscription" }));
        }
    });
    test("byte parity with legacy stream and compact", async () => {
        const { ctx, conn, calls } = await setup();
        const captured: RequestInit[] = [];
        ctx.state.registry.llm.resolveEndpoint = async () => ({ api: "anthropic", provider: "anthropic-oauth", kind: "subscription", modelId: req.model, url: "https://api.anthropic.com/v1/messages", apiKey: "test-token", account: "me", noFallback: true });
        ctx.state.registry.llm.getAnthropicOAuthToken = async () => "test-token";
        ctx.state.registry.agent.buildLlmRequest = async () => ({ system: IDENTITY, messages: [{ role: "user", content: req.instructions }, { role: "assistant", content: "Understood. Ready to act." }, ...req.messages], cacheableMessageCount: 3 });
        ctx.state.registry.agent.wireTools = () => [];
        ctx.state.registry.llm.recordUsage = async () => undefined;
        ctx.state.registry.llm.claudeFetch = async (_c: unknown, _s: unknown, o: { init: RequestInit }) => { captured.push(o.init); return end(); };
        await claude.stream(ctx, conn, req);
        await ctx.fns.llm.streamAnthropic({ agent: { model: `anthropic-oauth:${req.model}`, reasoningEffort: "auto" } as types.agent.Agent });
        const normalizedHeaders = (h: RequestInit["headers"]) => { const v = new Headers(h); v.delete("x-client-request-id"); return Object.fromEntries(v.entries()); };
        expect(calls[0]!.init.body).toBe(captured[0]!.body); expect(normalizedHeaders(calls[0]!.init.headers)).toEqual(normalizedHeaders(captured[0]!.headers));
        const compactResponse = () => Response.json({ content: [{ type: "compaction", content: "summary", signature: "sig" }] });
        conn.fetch = async (_url, init = {}) => { calls.push({ url: _url, init }); return compactResponse(); };
        ctx.state.registry.llm.claudeFetch = async (_c: unknown, _s: unknown, o: { init: RequestInit }) => { captured.push(o.init); return compactResponse(); };
        await claude.compact(ctx, conn, { ...req, focus: "paths", maxTokens: 1000 });
        await ctx.fns.llm.compactAnthropic({ model: `anthropic-oauth:${req.model}`, instructions: req.instructions, messages: req.messages, focus: "paths", maxTokens: 1000 });
        expect(calls[1]!.init.body).toBe(captured[1]!.body); expect(normalizedHeaders(calls[1]!.init.headers)).toEqual(normalizedHeaders(captured[1]!.headers));
    });
});
