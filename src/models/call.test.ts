import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

type Reply = string | (() => never);

async function setup(opts: { capabilities?: types.models.ProviderDefinition["capabilities"]; replies?: Reply[] } = {}) {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") } });
    const seen: types.models.StreamRequest[] = [];
    const replies = [...(opts.replies ?? ["ok"])];
    const definition: types.models.ProviderDefinition = {
        id: "acme", label: "Acme",
        fields: [{ key: "apiKey", label: "API key", type: "secret" }],
        transports: ["direct"],
        test: async () => ({ status: "available", reason: "ok", message: "ok", checkedAt: Date.now() }),
        listModels: async () => [{ id: "m1" }],
        stream: async (_ctx, _conn, req) => {
            seen.push(req);
            const next = replies.length > 1 ? replies.shift()! : replies[0]!;
            if (typeof next === "function") next();
            return { text: next as string, thinking: "", finishReason: "stop", usage: { prompt_tokens: 3, completion_tokens: 1 }, toolCalls: [] };
        },
        ...(opts.capabilities ? { capabilities: opts.capabilities } : {}),
    };
    ctx.state.models ??= {};
    ctx.state.models.providers = { acme: { owner: "core", module: "models", rel: "models/$modelProvider_acme.ts", definition } };
    ctx.state.models.health = {};
    const conn = await ctx.fns.models.create({ provider: "acme", accountName: "work", config: {}, secrets: {} });
    return { ctx, seen, conn };
}

const fail = (info: Partial<types.models.FailureInfo>) => () => {
    throw Object.assign(new Error("upstream"), { failure: { code: "X", classification: "throttled", acceptance: "none", retryable: true, replaySafe: true, ...info } });
};

beforeAll(async () => { await mkTestCtx(); }, 60000);

describe("models.inference.retryDecision", () => {
    test("retries only retryable, replay-safe, unaccepted failures up to three attempts", async () => {
        const ctx = await mkTestCtx();
        const base: types.models.FailureInfo = { code: "X", classification: "throttled", acceptance: "none", retryable: true, replaySafe: true };
        const d = (failure: types.models.FailureInfo | null, attempt: number) => ctx.fns.models.inference.retryDecision({ failure, attempt });
        expect(d(base, 1)).toEqual({ retry: true, delayMs: 500 });
        expect(d(base, 2)).toEqual({ retry: true, delayMs: 2000 });
        expect(d(base, 3).retry).toBe(false);
        expect(d({ ...base, acceptance: "rejected", retryAfterMs: 7 }, 1)).toEqual({ retry: true, delayMs: 7 });
        expect(d({ ...base, acceptance: "uncertain" }, 1).retry).toBe(false);
        expect(d({ ...base, acceptance: "accepted" }, 1).retry).toBe(false);
        expect(d({ ...base, retryable: false }, 1).retry).toBe(false);
        expect(d({ ...base, replaySafe: false }, 1).retry).toBe(false);
        expect(d(null, 1).retry).toBe(false);
    });
});

