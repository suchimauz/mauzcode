import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import provider from "./$modelProvider_minimax-coding";
import streamRoute from "./inference/streamRoute";
import resolveReasoning from "./inference/resolveReasoning";

let ctx: Context;
beforeAll(async () => { ctx = await mkTestCtx(); }, 120000);

const KEY = "minimax-test-only-key";
type Call = { url: string; method: string; headers: Headers; body: any };

/** Connection fixture: every request goes through conn.fetch and is answered by `reply`. */
function conn(config: types.models.ResolvedConnection["config"], reply: (c: Call) => Response, key: string | null = KEY) {
    const calls: Call[] = [];
    const c: types.models.ResolvedConnection = {
        id: "mm", provider: "minimax-coding", accountName: "plan", config,
        secret: async name => name === "apiKey" ? key : null,
        fetch: async (url, init) => {
            const call = { url: String(url), method: init?.method ?? "GET", headers: new Headers(init?.headers), body: typeof init?.body === "string" ? JSON.parse(init.body) : null };
            calls.push(call);
            return reply(call);
        },
    };
    return { conn: c, calls };
}

const now = 1792645579000;
// Live shape of GET /v1/token_plan/remains: remaining percent, not used.
const generalEntry = {
    model_name: "general", start_time: now, end_time: now + 3600000, remains_time: 3500000,
    current_interval_total_count: 0, current_interval_usage_count: 0,
    weekly_start_time: now, weekly_end_time: now + 86400000, weekly_remains_time: 600000000,
    current_interval_status: 1, current_interval_remaining_percent: 70,
    current_weekly_status: 1, current_weekly_remaining_percent: 40,
};
const remains = (entries: unknown[], code = 0) => Response.json({ model_remains: entries, base_resp: { status_code: code, status_msg: "ok " + KEY } });
const sse = (frames: unknown[]) => new Response(frames.map(f => "data: " + JSON.stringify(f) + "\n\n").join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
const done = () => ({ type: "message_stop" });
const definition = () => ({ ...provider } as types.models.ProviderDefinition);
const streamReq = (extra: Partial<types.models.StreamRequest> = {}): types.models.StreamRequest =>
    ({ model: "MiniMax-M3", sessionId: "s1", instructions: "sys", messages: [{ role: "user", content: "hi" }], ...extra });

describe("minimax-coding route and headers", () => {
    test("anthropic base with x-api-key only, server budget and replay requested", async () => {
        const { conn: c, calls } = conn({ serviceTier: "priority" }, () => new Response(null));
        const r = await provider.route(ctx, c, { model: "MiniMax-M3", info: null, sessionId: "s" });
        expect(r).toEqual({
            protocol: "anthropic", baseUrl: "https://api.minimax.io/anthropic",
            headers: { "x-api-key": KEY }, serverMaxTokens: true, replayReasoning: true,
            body: { service_tier: "priority" },
        });
        expect(calls).toHaveLength(0);
        expect(r.headers.authorization).toBeUndefined();
    });
    test("service tier defaults to standard and never reaches MiniMax-M3.1-Flash", async () => {
        for (const model of ["MiniMax-M3.1-Flash", "minimax-m3.1-flash-highspeed", "MiniMax-M3.1-FlashX"]) {
            const { conn: c } = conn({}, () => new Response(null));
            const r = await provider.route(ctx, c, { model, info: null, sessionId: "s" });
            expect(r.body).toBeUndefined();
        }
        const { conn: c } = conn({}, () => new Response(null));
        const r = await provider.route(ctx, c, { model: "MiniMax-M2.7-highspeed", info: null, sessionId: "s" });
        expect(r.body).toEqual({ service_tier: "standard" });
    });
    test("missing key fails without any network request", async () => {
        const { conn: c, calls } = conn({}, () => new Response(null), null);
        await expect(provider.route(ctx, c, { model: "MiniMax-M3", info: null, sessionId: "s" })).rejects.toThrow("API key is not configured");
        await expect(provider.listModels!(ctx, c)).rejects.toThrow("API key is not configured");
        await expect(provider.usage!(ctx, c)).rejects.toThrow("API key is not configured");
        await expect(provider.test(ctx, c)).resolves.toMatchObject({ status: "unavailable", reason: "request-failed" });
        await expect(provider.countTokens!(ctx, c, { model: "MiniMax-M3", messages: [{ role: "user", content: "hi" }] })).rejects.toThrow("API key is not configured");
        expect(calls).toHaveLength(0);
    });
});

describe("minimax-coding discovery", () => {
    const catalogue = { data: [
        { id: "MiniMax-M3.1-Flash", display_name: "MiniMax M3.1 Flash" },
        { id: "MiniMax-M3" }, { id: "MiniMax-M3" }, { id: "bad id/../x" }, { id: "" }, { id: 5 },
        { id: "MiniMax-M4" }, { id: "MiniMax-M2.7-highspeed" },
    ] };
    test("catalogue order, duplicates and invalid ids dropped, display names and family reasoning attached", async () => {
        const { conn: c, calls } = conn({}, () => Response.json(catalogue));
        const models = await provider.listModels!(ctx, c);
        expect(models).toEqual([
            { id: "MiniMax-M3.1-Flash", label: "MiniMax M3.1 Flash", reasoning: { supported: ["low", "medium", "high", "xhigh"], adaptive: true } },
            { id: "MiniMax-M3", reasoning: { supported: ["off", "high"], default: "off", adaptive: true, effort: false } },
            { id: "MiniMax-M4" },
            { id: "MiniMax-M2.7-highspeed" },
        ] as types.models.ModelInfo[]);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe("https://api.minimax.io/anthropic/v1/models");
        expect(calls[0]!.method).toBe("GET");
        expect(calls[0]!.headers.get("x-api-key")).toBe(KEY);
    });
    test("HTTP error throws a safe message without key or body", async () => {
        const { conn: c } = conn({}, () => new Response("upstream secret body " + KEY, { status: 500 }));
        const error = await provider.listModels!(ctx, c).then(() => null, e => e);
        expect(String(error?.message)).toContain("500");
        expect(String(error?.message)).not.toContain(KEY);
        expect(String(error?.message)).not.toContain("upstream secret body");
    });
    test("unparseable or shapeless catalogue fails without inventing models", async () => {
        for (const reply of [() => new Response("not json " + KEY, { status: 200 }), () => Response.json({ object: "list" }), () => Response.json({ data: "nope" })]) {
            const { conn: c } = conn({}, reply);
            await expect(provider.listModels!(ctx, c)).rejects.toThrow("Invalid model catalogue");
        }
    });
});

describe("minimax-coding usage", () => {
    test("general entry becomes five-hour and weekly windows with M Plan and inverted percents", async () => {
        const { conn: c, calls } = conn({}, () => remains([generalEntry]));
        const report = await provider.usage!(ctx, c);
        expect(calls[0]!.url).toBe("https://www.minimax.io/v1/token_plan/remains");
        expect(calls[0]!.method).toBe("GET");
        expect(calls[0]!.headers.get("authorization")).toBe("Bearer " + KEY);
        expect(report.status).toBe("available");
        expect(report.plan).toBe("M Plan");
        expect(report.windows?.map(w => [w.id, w.period, w.scope, w.usedPercent, w.resetAt])).toEqual([
            ["minimax-coding:five-hour", "fiveHour", "account", 30, now + 3600000],
            ["minimax-coding:weekly", "weekly", "account", 60, now + 86400000],
        ]);
    });
    test("a video entry before general is ignored", async () => {
        const video = { model_name: "video", end_time: now + 3600000, weekly_end_time: now + 86400000, current_interval_remaining_percent: 1, current_weekly_remaining_percent: 1 };
        const { conn: c } = conn({}, () => remains([video, generalEntry]));
        const report = await provider.usage!(ctx, c);
        expect(report.windows?.map(w => w.id)).toEqual(["minimax-coding:five-hour", "minimax-coding:weekly"]);
    });
    test("unrecognized, not-in-plan and body-echoing responses never become zero usage", async () => {
        for (const reply of [
            () => remains([], 1004),
            () => Response.json({ base_resp: { status_code: 1021, status_msg: "no plan " + KEY } }),
            () => Response.json({ model_remains: "nope", base_resp: { status_code: 0 } }),
            () => new Response("not json", { status: 502 }),
        ]) {
            const { conn: c } = conn({}, reply);
            const error = await provider.usage!(ctx, c).then(() => null, e => e);
            expect(String(error?.message)).not.toContain(KEY);
        }
        const notInPlan = { ...generalEntry, current_interval_status: 3, current_weekly_status: 3, current_interval_remaining_percent: 100, current_weekly_remaining_percent: 100 };
        const { conn: c } = conn({}, () => remains([notInPlan]));
        await expect(provider.usage!(ctx, c)).rejects.toThrow("no active plan entry");
    });
    test("out-of-range percentages and dead resets drop only their own window", async () => {
        const { conn: c } = conn({}, () => remains([{ ...generalEntry, current_weekly_remaining_percent: 140 }]));
        expect((await provider.usage!(ctx, c)).windows?.map(w => w.id)).toEqual(["minimax-coding:five-hour"]);
        const { conn: c2 } = conn({}, () => remains([{ ...generalEntry, current_weekly_remaining_percent: 55, weekly_end_time: 0 }]));
        expect((await provider.usage!(ctx, c2)).windows?.map(w => w.id)).toEqual(["minimax-coding:five-hour"]);
        const { conn: c3 } = conn({}, () => remains([{ ...generalEntry, current_interval_remaining_percent: 101, current_weekly_remaining_percent: 101 }]));
        await expect(provider.usage!(ctx, c3)).rejects.toThrow("no recognized windows");
    });
});

describe("minimax-coding connection test", () => {
    test("valid key succeeds with exactly one quota request", async () => {
        const { conn: c, calls } = conn({}, () => remains([generalEntry]));
        const result = await provider.test(ctx, c);
        expect(result).toMatchObject({ status: "available", reason: "usage-ok" });
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe("https://www.minimax.io/v1/token_plan/remains");
        expect(JSON.stringify(result)).not.toContain(KEY);
    });
    test("401, HTTP-200 code 1004 and code 2057 are authentication failures", async () => {
        const denied = await provider.test(ctx, conn({}, () => new Response("denied " + KEY, { status: 401 })).conn);
        expect(denied).toMatchObject({ status: "unavailable", reason: "unauthorized" });
        const code1004 = await provider.test(ctx, conn({}, () => remains([], 1004)).conn);
        expect(code1004).toMatchObject({ status: "unavailable", reason: "unauthorized", message: "The M Plan key was rejected" });
        const code2057 = await provider.test(ctx, conn({}, () => Response.json({ model_remains: [], base_resp: { status_code: 2057, status_msg: KEY } })).conn);
        expect(code2057).toMatchObject({ status: "unavailable", reason: "unauthorized" });
        expect(code2057.message).toContain("M Plan key is required");
    });
    test("other failures are request-failed and never leak the key or body", async () => {
        const failed = await provider.test(ctx, conn({}, () => new Response("boom " + KEY, { status: 502 })).conn);
        expect(failed).toMatchObject({ status: "unavailable", reason: "request-failed" });
        expect(JSON.stringify(failed)).not.toContain(KEY);
        expect(JSON.stringify(failed)).not.toContain("boom");
    });
});

describe("minimax-coding reasoning", () => {
    test("profile follows the family: Flash effort levels, M3 on/off without effort, others none", () => {
        const flash = ctx.fns.models.provider.minimaxCoding.reasoningProfile({ model: "MiniMax-M3.1-Flash" });
        expect(flash).toMatchObject({ supported: ["low", "medium", "high", "xhigh"], adaptive: true, profile: "minimax-2026-11" });
        expect(flash).not.toHaveProperty("default");
        const m3 = ctx.fns.models.provider.minimaxCoding.reasoningProfile({ model: "minimax-m3.1" });
        expect(m3).toMatchObject({ supported: ["off", "high"], default: "off", adaptive: true, effort: false });
        for (const model of ["MiniMax-M2.7", "MiniMax-M4", "MiniMax-M30"]) {
            expect(ctx.fns.models.provider.minimaxCoding.reasoningProfile({ model })).toBeNull();
        }
    });
    test("Flash auto sends nothing, xhigh is native, off applies low without ever disabling thinking", () => {
        const flash = { supported: ["low", "medium", "high", "xhigh"], adaptive: true } as types.models.ModelInfo["reasoning"];
        expect(resolveReasoning(ctx, null, { model: "MiniMax-M3.1-Flash", preference: "auto", metadata: flash })).toMatchObject({ applied: "auto" });
        expect(resolveReasoning(ctx, null, { model: "MiniMax-M3.1-Flash", preference: "xhigh", metadata: flash })).toMatchObject({ applied: "xhigh", adaptive: true });
        expect(resolveReasoning(ctx, null, { model: "MiniMax-M3.1-Flash", preference: "off", metadata: flash })).toMatchObject({ applied: "low", fallbackReason: "off is unsupported by MiniMax-M3.1-Flash; using low" });
        expect(resolveReasoning(ctx, null, { model: "MiniMax-M3.1-Flash", preference: "off", metadata: flash })).not.toHaveProperty("disable");
    });
    test("M3 high enables thinking, off and low apply off, medium maps to off and xhigh to high", () => {
        const m3 = { supported: ["off", "high"], default: "off", adaptive: true, effort: false } as types.models.ModelInfo["reasoning"];
        expect(resolveReasoning(ctx, null, { model: "MiniMax-M3", preference: "high", metadata: m3 })).toMatchObject({ applied: "high", adaptive: true, effort: false });
        expect(resolveReasoning(ctx, null, { model: "MiniMax-M3", preference: "auto", metadata: m3 })).toMatchObject({ applied: "off" });
        for (const preference of ["off", "low", "medium"]) {
            expect(resolveReasoning(ctx, null, { model: "MiniMax-M3", preference, metadata: m3 })).toMatchObject({ applied: "off" });
        }
        expect(resolveReasoning(ctx, null, { model: "MiniMax-M3", preference: "xhigh", metadata: m3 })).toMatchObject({ applied: "high" });
    });
    test("wire: Flash carries adaptive thinking with the effort value, M3 only the adaptive switch", async () => {
        const flashTurn = async (preference?: string) => {
            const { conn: c, calls } = conn({ serviceTier: "priority" }, () => sse([done()]));
            const info = { id: "MiniMax-M3.1-Flash", reasoning: { supported: ["low", "medium", "high", "xhigh"], adaptive: true } } as types.models.ModelInfo;
            const reasoning = preference === undefined ? undefined
                : resolveReasoning(ctx, null, { model: "MiniMax-M3.1-Flash", preference, metadata: info.reasoning });
            await streamRoute(ctx, null, { definition: definition(), conn: c, info, req: streamReq({ model: "MiniMax-M3.1-Flash", ...(reasoning ? { reasoning } : {}) }) });
            return calls[0]!.body;
        };
        const flashBody = await flashTurn("xhigh");
        expect(flashBody).toMatchObject({ thinking: { type: "adaptive" }, output_config: { effort: "xhigh" } });
        expect(flashBody.service_tier).toBeUndefined();
        const off = await flashTurn("off");
        expect(off.output_config).toEqual({ effort: "low" });
        expect(JSON.stringify(off)).not.toContain('"disabled"');
        const auto = await flashTurn();
        expect(auto.thinking).toBeUndefined();
        expect(auto.output_config).toBeUndefined();
        const m3Turn = async (preference: string) => {
            const { conn: c, calls } = conn({ serviceTier: "standard" }, () => sse([done()]));
            const info = { id: "MiniMax-M3", reasoning: { supported: ["off", "high"], default: "off", adaptive: true, effort: false } } as types.models.ModelInfo;
            const reasoning = resolveReasoning(ctx, null, { model: "MiniMax-M3", preference, metadata: info.reasoning });
            await streamRoute(ctx, null, { definition: definition(), conn: c, info, req: streamReq({ model: "MiniMax-M3", reasoning }) });
            return calls[0]!.body;
        };
        const on = await m3Turn("high");
        expect(on.thinking).toEqual({ type: "adaptive" });
        expect(on.output_config).toBeUndefined();
        expect(on.service_tier).toBe("standard");
        for (const preference of ["auto", "off", "medium"]) {
            const body = await m3Turn(preference);
            expect(body.thinking).toBeUndefined();
            expect(body.output_config).toBeUndefined();
        }
    });
    test("wire: M2 and unknown models stream without any reasoning control", async () => {
        const { conn: c, calls } = conn({}, () => sse([done()]));
        await streamRoute(ctx, null, { definition: definition(), conn: c, info: { id: "MiniMax-M2.7" }, req: streamReq({ model: "MiniMax-M2.7", reasoningEffort: "high" }) });
        const body = calls[0]!.body;
        expect(body.thinking).toBeUndefined();
        expect(body.output_config).toBeUndefined();
    });
    test("wire: no output budget, no temperature, no cache markers, images reach the gateway", async () => {
        const { conn: c, calls } = conn({}, () => sse([
            { type: "message_start", message: { usage: { input_tokens: 0 } } },
            { type: "content_block_start", index: 0, content_block: { type: "text" } },
            { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } },
            { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { input_tokens: 400, output_tokens: 9, cache_read_input_tokens: 800 } },
            { type: "message_stop" },
        ]));
        const result = await streamRoute(ctx, null, { definition: definition(), conn: c, info: null, req: streamReq({
            model: "MiniMax-M3", cacheableMessageCount: 2,
            messages: [
                { role: "user", content: [{ type: "text", text: "look" }, { type: "image", mimeType: "image/png", data: "img-bytes" }] },
            ],
        }) });
        const body = calls[0]!.body;
        expect(calls[0]!.url).toBe("https://api.minimax.io/anthropic/v1/messages");
        expect(body.max_tokens).toBeUndefined();
        expect(body.temperature).toBeUndefined();
        expect(JSON.stringify(body)).not.toContain("cache_control");
        expect(body.messages[0].content).toEqual([
            { type: "text", text: "look" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: "img-bytes" } },
        ]);
        expect(result.finishReason).toBe("stop");
        expect(result.usage).toMatchObject({ prompt_tokens: 1200, completion_tokens: 9, cache_read_tokens: 800 });
    });
});

