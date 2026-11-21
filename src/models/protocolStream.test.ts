import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

const sse = (frames: string[], headers: Record<string, string> = {}) => new Response(frames.map(f => f + "\n\n").join(""), { status: 200, headers: { "content-type": "text/event-stream", ...headers } });
const data = (v: unknown) => "data: " + JSON.stringify(v);

function stub(responses: (() => Response)[]) {
    const calls: { url: string; body: Record<string, any> }[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
        return (responses.shift() ?? (() => new Response("", { status: 500 })))();
    }) as unknown as types.models.ResolvedConnection["fetch"];
    return { fetch, calls };
}

const endpoint = { base: "https://api.example/v1", headers: { authorization: "Bearer k" } };
const request = (extra: Partial<types.models.StreamRequest> = {}): types.models.StreamRequest => ({ model: "m1", instructions: "sys", messages: [{ role: "user", content: "hi" }], sessionId: "s1", ...extra });

let ctx: Context;
beforeAll(async () => { ctx = await mkTestCtx(); }, 60000);

describe("protocol stream strategies", () => {
    test("openai-chat maps options and parses text, tools and usage", async () => {
        const { fetch, calls } = stub([() => sse([
            data({ choices: [{ delta: { content: "He" } }] }),
            data({ choices: [{ delta: { content: "llo", tool_calls: [{ index: 0, id: "c1", function: { name: "f", arguments: "{\"a\":" } }] } }] }),
            data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "1}" } }] }, finish_reason: "stop" }] }),
            data({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } }),
            "data: [DONE]",
        ])]);
        const events: types.models.StreamEvent[] = [];
        const r = await ctx.fns.models.protocol.openaiChat.stream({ fetch, endpoint, request: request({ temperature: 0.1, maxTokens: 9, responseFormat: { type: "json_object" }, onEvent: e => events.push(e) }) });
        expect(calls[0]!.url).toBe("https://api.example/v1/chat/completions");
        expect(calls[0]!.body).toMatchObject({ model: "m1", stream: true, temperature: 0.1, max_tokens: 9, response_format: { type: "json_object" }, messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }] });
        expect(r).toEqual({ text: "Hello", thinking: "", finishReason: "tool_calls", usage: { prompt_tokens: 5, completion_tokens: 2 }, toolCalls: [{ id: "c1", name: "f", args: { a: 1 } }] });
        expect(events.filter(e => e.type === "text_delta")).toHaveLength(2);
    });

    test("anthropic defaults max_tokens, appends JSON instruction and maps stop reasons", async () => {
        const { fetch, calls } = stub([() => sse([
            data({ type: "message_start", message: { usage: { input_tokens: 4 } } }),
            data({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "{}" } }),
            data({ type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 3 } }),
            data({ type: "message_stop" }),
        ])]);
        const r = await ctx.fns.models.protocol.anthropic.stream({ fetch, endpoint, request: request({ responseFormat: { type: "json_object" } }) });
        expect(calls[0]!.url).toBe("https://api.example/v1/messages");
        expect(calls[0]!.body.max_tokens).toBe(4096);
        expect(calls[0]!.body.system).toStartWith("sys\n\nRespond with only one valid JSON value");
        expect(r).toMatchObject({ text: "{}", finishReason: "length", usage: { prompt_tokens: 4, completion_tokens: 3 } });
    });

    test("openai-responses maps format and reads response.completed", async () => {
        const { fetch, calls } = stub([() => sse([
            data({ type: "response.output_text.delta", delta: "ok" }),
            data({ type: "response.completed", response: { usage: { input_tokens: 2, output_tokens: 1 } } }),
        ])]);
        const fmt: types.models.ResponseFormat = { type: "json_schema", name: "r", schema: { type: "object" } };
        const r = await ctx.fns.models.protocol.openaiResponses.stream({ fetch, endpoint, request: request({ maxTokens: 7, responseFormat: fmt }) });
        expect(calls[0]!.url).toBe("https://api.example/v1/responses");
        expect(calls[0]!.body).toMatchObject({ instructions: "sys", max_output_tokens: 7, store: false, text: { format: { type: "json_schema", name: "r", strict: true } } });
        expect(r).toMatchObject({ text: "ok", finishReason: "stop", usage: { prompt_tokens: 2, completion_tokens: 1 } });
    });

    test("gemini uses streamGenerateContent with alt=sse and generationConfig", async () => {
        const { fetch, calls } = stub([() => sse([
            data({ candidates: [{ content: { parts: [{ text: "hm", thought: true }, { text: "yes" }] } }] }),
            data({ candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 } }),
        ])]);
        const r = await ctx.fns.models.protocol.gemini.stream({ fetch, endpoint, request: request({ temperature: 0, responseFormat: { type: "json_object" } }) });
        expect(calls[0]!.url).toBe("https://api.example/v1/models/m1:streamGenerateContent?alt=sse");
        expect(calls[0]!.body).toMatchObject({ systemInstruction: { parts: [{ text: "sys" }] }, generationConfig: { temperature: 0, responseMimeType: "application/json" } });
        expect(r).toMatchObject({ text: "yes", thinking: "hm", finishReason: "stop", usage: { prompt_tokens: 3, completion_tokens: 1 } });
    });

    test("gemini returns each function call's thoughtSignature only on that call and replays it", async () => {
        const { fetch } = stub([() => sse([
            data({ candidates: [{ content: { parts: [{ functionCall: { name: "a", args: { x: 1 } }, thoughtSignature: "sig-1" }, { functionCall: { name: "b", args: {} } }] }, finishReason: "STOP" }] }),
        ])]);
        const r = await ctx.fns.models.protocol.gemini.stream({ fetch, endpoint, request: request() });
        expect(r.finishReason).toBe("tool_calls");
        expect(r.toolCalls[0]).toMatchObject({ name: "a", args: { x: 1 }, thoughtSignature: "sig-1" });
        expect("thoughtSignature" in r.toolCalls[1]!).toBe(false);
        // Stored assistant message → next gemini request replays the signature unchanged.
        const stored = { role: "assistant", content: "", tool_calls: r.toolCalls };
        const contents = await ctx.fns.models.protocol.gemini.toGeminiContents({ messages: [{ role: "user", content: "hi" }, stored, { role: "tool", tool_call_id: r.toolCalls[0]!.id, content: "ok" }, { role: "tool", tool_call_id: r.toolCalls[1]!.id, content: "ok" }] });
        expect(contents[1]!.parts).toEqual([{ functionCall: { name: "a", args: { x: 1 } }, thoughtSignature: "sig-1" }, { functionCall: { name: "b", args: {} } }]);
    });

    test("gemini unsigned function call has no thoughtSignature field", async () => {
        const { fetch } = stub([() => sse([data({ candidates: [{ content: { parts: [{ functionCall: { name: "a" } }] }, finishReason: "STOP" }] })])]);
        const r = await ctx.fns.models.protocol.gemini.stream({ fetch, endpoint, request: request() });
        expect(r.toolCalls).toHaveLength(1);
        expect("thoughtSignature" in r.toolCalls[0]!).toBe(false);
    });

    test("HTTP failures are classified without echoing the body", async () => {
        const cases: [Response, Partial<types.models.FailureInfo>][] = [
            [new Response("secret-body", { status: 429, headers: { "retry-after": "2" } }), { classification: "throttled", retryable: true, retryAfterMs: 2000, acceptance: "rejected" }],
            [new Response("secret-body", { status: 401 }), { classification: "auth", retryable: false }],
            [new Response("secret-body", { status: 400 }), { classification: "invalid_input", retryable: false }],
            [new Response("secret-body", { status: 503 }), { classification: "provider", retryable: true, replaySafe: true }],
        ];
        for (const [res, info] of cases) {
            const { fetch } = stub([() => res]);
            const err = await ctx.fns.models.protocol.openaiChat.stream({ fetch, endpoint, request: request() }).catch(e => e);
            expect(err.failure).toMatchObject(info);
            expect(String(err.message)).not.toContain("secret-body");
        }
    });

    test("cut-off and malformed streams fail with acceptance uncertain", async () => {
        for (const frames of [[data({ choices: [{ delta: { content: "x" } }] })], ["data: {not json"]]) {
            const { fetch } = stub([() => sse(frames)]);
            const err = await ctx.fns.models.protocol.openaiChat.stream({ fetch, endpoint, request: request() }).catch(e => e);
            expect(err.failure).toMatchObject({ acceptance: "uncertain" });
            expect(ctx.fns.models.inference.retryDecision({ failure: err.failure, attempt: 1 }).retry).toBe(false);
        }
        const { fetch } = stub([() => sse([data({ type: "message_start", message: {} })])]);
        await expect(ctx.fns.models.protocol.anthropic.stream({ fetch, endpoint, request: request() })).rejects.toMatchObject({ code: "STREAM_INTERRUPTED" });
    });

    test("every registered protocol exposes stream", async () => {
        for (const id of ["openai-chat", "openai-responses", "anthropic", "gemini"]) {
            const p = await ctx.fns.models.protocol.get({ id });
            expect(typeof p.stream).toBe("function");
        }
    });

    test("rejectProviderOptions rejects unknown keys without echoing them", async () => {
        expect(() => ctx.fns.models.inference.rejectProviderOptions({ provider: "acme", providerOptions: {} })).not.toThrow();
        expect(() => ctx.fns.models.inference.rejectProviderOptions({ provider: "acme", providerOptions: { a: 1 }, allowed: ["a"] })).not.toThrow();
        let err: any;
        try { ctx.fns.models.inference.rejectProviderOptions({ provider: "acme", providerOptions: { leakyKey: 1 } }); } catch (e) { err = e; }
        expect(err).toMatchObject({ code: "INVALID_INPUT" });
        expect(String(err.message)).not.toContain("leakyKey");
    });
});
