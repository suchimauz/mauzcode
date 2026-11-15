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

describe("anthropic reasoning block capture", () => {
    test("thinking block: two deltas and one signature, usage from the final delta", async () => {
        const { conn } = fixtureConn(() => sse([
            { type: "message_start", message: { usage: { input_tokens: 0 } } },
            { type: "content_block_start", index: 0, content_block: { type: "thinking" } },
            { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Think" } },
            { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: " more" } },
            { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig123" } },
            { type: "content_block_start", index: 1, content_block: { type: "text" } },
            { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hello" } },
            { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { input_tokens: 1200, output_tokens: 4 } },
            { type: "message_stop" },
        ]));
        const r = await ctx.fns.models.protocol.anthropic.stream({ fetch: conn.fetch, endpoint: { base: "https://example.test/v1", headers: {} }, request: req() });
        expect(r.thinking).toBe("Think more");
        expect(r.reasoningBlocks).toEqual([{ type: "thinking", thinking: "Think more", signature: "sig123" }]);
        expect(r.usage).toMatchObject({ prompt_tokens: 1200, completion_tokens: 4 });
    });
    test("redacted block carries its data; blocks without content are not reported", async () => {
        const { conn } = fixtureConn(() => sse([
            { type: "message_start", message: { usage: {} } },
            { type: "content_block_start", index: 0, content_block: { type: "redacted_thinking", data: "enc" } },
            { type: "content_block_start", index: 1, content_block: { type: "thinking" } },
            { type: "content_block_delta", index: 1, delta: { type: "thinking_delta", thinking: "kept" } },
            { type: "content_block_start", index: 2, content_block: { type: "text" } },
            { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "ok" } },
            { type: "message_delta", delta: { stop_reason: "end_turn" } },
            { type: "message_stop" },
        ]));
        const r = await ctx.fns.models.protocol.anthropic.stream({ fetch: conn.fetch, endpoint: { base: "https://example.test/v1", headers: {} }, request: req() });
        expect(r.reasoningBlocks).toEqual([{ type: "redacted_thinking", data: "enc" }, { type: "thinking", thinking: "kept" }]);
    });
});

describe("anthropic reasoning block replay", () => {
    const stored = [{ type: "thinking", thinking: "hidden", signature: "sig" }];
    const transcript = (blocks: unknown, origin: unknown) => [
        { role: "user", content: "hi" },
        { role: "assistant", content: "doing", tool_calls: [{ id: "t1", name: "f", args: {}, ...(blocks ? { reasoning_blocks: blocks } : {}), ...(origin ? { reasoning_origin: origin } : {}) }] },
        { role: "tool", tool_call_id: "t1", content: "res" },
    ];
    const convert = (messages: unknown[], extra: Record<string, unknown> = {}) =>
        ctx.fns.models.protocol.anthropic.toAnthropicMessages({ messages, ...extra }) as Array<{ role: string; content: any[] }>;
    test("same connection and model: blocks open the assistant message before text and tool_use", () => {
        const out = convert(transcript(stored, { connectionId: "c1", model: "model-a" }), { replayReasoning: true, origin: { connectionId: "c1", model: "model-a" } });
        const assistant = out.find(m => m.role === "assistant")!;
        expect(assistant.content[0]).toEqual({ type: "thinking", thinking: "hidden", signature: "sig" });
        expect(assistant.content.map((b: any) => b.type)).toEqual(["thinking", "text", "tool_use"]);
    });
    test("different connection, different model, no replay or unsigned blocks send nothing", () => {
        for (const [opts, origin] of [
            [{ replayReasoning: true, origin: { connectionId: "c2", model: "model-a" } }, { connectionId: "c1", model: "model-a" }],
            [{ replayReasoning: true, origin: { connectionId: "c1", model: "model-b" } }, { connectionId: "c1", model: "model-a" }],
            [{ origin: { connectionId: "c1", model: "model-a" } }, { connectionId: "c1", model: "model-a" }],
        ] as const) {
            const out = convert(transcript(stored, origin), opts);
            expect(out.find(m => m.role === "assistant")!.content.map((b: any) => b.type)).toEqual(["text", "tool_use"]);
        }
        const unsigned = convert(transcript([{ type: "thinking", thinking: "no signature" }], { connectionId: "c1", model: "model-a" }), { replayReasoning: true, origin: { connectionId: "c1", model: "model-a" } });
        expect(unsigned.find(m => m.role === "assistant")!.content.map((b: any) => b.type)).toEqual(["text", "tool_use"]);
    });
    test("redacted blocks replay through their data", () => {
        const out = convert(transcript([{ type: "redacted_thinking", data: "enc" }], { connectionId: "c1", model: "model-a" }), { replayReasoning: true, origin: { connectionId: "c1", model: "model-a" } });
        expect(out.find(m => m.role === "assistant")!.content[0]).toEqual({ type: "redacted_thinking", data: "enc" });
    });
    test("the protocol streams stored blocks back when replay and origin match", async () => {
        const { conn, calls } = fixtureConn(() => sse([{ type: "message_start", message: { usage: {} } }, { type: "content_block_start", index: 0, content_block: { type: "text" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }, { type: "message_delta", delta: { stop_reason: "tool_use" } }, { type: "message_stop" }]));
        await ctx.fns.models.protocol.anthropic.stream({
            fetch: conn.fetch,
            endpoint: { base: "https://example.test/v1", headers: {}, replayReasoning: true, origin: { connectionId: "c1", model: "model-a" } },
            request: req({ messages: transcript(stored, { connectionId: "c1", model: "model-a" }) as types.models.StreamRequest["messages"] }),
        });
        const assistant = calls[0]!.body.messages.find((m: any) => m.role === "assistant");
        expect(assistant.content[0]).toEqual({ type: "thinking", thinking: "hidden", signature: "sig" });
        expect(assistant.content.map((b: any) => b.type)).toEqual(["thinking", "text", "tool_use"]);
    });
});

describe("other protocols ignore stored reasoning blocks", () => {
    const callWithBlocks = { id: "t1", name: "f", args: { a: 1 }, reasoning_content: "text reasoning", reasoning_blocks: [{ type: "thinking", thinking: "hidden", signature: "sig" }], reasoning_origin: { connectionId: "c1", model: "model-a" } };
    test("openai-chat conversion drops the blocks and keeps its own replay field", () => {
        const out = ctx.fns.models.protocol.openaiChat.toOpenAIMessages({ messages: [
            { role: "user", content: "hi" },
            { role: "assistant", content: "", tool_calls: [callWithBlocks] },
            { role: "tool", tool_call_id: "t1", content: "res" },
        ], replayReasoning: true }) as any[];
        expect(out[1]).toEqual({ role: "assistant", tool_calls: [{ id: "t1", type: "function", function: { name: "f", arguments: '{"a":1}' } }], reasoning_content: "text reasoning" });
        expect(JSON.stringify(out)).not.toContain("reasoning_blocks");
        expect(JSON.stringify(out)).not.toContain("hidden");
    });
    test("openai-responses builds function calls without the blocks", async () => {
        const { conn, calls } = fixtureConn(() => new Response('data: {"type":"response.completed","response":{"usage":{"input_tokens":2,"output_tokens":1}}}\n\n', { headers: { "content-type": "text/event-stream" } }));
        await ctx.fns.models.protocol.openaiResponses.stream({ fetch: conn.fetch, endpoint: { base: "https://example.test/v1", headers: {} }, request: req({ messages: [
            { role: "user", content: "hi" },
            { role: "assistant", content: "", tool_calls: [callWithBlocks] },
            { role: "tool", tool_call_id: "t1", content: "res" },
        ] as types.models.StreamRequest["messages"] }) });
        const input = calls[0]!.body.input as any[];
        expect(JSON.stringify(input)).not.toContain("hidden");
        expect(JSON.stringify(input)).not.toContain("reasoning_blocks");
        expect(input.filter((i: any) => i.type === "function_call")).toHaveLength(1);
    });
    test("gemini keeps rejecting a foreign thought signature but ignores reasoning blocks", () => {
        const base = [
            { role: "user", content: "hi" },
            { role: "assistant", content: "", tool_calls: [callWithBlocks] },
            { role: "tool", tool_call_id: "t1", content: "res" },
        ];
        const contents = ctx.fns.models.protocol.gemini.toGeminiContents({ messages: base }) as any[];
        expect(JSON.stringify(contents)).not.toContain("hidden");
        const foreign = [
            { role: "user", content: "hi" },
            { role: "assistant", content: "", tool_calls: [{ ...callWithBlocks, thought_signature: "foreign" }] },
            { role: "tool", tool_call_id: "t1", content: "res" },
        ];
        expect(() => ctx.fns.models.protocol.gemini.toGeminiContents({ messages: foreign })).toThrow();
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