describe("minimax-coding thinking replay", () => {
    const storedTurn = { connectionId: "mm", model: "MiniMax-M3.1-Flash" };
    const messages = [
        { role: "user", content: "read it" },
        { role: "assistant", content: "", tool_calls: [{
            id: "t1", name: "read", args: { p: 1 },
            reasoning_blocks: [
                { type: "thinking", thinking: "checked the file", signature: "sigMM" },
                { type: "thinking", thinking: "no signature", signature: "" },
            ],
            reasoning_origin: storedTurn,
        }] },
        { role: "tool", tool_call_id: "t1", content: "a" },
    ];
    test("Flash tool loop sends the signed block back unchanged", async () => {
        const { conn: c, calls } = conn({}, () => sse([done()]));
        const info = { id: "MiniMax-M3.1-Flash", reasoning: { supported: ["low", "medium", "high", "xhigh"], adaptive: true } } as types.models.ModelInfo;
        await streamRoute(ctx, null, { definition: definition(), conn: c, info, req: streamReq({ model: "MiniMax-M3.1-Flash", messages }) });
        const assistant = calls[0]!.body.messages.find((m: any) => m.role === "assistant");
        expect(assistant.content[0]).toEqual({ type: "thinking", thinking: "checked the file", signature: "sigMM" });
        expect(assistant.content[1]).toEqual({ type: "tool_use", id: "t1", name: "read", input: { p: 1 } });
        expect(JSON.stringify(assistant)).not.toContain("no signature");
    });
    test("continuing the same stored turn on MiniMax-M3 sends no stored block", async () => {
        const { conn: c, calls } = conn({}, () => sse([done()]));
        const info = { id: "MiniMax-M3", reasoning: { supported: ["off", "high"], default: "off", adaptive: true, effort: false } } as types.models.ModelInfo;
        await streamRoute(ctx, null, { definition: definition(), conn: c, info, req: streamReq({ model: "MiniMax-M3", messages }) });
        const assistant = calls[0]!.body.messages.find((m: any) => m.role === "assistant");
        expect(JSON.stringify(assistant)).not.toContain("checked the file");
        expect(assistant.content[0]).toEqual({ type: "tool_use", id: "t1", name: "read", input: { p: 1 } });
    });
});