describe("models.call", () => {
    test("sends one user message with system instructions and returns the result", async () => {
        const { ctx, seen, conn } = await setup({ replies: ["Hello"] });
        const r = await ctx.fns.models.call({ connectionId: conn.id, model: "m1", user: " hi ", system: "be brief" });
        expect(r).toEqual({ text: "Hello", finishReason: "stop", usage: { prompt_tokens: 3, completion_tokens: 1 }, attempts: 1, ignored: [] });
        expect(seen).toHaveLength(1);
        expect(seen[0]!.messages).toEqual([{ role: "user", content: "hi" }]);
        expect(seen[0]!.instructions).toBe("be brief");
        expect(seen[0]!.tools).toBeUndefined();
        expect(seen[0]!.sessionId).toBeTruthy();
    });

    test("rejects invalid input before any provider call", async () => {
        const { ctx, seen, conn } = await setup();
        const base = { connectionId: conn.id, model: "m1", user: "hi" };
        for (const bad of [{ user: "  " }, { timeoutMs: 0 }, { timeoutMs: 3600001 }, { timeoutMs: 1.5 }, { maxTokens: 0 }, { temperature: 3 }, { responseFormat: { type: "xml" } as unknown as types.models.ResponseFormat }]) {
            await expect(ctx.fns.models.call({ ...base, ...bad })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        }
        expect(seen).toHaveLength(0);
    });

    test("disabled model and provider without stream fail without a provider call", async () => {
        const { ctx, seen, conn } = await setup();
        await ctx.fns.models.setModelEnabled({ id: conn.id, model: "m1", enabled: false });
        await expect(ctx.fns.models.call({ connectionId: conn.id, model: "m1", user: "hi" })).rejects.toMatchObject({ code: "MODEL_DISABLED_BY_USER" });
        await ctx.fns.models.setModelEnabled({ id: conn.id, model: "m1", enabled: true });
        delete ctx.state.models!.providers!.acme!.definition.stream;
        await expect(ctx.fns.models.call({ connectionId: conn.id, model: "m1", user: "hi" })).rejects.toMatchObject({ code: "UNSUPPORTED" });
        expect(seen).toHaveLength(0);
    });

    test("sampling options are gated by capability and reported in ignored", async () => {
        const without = await setup();
        const r1 = await without.ctx.fns.models.call({ connectionId: without.conn.id, model: "m1", user: "hi", temperature: 0.2, maxTokens: 50, providerOptions: { x: 1 } });
        expect(r1.ignored).toEqual(["temperature", "maxTokens"]);
        expect(without.seen[0]!.temperature).toBeUndefined();
        expect(without.seen[0]!.maxTokens).toBeUndefined();
        expect(without.seen[0]!.providerOptions).toEqual({ x: 1 });
        const withCaps = await setup({ capabilities: { sampling: true } });
        const r2 = await withCaps.ctx.fns.models.call({ connectionId: withCaps.conn.id, model: "m1", user: "hi", temperature: 0.2, maxTokens: 50 });
        expect(r2.ignored).toEqual([]);
        expect(withCaps.seen[0]!.temperature).toBe(0.2);
        expect(withCaps.seen[0]!.maxTokens).toBe(50);
    });

    test("retries a transient failure on the same connection with a stable session id", async () => {
        const { ctx, seen, conn } = await setup({ replies: [fail({ retryAfterMs: 1 }), "ok"] });
        const r = await ctx.fns.models.call({ connectionId: conn.id, model: "m1", user: "hi" });
        expect(r.attempts).toBe(2);
        expect(seen).toHaveLength(2);
        expect(seen[0]!.sessionId).toBe(seen[1]!.sessionId);
    });

    test("does not retry accepted, uncertain or plain errors", async () => {
        for (const reply of [fail({ acceptance: "uncertain" }), fail({ acceptance: "accepted" }), () => { throw new Error("plain"); }]) {
            const { ctx, seen, conn } = await setup({ replies: [reply as Reply, "ok"] });
            await expect(ctx.fns.models.call({ connectionId: conn.id, model: "m1", user: "hi" })).rejects.toThrow();
            expect(seen).toHaveLength(1);
        }
    });

    test("stops at three attempts and respects the deadline", async () => {
        const three = await setup({ replies: [fail({ retryAfterMs: 1 })] });
        await expect(three.ctx.fns.models.call({ connectionId: three.conn.id, model: "m1", user: "hi" })).rejects.toThrow("upstream");
        expect(three.seen).toHaveLength(3);
        const deadline = await setup({ replies: [fail({ retryAfterMs: 60000 })] });
        await expect(deadline.ctx.fns.models.call({ connectionId: deadline.conn.id, model: "m1", user: "hi", timeoutMs: 1000 })).rejects.toThrow("upstream");
        expect(deadline.seen).toHaveLength(1);
    });

    test("cancellation during the retry delay sends no further request", async () => {
        const { ctx, seen, conn } = await setup({ replies: [fail({ retryAfterMs: 5000 }), "ok"] });
        const ac = new AbortController();
        const pending = ctx.fns.models.call({ connectionId: conn.id, model: "m1", user: "hi", signal: ac.signal });
        setTimeout(() => ac.abort(), 20);
        await expect(pending).rejects.toThrow();
        expect(seen).toHaveLength(1);
    });
});

describe("models.call structured output", () => {
    const schema: types.models.ResponseFormat = { type: "json_schema", name: "r", schema: { type: "object", required: ["a"], properties: { a: { type: "number" } }, additionalProperties: false } };

    test("fallback instruction and fence stripping for providers without structuredOutput", async () => {
        const { ctx, seen, conn } = await setup({ replies: ["```json\n{\"a\":1}\n```"] });
        const r = await ctx.fns.models.call({ connectionId: conn.id, model: "m1", user: "hi", system: "sys", responseFormat: { type: "json_object" } });
        expect(r.text).toBe("{\"a\":1}");
        expect(seen[0]!.responseFormat).toBeUndefined();
        expect(seen[0]!.instructions.startsWith("sys\n\nRespond with only one valid JSON value")).toBe(true);
    });

    test("native format for providers declaring structuredOutput", async () => {
        const { ctx, seen, conn } = await setup({ capabilities: { structuredOutput: true }, replies: ["{\"a\":2}"] });
        const r = await ctx.fns.models.call({ connectionId: conn.id, model: "m1", user: "hi", responseFormat: schema });
        expect(r.text).toBe("{\"a\":2}");
        expect(seen[0]!.responseFormat).toEqual(schema);
        expect(seen[0]!.instructions).toBe("");
    });

    test("schema violations fail INVALID_OUTPUT without echoing the response", async () => {
        for (const text of ["{\"b\":1}", "{\"a\":1,\"secret-extra\":2}", "[1]", "not json"]) {
            const { ctx, conn } = await setup({ replies: [text] });
            const err = await ctx.fns.models.call({ connectionId: conn.id, model: "m1", user: "hi", responseFormat: schema }).catch((e: unknown) => e as { message?: string });
            expect(err).toMatchObject({ code: "INVALID_OUTPUT", retryable: false });
            expect(String(err.message)).not.toContain("secret-extra");
        }
    });
});
