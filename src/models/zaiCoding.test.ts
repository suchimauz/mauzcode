import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import provider from "./$modelProvider_zai-coding";
import streamRoute from "./inference/streamRoute";
import resolveReasoning from "./inference/resolveReasoning";

let ctx: Context;
beforeAll(async () => { ctx = await mkTestCtx(); }, 120000);

const KEY = "zai-test-only-key";
type Call = { url: string; method: string; headers: Headers; body: any };

/** Connection fixture: every request goes through conn.fetch and is answered by `reply`. */
function conn(protocol: "openai-chat" | "anthropic", reply: (c: Call) => Response, key: string | null = KEY) {
    const calls: Call[] = [];
    const c: types.models.ResolvedConnection = {
        id: "zai", provider: "zai-coding", accountName: "plan", config: { protocol },
        secret: async name => name === "apiKey" ? key : null,
        fetch: async (url, init) => {
            const call = { url: String(url), method: init?.method ?? "GET", headers: new Headers(init?.headers), body: typeof init?.body === "string" ? JSON.parse(init.body) : null };
            calls.push(call);
            return reply(call);
        },
    };
    return { conn: c, calls };
}

const quota = (limits: unknown[], level: unknown = "pro") => Response.json({ success: true, code: 200, data: { level, limits } });
const fiveHour = { type: "CREDIT_LIMIT", unit: 3, number: 5, percentage: 42, nextResetTime: 1900000000000 };
const weekly = { type: "CREDIT_LIMIT", unit: 6, number: 1, percentage: 7 };
const sse = (chunks: unknown[]) => new Response(chunks.map(c => "data: " + JSON.stringify(c) + "\n\n").join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });

describe("zai-coding route and headers", () => {
    test("openai-chat uses the Coding Plan base with Bearer only", async () => {
        const { conn: c } = conn("openai-chat", () => new Response(null));
        const r = await provider.route(ctx, c, { model: "glm-4.7", info: null, sessionId: "s" });
        expect(r).toEqual({ protocol: "openai-chat", baseUrl: "https://api.z.ai/api/coding/paas/v4", headers: { authorization: "Bearer " + KEY } });
    });
    test("anthropic adds x-api-key and never thinking or replay", async () => {
        const { conn: c } = conn("anthropic", () => new Response(null));
        const reasoning = { requested: "high", applied: "high", fallbackReason: null, source: "metadata" } as types.models.ReasoningResolution;
        const r = await provider.route(ctx, c, { model: "glm-5.3", info: null, sessionId: "s", reasoning });
        expect(r).toEqual({ protocol: "anthropic", baseUrl: "https://api.z.ai/api/anthropic", headers: { authorization: "Bearer " + KEY, "x-api-key": KEY } });
    });
    test("GLM-5.3 on openai-chat with a concrete level asks for thinking and replay", async () => {
        const { conn: c } = conn("openai-chat", () => new Response(null));
        for (const model of ["glm-5.3", "glm-5.3-flash", "glm-5.3-flashx"]) {
            const reasoning = { requested: "high", applied: "high", fallbackReason: null, source: "metadata" } as types.models.ReasoningResolution;
            const r = await provider.route(ctx, c, { model, info: null, sessionId: "s", reasoning });
            expect(r.body).toEqual({ thinking: { type: "enabled" } });
            expect(r.replayReasoning).toBe(true);
        }
        for (const model of ["glm-5.3x", "glm-5.30", "glm-4.7"]) {
            const r = await provider.route(ctx, c, { model, info: null, sessionId: "s", reasoning: { requested: "high", applied: "high", fallbackReason: null, source: "metadata" } as types.models.ReasoningResolution });
            expect(r.body).toBeUndefined();
            expect(r.replayReasoning).toBeUndefined();
        }
    });
    test("missing key fails without any network request", async () => {
        const { conn: c, calls } = conn("openai-chat", () => new Response(null), null);
        await expect(provider.route(ctx, c, { model: "glm-5.3", info: null, sessionId: "s" })).rejects.toThrow("API key is not configured");
        await expect(provider.listModels!(ctx, c)).rejects.toThrow("API key is not configured");
        await expect(provider.usage!(ctx, c)).rejects.toThrow("API key is not configured");
        expect(calls).toHaveLength(0);
    });
});