describe("minimax-coding failure classification", () => {
    const classify = (status: number, body: unknown, model = "MiniMax-M3") =>
        provider.classifyFailure!(ctx, conn({}, () => new Response(null)).conn, { status, body, model });
    test("code table: quota, throttled, unsupported, auth", async () => {
        expect(await classify(429, { base_resp: { status_code: 2056 }, error: { message: KEY } })).toMatchObject({ code: "QUOTA_EXHAUSTED", classification: "quota", retryable: false });
        expect(await classify(429, { base_resp: { status_code: 2067 } })).toMatchObject({ code: "QUOTA_EXHAUSTED", classification: "quota" });
        for (const code of [1002, 1039, 1041, 1045, 2045, 2046, 2047, 2062]) {
            expect(await classify(429, { base_resp: { status_code: code } })).toMatchObject({ code: "RATE_LIMITED", classification: "throttled", retryable: true });
        }
        expect(await classify(400, { base_resp: { status_code: 2068 } })).toMatchObject({ code: "UNSUPPORTED", classification: "unsupported", retryable: false });
        expect(await classify(401, { base_resp: { status_code: 1004 } })).toMatchObject({ code: "AUTH", classification: "auth", retryable: false });
        expect(await classify(403, { error: { code: 2057 } })).toMatchObject({ code: "AUTH", classification: "auth" });
    });
    test("quota resetAt comes only from a cached window at 100% with a future reset, five-hour first", async () => {
        const t0 = Date.now();
        const healthy: types.models.UsageReport = { status: "available", checkedAt: t0, windows: [
            { id: "minimax-coding:five-hour", label: "Session (5h)", period: "fiveHour", scope: "account", usedPercent: 100, resetAt: t0 + 3600000 },
            { id: "minimax-coding:weekly", label: "Weekly (7d)", period: "weekly", scope: "account", usedPercent: 100, resetAt: t0 + 86400000 },
        ] };
        const stale: types.models.UsageReport = { status: "available", checkedAt: t0, windows: [
            { id: "minimax-coding:five-hour", label: "Session (5h)", period: "fiveHour", scope: "account", usedPercent: 100, resetAt: t0 - 1000 },
            { id: "minimax-coding:weekly", label: "Weekly (7d)", period: "weekly", scope: "account", usedPercent: 40, resetAt: t0 + 86400000 },
        ] };
        type Health = NonNullable<NonNullable<types.models.State["health"]>[string]>;
        const health = ((ctx.state.models ??= {}).health ??= {}) as Record<string, Health>;
        const saved = Object.keys(health).length ? { ...health } : undefined;
        try {
            health["mm:cache:usage"] = { expiresAt: t0 + 60000, result: healthy };
            expect(await classify(429, { base_resp: { status_code: 2056 } })).toMatchObject({ resetAt: t0 + 3600000 });
            health["mm:cache:usage"] = { expiresAt: t0 + 60000, result: stale };
            expect(await classify(429, { base_resp: { status_code: 2056 } })).not.toHaveProperty("resetAt");
            const weeklyOnly: types.models.UsageReport = { status: "available", checkedAt: t0, reason: "usage-ok", windows: [healthy.windows![1]!] };
            health["mm:cache:usage"] = { expiresAt: t0 + 60000, result: weeklyOnly };
            expect(await classify(429, { base_resp: { status_code: 2056 } })).toMatchObject({ resetAt: t0 + 86400000 });
            delete health["mm:cache:usage"];
            expect(await classify(429, { base_resp: { status_code: 2056 } })).not.toHaveProperty("resetAt");
        } finally {
            if (saved) (ctx.state.models!.health as Record<string, Health>) = saved;
        }
    });
    test("rate limit is never quota, and unknown bodies fall back to status rules", async () => {
        const { conn: c, calls } = conn({}, () => new Response(JSON.stringify({ base_resp: { status_code: 1002 } }), { status: 429 }));
        const error = await ctx.fns.models.protocol.anthropic.stream({
            fetch: c.fetch, endpoint: { base: "https://api.minimax.io/anthropic/v1", headers: { "x-api-key": KEY } },
            request: streamReq(), classifyFailure: (input: { status: number; body: unknown | null }) =>
                provider.classifyFailure!(ctx, c, { ...input, model: "MiniMax-M3" }),
        }).then(() => null, (e: any) => e);
        expect(error.failure).toMatchObject({ code: "RATE_LIMITED", classification: "throttled", upstreamStatus: 429 });
        expect(String(error.message)).toBe("MiniMax is rate limiting requests");
        expect(String(error.message)).not.toContain(KEY);
        expect(calls).toHaveLength(1);
        expect(await classify(429, { error: { type: "overloaded_error" } })).toBeNull();
        expect(await classify(500, null)).toBeNull();
    });
});

