import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import route from "./inference/streamRoute";
import resolveReasoning from "./inference/resolveReasoning";

let ctx: Context;
beforeAll(async () => { ctx = await mkTestCtx(); }, 60000);

const sse = (frames: unknown[]) => new Response(frames.map(f => "data: " + JSON.stringify(f) + "\n\n").join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
const done = () => ({ type: "message_stop" });

type Call = { url: string; headers: Headers; body: any };
/** Fixture anthropic route provider: records the protocol request body via conn.fetch. */
function fixtureConn(reply: (c: Call) => Response) {
    const calls: Call[] = [];
    const conn = {
        id: "c1",
        fetch: async (url: string, init: RequestInit) => {
            const call = { url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? "{}")) };
            calls.push(call);
            return reply(call);
        },
    } as types.models.ResolvedConnection;
    return { conn, calls };
}

const fixtureRoute = (extra: Partial<types.models.ProtocolRoute> = {}): types.models.ProviderDefinition =>
    ({ id: "fixture", route: async () => ({ protocol: "anthropic", baseUrl: "https://example.test/v1", headers: { authorization: "Bearer fixture-key" }, ...extra }) }) as unknown as types.models.ProviderDefinition;

const req = (extra: Partial<types.models.StreamRequest> = {}): types.models.StreamRequest =>
    ({ model: "m1", sessionId: "s1", instructions: "sys", messages: [{ role: "user", content: "hi" }], ...extra });

describe("reasoning adaptive and effort flags", () => {
    test("adaptive carries the flag with the effort value on concrete on-levels", () => {
        const metadata = { supported: ["off", "high"], adaptive: true } as types.models.ModelInfo["reasoning"];
        expect(resolveReasoning(ctx, null, { model: "m", preference: "high", metadata })).toMatchObject({ requested: "high", applied: "high", adaptive: true });
        expect(resolveReasoning(ctx, null, { model: "m", preference: "high", metadata })).not.toHaveProperty("effort");
    });
    test("effort false is carried and omits the effort value downstream", () => {
        const metadata = { supported: ["high"], adaptive: true, effort: false } as types.models.ModelInfo["reasoning"];
        expect(resolveReasoning(ctx, null, { model: "m", preference: "high", metadata })).toEqual({ requested: "high", applied: "high", fallbackReason: null, source: "metadata", adaptive: true, effort: false });
    });
    test("off and auto never carry adaptive or effort", () => {
        const metadata = { supported: ["off", "high"], adaptive: true, effort: false, disable: true } as unknown as types.models.ModelInfo["reasoning"];
        const off = resolveReasoning(ctx, null, { model: "m", preference: "off", metadata });
        expect(off).toEqual({ requested: "off", applied: "off", fallbackReason: null, source: "metadata", disable: true });
        expect(off).not.toHaveProperty("adaptive");
        expect(off).not.toHaveProperty("effort");
        const auto = resolveReasoning(ctx, null, { model: "m", metadata });
        expect(auto).toEqual({ requested: "auto", applied: "auto", fallbackReason: null, source: "metadata" });
        expect(auto).not.toHaveProperty("adaptive");
        expect(auto).not.toHaveProperty("effort");
    });
    test("non-boolean adaptive or effort metadata fails INVALID_INPUT", () => {
        for (const [key, value] of [["adaptive", "yes"], ["effort", 1]] as const) {
            const metadata = { supported: ["high"], [key]: value };
            try { resolveReasoning(ctx, null, { model: "m", preference: "high", metadata: metadata as never }); throw new Error("unexpected success"); }
            catch (error) { expect((error as { code?: string }).code).toBe("INVALID_INPUT"); expect(String(error)).toContain(key); }
        }
    });
});