describe("zai-coding discovery", () => {
    const catalogue = { data: [{ id: "glm-5.3" }, { id: "glm-4.7" }, { id: "glm-5.3" }, { id: "bad id/../x" }, { id: "" }, { id: 5 }, { id: "glm-5.3-flash" }] };
    test("openai-chat: catalogue order, duplicates and invalid ids dropped, GLM-5.3 reasoning attached", async () => {
        const { conn: c, calls } = conn("openai-chat", () => Response.json(catalogue));
        const models = await provider.listModels!(ctx, c);
        const levels = { supported: ["low", "high", "xhigh"], default: "xhigh", wire: { low: "low", high: "high", xhigh: "max" } };
        expect(models).toEqual([{ id: "glm-5.3", reasoning: levels }, { id: "glm-4.7" }, { id: "glm-5.3-flash", reasoning: levels }] as types.models.ModelInfo[]);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe("https://api.z.ai/api/coding/paas/v4/models");
        expect(calls[0]!.method).toBe("GET");
        expect(calls[0]!.headers.get("authorization")).toBe("Bearer " + KEY);
    });
    test("anthropic connections advertise no reasoning metadata", async () => {
        const { conn: c } = conn("anthropic", () => Response.json(catalogue));
        expect(await provider.listModels!(ctx, c)).toEqual([{ id: "glm-5.3" }, { id: "glm-4.7" }, { id: "glm-5.3-flash" }]);
    });
    test("HTTP error throws a safe message without key or body", async () => {
        const { conn: c } = conn("openai-chat", () => new Response("upstream secret body " + KEY, { status: 500 }));
        const error = await provider.listModels!(ctx, c).then(() => null, e => e);
        expect(String(error?.message)).toContain("500");
        expect(String(error?.message)).not.toContain(KEY);
        expect(String(error?.message)).not.toContain("upstream secret body");
    });
});

describe("zai-coding usage and test", () => {
    test("both windows and plan level", async () => {
        const { conn: c, calls } = conn("openai-chat", () => quota([fiveHour, weekly, { type: "TIME_LIMIT", unit: 5, number: 1, percentage: 3 }]));
        const report = await provider.usage!(ctx, c);
        expect(calls[0]!.url).toBe("https://api.z.ai/api/monitor/usage/quota/limit");
        expect(report.status).toBe("available");
        expect(report.plan).toBe("pro");
        expect(report.windows?.map(w => [w.id, w.period, w.scope, w.usedPercent, w.resetAt])).toEqual([
            ["zai-coding:five-hour", "fiveHour", "account", 42, 1900000000000],
            ["zai-coding:weekly", "weekly", "account", 7, undefined],
        ]);
    });
    test("unrecognized or out-of-range quota never becomes zero usage", async () => {
        for (const reply of [
            () => Response.json({ success: false, code: 500 }),
            () => quota([{ ...fiveHour, percentage: 140 }, { ...weekly, percentage: -1 }]),
            () => quota([{ ...fiveHour, unit: 9 }]),
            () => quota([{ ...fiveHour, percentage: "42" }]),
        ]) {
            const { conn: c } = conn("openai-chat", reply);
            await expect(provider.usage!(ctx, c)).rejects.toThrow();
        }
    });
    test("connection test classifies 200, 401 and other failures without leaking", async () => {
        const ok = await provider.test(ctx, conn("openai-chat", () => quota([fiveHour])).conn);
        expect(ok).toMatchObject({ status: "available", reason: "usage-ok" });
        for (const status of [401, 403]) {
            const r = await provider.test(ctx, conn("openai-chat", () => new Response("denied " + KEY, { status })).conn);
            expect(r).toMatchObject({ status: "unavailable", reason: "unauthorized" });
            expect(JSON.stringify(r)).not.toContain(KEY);
        }
        const failed = await provider.test(ctx, conn("openai-chat", () => new Response("boom " + KEY, { status: 502 })).conn);
        expect(failed).toMatchObject({ status: "unavailable", reason: "request-failed" });
        expect(JSON.stringify(failed)).not.toContain(KEY);
    });
});

