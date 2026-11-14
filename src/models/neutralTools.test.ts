import { beforeAll, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import custom from "./$modelProvider_custom";
import claude from "./$modelProvider_claude";
import codex from "./$modelProvider_codex";

beforeAll(async () => { await mkTestCtx(); }, 60000);
const tool: types.models.ToolSpec = { name: "read", description: "Read a file", parameters: { type: "object", additionalProperties: false, required: ["path"], properties: { path: { type: "string" } } } };
const sse = (events: object[]) => new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(""));

test("all four converters preserve neutral schemas; recursive optional fields disable both OpenAI strict shapes", async () => {
    const ctx = await mkTestCtx();
    const p = ctx.fns.models.protocol;
    expect(p.anthropic.toTools({ tools: [tool] })).toEqual([{ name: tool.name, description: tool.description, input_schema: tool.parameters }]);
    expect(p.gemini.toTools({ tools: [tool] })).toEqual([{ functionDeclarations: [tool] }]);
    const original = structuredClone(tool);
    for (const parameters of [
        tool.parameters,
        { type: "object", additionalProperties: false, properties: { optional: { type: "string" } } },
        { type: "object", additionalProperties: false, required: ["nested"], properties: { nested: { type: "object", additionalProperties: false, properties: { optional: { type: "string" } } } } },
        { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", items: { type: "object", additionalProperties: false, properties: { optional: { type: "string" } } } } } },
        { anyOf: [{ type: "object", properties: { optional: { type: "string" } } }] },
    ]) {
        const neutral = { ...tool, parameters };
        const strict = parameters === tool.parameters;
        expect(p.openaiResponses.toTools({ tools: [neutral] })).toEqual([{ type: "function", ...neutral, strict }]);
        expect(p.openaiChat.toTools({ tools: [neutral] })).toEqual([{ type: "function", function: { ...neutral, strict } }]);
    }
    expect(tool).toEqual(original);
});

test("custom provider chooses each wire tool shape from connection protocol", async () => {
    const ctx = await mkTestCtx();
    for (const [protocol, events, expected] of [
        ["openai-chat", [{ choices: [{ delta: {}, finish_reason: "stop" }] }], [{ type: "function", function: { ...tool, strict: true } }]],
        ["openai-responses", [{ type: "response.completed", response: { status: "completed" } }], [{ type: "function", ...tool, strict: true }]],
        ["anthropic", [{ type: "message_stop" }], [{ name: tool.name, description: tool.description, input_schema: tool.parameters }]],
        ["gemini", [{ candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] }], [{ functionDeclarations: [tool] }]],
    ] as const) {
        let body: Record<string, unknown> = {};
        const conn: types.models.ResolvedConnection = { id: "test", provider: "custom", accountName: "test", config: { baseUrl: "https://api.example", protocol }, secret: async () => null, fetch: async (_url, init) => { body = JSON.parse(String(init?.body)); return sse([...events]); } };
        await custom.stream(ctx, conn, { model: "m", instructions: "", messages: [{ role: "user", content: "Hi" }], sessionId: "s", tools: [tool] });
        expect(body.tools).toEqual(expected);
    }
});

test("same neutral tools reach Claude input_schema and Codex Responses shapes", async () => {
    const ctx = await mkTestCtx();
    ctx.state.registry.models.provider.claude.claudeAuth = async () => ({ accessToken: "fixture", loggedIn: true });
    ctx.state.registry.models.provider.claude.claudeCodeCliVersion = async () => "2.0.0";
    ctx.state.registry.models.provider.codex.codexAuth = async () => ({ accessToken: "fixture", accountId: "account", loggedIn: true });
    const bodies: Record<string, unknown>[] = [];
    const req: types.models.StreamRequest = { model: "m", instructions: "", messages: [{ role: "user", content: "Hi" }], sessionId: "s", tools: [tool] };
    for (const provider of [claude, codex]) {
        const conn: types.models.ResolvedConnection = { id: "test", provider: provider.id, accountName: "test", config: {}, secret: async () => null, fetch: async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return sse(provider.id === "claude" ? [{ type: "message_stop" }] : [{ type: "response.completed", response: { status: "completed" } }]); } };
        await provider.stream(ctx, conn, { ...req, reasoning: { requested: "medium", applied: "medium", fallbackReason: null, source: "profile", profile: "fixture" } });
    }
    expect(bodies[0]!.tools).toEqual([{ name: tool.name, description: tool.description, input_schema: tool.parameters }]);
    expect(bodies[1]!.tools).toEqual([{ type: "function", ...tool, strict: true }]);
});

test("one-shot call advertises the same neutral tools without executing them", async () => {
    const ctx = await mkTestCtx();
    const seen: unknown[] = [];
    ctx.state.models.providers = { fixture: { owner: "core", module: "models", rel: "fixture", definition: { id: "fixture", label: "Fixture", fields: [], transports: ["direct"], test: async () => ({}), stream: async (_ctx: Context, _conn: object, req: types.models.StreamRequest) => { seen.push(req.tools); return { text: "", thinking: "", finishReason: "stop", usage: {}, toolCalls: [] }; } } } };
    const conn = await ctx.fns.models.create({ provider: "fixture", accountName: "test" });
    await ctx.fns.models.call({ connectionId: conn.id, model: "m", user: "hello", tools: [tool] });
    expect(seen).toEqual([[tool]]);
});