describe("anthropic protocol request", () => {
    test("adaptive thinking with effort sends both switches", async () => {
        const { conn, calls } = fixtureConn(() => sse([done()]));
        await ctx.fns.models.protocol.anthropic.stream({ fetch: conn.fetch, endpoint: { base: "https://example.test/v1", headers: {} }, request: req({ reasoning: { requested: "high", applied: "high", fallbackReason: null, source: "metadata", adaptive: true } }) });
        expect(calls[0]!.body.thinking).toEqual({ type: "adaptive" });
        expect(calls[0]!.body.output_config).toEqual({ effort: "high" });
    });
    test("adaptive thinking with effort false omits the effort value", async () => {
        const { conn, calls } = fixtureConn(() => sse([done()]));
        await ctx.fns.models.protocol.anthropic.stream({ fetch: conn.fetch, endpoint: { base: "https://example.test/v1", headers: {} }, request: req({ reasoning: { requested: "high", applied: "high", fallbackReason: null, source: "metadata", adaptive: true, effort: false } }) });
        expect(calls[0]!.body.thinking).toEqual({ type: "adaptive" });
        expect(calls[0]!.body.output_config).toBeUndefined();
    });
    test("non-adaptive reasoning keeps the effort-only form", async () => {
        const { conn, calls } = fixtureConn(() => sse([done()]));
        await ctx.fns.models.protocol.anthropic.stream({ fetch: conn.fetch, endpoint: { base: "https://example.test/v1", headers: {} }, request: req({ reasoning: { requested: "xhigh", applied: "xhigh", fallbackReason: null, source: "metadata" } }) });
        expect(calls[0]!.body.thinking).toBeUndefined();
        expect(calls[0]!.body.output_config).toEqual({ effort: "xhigh" });
    });
    test("default budget stays 4096 without the flag", async () => {
        const { conn, calls } = fixtureConn(() => sse([done()]));
        await ctx.fns.models.protocol.anthropic.stream({ fetch: conn.fetch, endpoint: { base: "https://example.test/v1", headers: {} }, request: req() });
        expect(calls[0]!.body.max_tokens).toBe(4096);
    });
    test("serverMaxTokens sends no max_tokens, with or without a caller budget", async () => {
        for (const maxTokens of [undefined, 300]) {
            const { conn, calls } = fixtureConn(() => sse([done()]));
            await ctx.fns.models.protocol.anthropic.stream({ fetch: conn.fetch, endpoint: { base: "https://example.test/v1", headers: {}, serverMaxTokens: true }, request: req({ ...(maxTokens !== undefined ? { maxTokens } : {}) }) });
            expect(calls[0]!.body.max_tokens).toBeUndefined();
            expect(calls[0]!.body.model).toBe("m1");
        }
    });
    test("endpoint body merges after protocol-owned fields", async () => {
        const { conn, calls } = fixtureConn(() => sse([done()]));
        await ctx.fns.models.protocol.anthropic.stream({ fetch: conn.fetch, endpoint: { base: "https://example.test/v1", headers: {}, body: { service_tier: "standard" } }, request: req({ reasoning: { requested: "high", applied: "high", fallbackReason: null, source: "metadata", adaptive: true } }) });
        expect(calls[0]!.body).toMatchObject({ service_tier: "standard", thinking: { type: "adaptive" }, output_config: { effort: "high" }, max_tokens: 4096, model: "m1", system: "sys" });
    });
});

describe("route body fields per protocol", () => {
    /** Fake protocol registry: captures the endpoint streamRoute forwards. */
    let seen: types.models.ProtocolEndpoint | null = null;
    const fakeCtx = () => ({
        fns: { models: {
            inference: { failure: ctx.fns.models.inference.failure },
            connections: { safeMessage: ctx.fns.models.connections.safeMessage },
            protocol: {
                list: () => [{ id: "anthropic" }],
                get: ({ id }: { id: string }) => id === "anthropic" ? {
                    baseUrl: (_c: Context, raw: string) => raw,
                    defaultHeaders: () => ({}),
                    stream: async (_c: Context, o: { endpoint: types.models.ProtocolEndpoint }) => { seen = o.endpoint; return { text: "", thinking: "", finishReason: "stop", usage: {}, toolCalls: [] }; },
                } : undefined,
            },
        } },
    } as unknown as Context);
    test("anthropic rejects owned keys", async () => {
        for (const body of [{ max_tokens: 5 }, { thinking: {} }, { system: "x" }, { output_config: {} }]) {
            const definition = fixtureRoute({ body });
            try { await route(fakeCtx(), null, { definition, conn: fixtureConn(() => sse([done()])).conn, req: req(), info: null }); throw new Error("unexpected success"); }
            catch (error) { expect((error as { code?: string }).code).toBe("INVALID_INPUT"); }
        }
        expect(seen).toBeNull();
    });
    test("extras, serverMaxTokens, replayReasoning and origin are forwarded on the endpoint", async () => {
        seen = null;
        await route(fakeCtx(), null, { definition: fixtureRoute({ body: { service_tier: "standard" }, serverMaxTokens: true, replayReasoning: true }), conn: { id: "c9" } as types.models.ResolvedConnection, req: req({ model: "model-a" }), info: null });
        expect(seen).toMatchObject({ body: { service_tier: "standard" }, serverMaxTokens: true, replayReasoning: true, origin: { connectionId: "c9", model: "model-a" } });
    });
    test("openai-chat still rejects its owned keys and accepts a vendor thinking switch", async () => {
        const openai = (extra: Partial<types.models.ProtocolRoute>) => fixtureRoute({ protocol: "openai-chat", baseUrl: "https://example.test/v1", ...extra });
        const reply = () => new Response('data: {"choices":[{"delta":{"content":"x"},"finish_reason":"stop"}],"usage":{}}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
        for (const body of [{ max_tokens: 5 }, { reasoning_effort: "high" }, { response_format: {} }]) {
            try { await route(ctx, null, { definition: openai({ body }), conn: fixtureConn(reply).conn, req: req(), info: null }); throw new Error("unexpected success"); }
            catch (error) { expect((error as { code?: string }).code).toBe("INVALID_INPUT"); }
        }
        const { conn, calls } = fixtureConn(reply);
        await route(ctx, null, { definition: openai({ body: { thinking: { type: "enabled" } } }), conn, req: req(), info: null });
        expect(calls[0]!.body.thinking).toEqual({ type: "enabled" });
    });
    test("a protocol without body support ignores body fields", async () => {
        const reply = () => new Response('data: {"candidates":[{"finishReason":"STOP"}]}\n\n', { headers: { "content-type": "text/event-stream" } });
        const { conn, calls } = fixtureConn(reply);
        await route(ctx, null, { definition: fixtureRoute({ protocol: "gemini", baseUrl: "https://example.test/v1", body: { max_tokens: 5, thinking: {} } }), conn, req: req(), info: null });
        expect(calls[0]!.url).toContain(":streamGenerateContent");
    });
});