describe("minimax-coding token counting", () => {
    test("count body matches the inference conversion and reports input_tokens", async () => {
        const { conn: c, calls } = conn({}, () => Response.json({ input_tokens: 4321.6 }));
        const count = await provider.countTokens!(ctx, c, {
            model: "MiniMax-M3.1-Flash",
            messages: [
                { role: "system", content: "sys" },
                { role: "user", content: "hi" },
                { role: "assistant", content: "", tool_calls: [{ id: "t1", name: "read", args: { p: 1 }, reasoning_blocks: [{ type: "thinking", thinking: "checked", signature: "sigMM" }], reasoning_origin: { connectionId: "mm", model: "MiniMax-M3.1-Flash" } }] },
                { role: "tool", tool_call_id: "t1", content: "a" },
            ],
            instructions: "be brief",
            tools: [{ name: "read", description: "read a file", parameters: { type: "object" } } as unknown as types.models.ToolSpec],
        });
        expect(count).toBe(4321.6);
        const call = calls[0]!;
        expect(call.url).toBe("https://api.minimax.io/anthropic/v1/messages/count_tokens");
        expect(call.method).toBe("POST");
        expect(call.headers.get("x-api-key")).toBe(KEY);
        expect(call.body).toEqual({
            model: "MiniMax-M3.1-Flash",
            messages: [
                { role: "user", content: [{ type: "text", text: "hi" }] },
                { role: "assistant", content: [{ type: "thinking", thinking: "checked", signature: "sigMM" }, { type: "tool_use", id: "t1", name: "read", input: { p: 1 } }] },
                { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "a" }] },
            ],
            system: "be brief",
            tools: [{ name: "read", description: "read a file", input_schema: { type: "object" } }],
        });
        expect(JSON.stringify(call.body)).not.toContain("cache_control");
    });
    test("a timeout or failed count fails the count, not the turn", async () => {
        const rejectingOnAbort: types.models.ResolvedConnection = {
            id: "mm", provider: "minimax-coding", accountName: "plan", config: {},
            secret: async () => KEY,
            fetch: (url, init) => new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
            }),
        };
        const never: types.models.ResolvedConnection = {
            id: "mm", provider: "minimax-coding", accountName: "plan", config: {},
            secret: async () => KEY,
            fetch: () => new Promise<Response>(() => {}),
        };
        await expect(ctx.fns.models.provider.minimaxCoding.countTokens({ conn: rejectingOnAbort, model: "MiniMax-M3", messages: [{ role: "user", content: "hi" }], timeoutMs: 20 })).rejects.toThrow();
        const registry = (ctx as any).state.registry;
        const saved = { enabled: registry.models.inference.assertModelEnabled, resolve: registry.models.connections.resolve };
        const countedId = Bun.randomUUIDv7();
        registry.models.inference.assertModelEnabled = async () => ({ id: countedId, provider: "minimax-coding" });
        registry.models.connections.resolve = async () => ({ conn: never });
        try {
            expect(await ctx.fns.models.countTokens({ connectionId: countedId, model: "MiniMax-M3", messages: [{ role: "user", content: "hi" }], timeoutMs: 30 })).toBeNull();
        } finally {
            registry.models.inference.assertModelEnabled = saved.enabled;
            registry.models.connections.resolve = saved.resolve;
        }
    });
});