describe("zai-coding reasoning", () => {
    const metadata = { supported: ["low", "high", "xhigh"], default: "xhigh", wire: { low: "low", high: "high", xhigh: "max" } } as types.models.ModelInfo["reasoning"];
    test("auto applies xhigh sent as max, medium falls back to low", () => {
        expect(resolveReasoning(ctx, null, { model: "glm-5.3", preference: "auto", metadata })).toMatchObject({ applied: "xhigh", wire: "max" });
        expect(resolveReasoning(ctx, null, { model: "glm-5.3", preference: "medium", metadata })).toMatchObject({ applied: "low", wire: "low" });
    });
    test("GLM-5.3 tool-call turn carries thinking, effort and replayed reasoning", async () => {
        const { conn: c, calls } = conn("openai-chat", () => sse([{ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }]));
        const definition = { ...provider } as types.models.ProviderDefinition;
        const reasoning = resolveReasoning(ctx, null, { model: "glm-5.3", preference: "auto", metadata });
        const messages = [
            { role: "user", content: "read it" },
            { role: "assistant", content: "", tool_calls: [{ id: "t1", name: "read", args: { p: 1 }, reasoning_content: "checked the file" }, { id: "t2", name: "read", args: {} }] },
            { role: "tool", tool_call_id: "t1", content: "a" },
            { role: "tool", tool_call_id: "t2", content: "b" },
        ];
        await streamRoute(ctx, null, { definition, conn: c, info: null, req: { model: "glm-5.3", sessionId: "s", instructions: "", messages, reasoning } });
        const body = calls[0]!.body;
        expect(calls[0]!.url).toBe("https://api.z.ai/api/coding/paas/v4/chat/completions");
        expect(body.thinking).toEqual({ type: "enabled" });
        expect(body.reasoning_effort).toBe("max");
        const assistant = body.messages.find((m: any) => m.role === "assistant");
        expect(assistant.reasoning_content).toBe("checked the file");
        expect(JSON.stringify(assistant.tool_calls)).not.toContain("reasoning_content");
    });
    test("model without reasoning metadata sends neither thinking nor replay", async () => {
        const { conn: c, calls } = conn("openai-chat", () => sse([{ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }]));
        const messages = [{ role: "assistant", content: "", tool_calls: [{ id: "t1", name: "read", args: {}, reasoning_content: "x" }] }, { role: "tool", tool_call_id: "t1", content: "a" }];
        await streamRoute(ctx, null, { definition: provider as types.models.ProviderDefinition, conn: c, info: null, req: { model: "glm-4.7", sessionId: "s", instructions: "", messages } });
        const body = calls[0]!.body;
        expect(body.thinking).toBeUndefined();
        expect(body.reasoning_effort).toBeUndefined();
        expect(body.messages[0].reasoning_content).toBeUndefined();
    });
});

describe("route body validation", () => {
    const run = (body: unknown) => streamRoute(ctx, null, {
        definition: { id: "fixture", route: async () => ({ protocol: "openai-chat", baseUrl: "https://example.test/v1", headers: {}, body }) } as unknown as types.models.ProviderDefinition,
        conn: { fetch: async () => { throw new Error("network must not be reached"); } } as unknown as types.models.ResolvedConnection,
        req: { model: "m", sessionId: "s", instructions: "", messages: [] }, info: null,
    });
    test("protocol-owned keys and non-objects are rejected before any request", async () => {
        for (const body of [{ model: "x" }, { messages: [] }, { reasoning_effort: "max" }, { tools: [] }, [], "x", null]) {
            await expect(run(body)).rejects.toMatchObject({ code: "INVALID_INPUT" });
        }
    });
});