describe("minimax-coding models.call", () => {
    test("temperature and maxTokens are reported as ignored and never reach the gateway", async () => {
        const registry = (ctx as any).state.registry;
        const saved = { enabled: registry.models.inference.assertModelEnabled, resolve: registry.models.connections.resolve };
        const calledId = Bun.randomUUIDv7();
        registry.models.inference.assertModelEnabled = async () => ({ id: calledId, provider: "minimax-coding" });
        const { conn: c, calls } = conn({ serviceTier: "priority" }, () => sse([
            { type: "message_start", message: { usage: {} } },
            { type: "content_block_start", index: 0, content_block: { type: "text" } },
            { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: '{"answer":42}' } },
            { type: "message_delta", delta: { stop_reason: "end_turn" } },
            { type: "message_stop" },
        ]));
        registry.models.connections.resolve = async () => ({ conn: c, definition: definition(), view: { id: calledId, provider: "minimax-coding" } });
        try {
            const result = await ctx.fns.models.call({ connectionId: calledId, model: "MiniMax-M3", system: "json only", user: "give an answer", temperature: 0.2, maxTokens: 100, responseFormat: { type: "json_object" } });
            expect(result.ignored).toEqual(["temperature", "maxTokens"]);
            expect(result.text).toBe('{"answer":42}');
            const body = calls[0]!.body;
            expect(body.temperature).toBeUndefined();
            expect(body.max_tokens).toBeUndefined();
            expect(body.service_tier).toBe("priority");
            expect(String(body.system)).toContain("json");
        } finally {
            registry.models.inference.assertModelEnabled = saved.enabled;
            registry.models.connections.resolve = saved.resolve;
        }
    });
});
