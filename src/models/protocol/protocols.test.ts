import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../../_testCtx.entry";

let ctx: Context;
type Seen = { path: string; method: string; headers: Headers; body: any };
const seen: Seen[] = [];
const reply = { status: 200, body: "" as string, cancelled: false };
let server: ReturnType<typeof Bun.serve>;
beforeAll(async () => {
    ctx = await mkTestCtx();
    server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
        seen.push({ path: new URL(req.url).pathname, method: req.method, headers: req.headers, body: req.method === "POST" ? await req.json() : null });
        return new Response(reply.body, { status: reply.status, headers: { "content-type": "application/json" } });
    } });
}, 120000);
afterAll(() => server?.stop(true));

const catalogue = {
    "openai-chat": { data: [{ id: "mock" }, { id: "mock" }, null, { id: 3 }, { id: "two" }] },
    "openai-responses": { data: [{ id: "mock" }, { id: "two" }] },
    anthropic: { data: [{ id: "mock" }, "x", { id: "two" }] },
    gemini: { models: [{ name: "models/mock", displayName: "Mock" }, { name: 7 }, null, { name: "models/" }, { name: "two" }, { name: "models/two" }] },
} as Record<string, unknown>;
const probePath = { "openai-chat": "/chat/completions", "openai-responses": "/responses", anthropic: "/messages", gemini: "/models/mock:generateContent" } as Record<string, string>;
const field = { "openai-chat": "data", "openai-responses": "data", anthropic: "data", gemini: "models" } as Record<string, string>;

function endpoint(id: string, key: string | null, suffix = "") {
    const p = ctx.fns.models.protocol.get({ id });
    const headers = new Headers({ Accept: "application/json" });
    for (const [k, v] of Object.entries(p.defaultHeaders())) headers.set(k, v);
    if (key) for (const [k, v] of Object.entries(p.apiKeyHeaders(key))) headers.set(k, v);
    return { p, endpoint: { base: p.baseUrl(ctx, server.url.origin + suffix), headers: Object.fromEntries(headers) } };
}
const fetchVia = (url: string, init?: RequestInit) => fetch(url, init);

describe("shared protocols", () => {
    for (const id of ["openai-chat", "openai-responses", "anthropic", "gemini"]) {
        const prefix = id === "anthropic" ? "/v1" : id === "gemini" ? "/v1beta" : "";
        test(id + " discovery, probe path, headers and body", async () => {
            seen.length = 0;
            const { p, endpoint: e } = endpoint(id, "test-only-key");
            reply.status = 200; reply.body = JSON.stringify(catalogue[id]);
            expect(await p.listModels(ctx, { fetch: fetchVia, endpoint: e })).toEqual([{ id: "mock" }, { id: "two" }]);
            reply.body = "{}";
            await p.probe(ctx, { fetch: fetchVia, endpoint: e, model: "mock" });
            const [list, gen] = seen;
            expect(list!.method).toBe("GET");
            expect(list!.path).toBe(prefix + "/models");
            expect(gen!.method).toBe("POST");
            expect(gen!.path).toBe(prefix + probePath[id]);
            expect(gen!.headers.get("content-type")).toBe("application/json");
            for (const r of seen) {
                expect(r.headers.get("accept")).toBe("application/json");
                expect(r.headers.get("authorization")).toBe(id.startsWith("openai") ? "Bearer test-only-key" : null);
                expect(r.headers.get("x-api-key")).toBe(id === "anthropic" ? "test-only-key" : null);
                expect(r.headers.get("anthropic-version")).toBe(id === "anthropic" ? "2023-06-01" : null);
                expect(r.headers.get("x-goog-api-key")).toBe(id === "gemini" ? "test-only-key" : null);
            }
            if (id === "gemini") expect(gen!.body).toEqual({ contents: [{ role: "user", parts: [{ text: "Hi" }] }], generationConfig: { maxOutputTokens: 1 } });
            else if (id === "openai-responses") expect(gen!.body).toEqual({ model: "mock", input: "Hi", max_output_tokens: 1, stream: false });
            else expect(gen!.body).toEqual({ model: "mock", messages: [{ role: "user", content: "Hi" }], max_tokens: 1, stream: false });
        });
        test(id + " without a key sends no authentication", async () => {
            seen.length = 0;
            const { p, endpoint: e } = endpoint(id, null);
            reply.status = 200; reply.body = JSON.stringify(catalogue[id]);
            await p.listModels(ctx, { fetch: fetchVia, endpoint: e });
            const h = seen[0]!.headers;
            expect(h.get("authorization") ?? h.get("x-api-key") ?? h.get("x-goog-api-key")).toBeNull();
            expect(h.get("anthropic-version")).toBe(id === "anthropic" ? "2023-06-01" : null);
        });
        test(id + " empty model is rejected without a request", async () => {
            seen.length = 0;
            const { p, endpoint: e } = endpoint(id, "k");
            await expect(p.probe(ctx, { fetch: fetchVia, endpoint: e, model: "  " })).rejects.toThrow(/^A test model is required$/);
            expect(seen.length).toBe(0);
        });
        test(id + " aborted signal before and after the response", async () => {
            const { p, endpoint: e } = endpoint(id, "k");
            let calls = 0;
            const counting = async (u: string, i?: RequestInit) => { calls++; return fetchVia(u, i); };
            await expect(p.listModels(ctx, { fetch: counting, endpoint: e, signal: AbortSignal.abort() })).rejects.toThrow();
            await expect(p.probe(ctx, { fetch: counting, endpoint: e, model: "mock", signal: AbortSignal.abort() })).rejects.toThrow();
            expect(calls).toBe(0);
            for (const op of ["listModels", "probe"] as const) {
                const ac = new AbortController();
                const state = { cancelled: false };
                const late = async () => { ac.abort(); return new Response(new ReadableStream({ pull(c) { c.enqueue(new TextEncoder().encode(JSON.stringify(catalogue[id]))); }, cancel() { state.cancelled = true; } })); };
                const run = op === "listModels" ? p.listModels(ctx, { fetch: late, endpoint: e, signal: ac.signal }) : p.probe(ctx, { fetch: late, endpoint: e, model: "mock", signal: ac.signal });
                await expect(run).rejects.toThrow();
                expect(state.cancelled).toBe(true);
            }
        });
        test(id + " HTTP failures expose only the status", async () => {
            const { p, endpoint: e } = endpoint(id, "k");
            reply.status = 500; reply.body = "SENSITIVE-BODY";
            expect(((await p.listModels(ctx, { fetch: fetchVia, endpoint: e }).catch(x => x)) as Error).message).toBe("Model discovery request failed (HTTP 500)");
            expect(((await p.probe(ctx, { fetch: fetchVia, endpoint: e, model: "mock" }).catch(x => x)) as Error).message).toBe("Generation probe failed (HTTP 500)");
        });
        test(id + " malformed catalogues give only Invalid model catalogue and release the body", async () => {
            const { p, endpoint: e } = endpoint(id, "k");
            for (const body of ["{SENSITIVE-TEXT not json", "null", "{}", JSON.stringify({ [field[id]!]: { x: 1 } })]) {
                const response = new Response(body);
                const err = (await p.listModels(ctx, { fetch: async () => response, endpoint: e }).catch(x => x)) as Error;
                expect(err.message).toBe("Invalid model catalogue");
                expect(response.bodyUsed).toBe(true);
            }
        });
    }
    test("versioned bases", () => {
        const base = (id: string, raw: string) => ctx.fns.models.protocol.get({ id }).baseUrl(ctx, raw);
        expect(base("anthropic", "https://x.io/v1/")).toBe("https://x.io/v1");
        expect(base("anthropic", "https://x.io/v1beta")).toBe("https://x.io/v1beta/v1");
        expect(base("anthropic", "https://x.io/v2")).toBe("https://x.io/v2/v1");
        expect(base("gemini", "https://x.io/v1")).toBe("https://x.io/v1");
        expect(base("gemini", "https://x.io/v1beta/")).toBe("https://x.io/v1beta");
        expect(base("gemini", "https://x.io/v1alpha")).toBe("https://x.io/v1alpha/v1beta");
        expect(base("openai-chat", "https://x.io/v1/")).toBe("https://x.io/v1");
        expect(base("openai-responses", "https://x.io")).toBe("https://x.io");
        expect(() => base("gemini", "https://x.io/?")).toThrow(/^Invalid base URL$/);
    });
});

describe("models.protocol registry", () => {
    test("list returns the closed set in stable order", () => {
        expect(ctx.fns.models.protocol.list({})).toEqual([
            { id: "openai-chat", label: "OpenAI Chat Completions" },
            { id: "openai-responses", label: "OpenAI Responses" },
            { id: "anthropic", label: "Anthropic Messages" },
            { id: "gemini", label: "Gemini" },
        ]);
    });
    test("unknown ids are rejected without a request", () => {
        const before = seen.length;
        for (const id of ["openai", "", "toString", "__proto__", "constructor"]) expect(() => ctx.fns.models.protocol.get({ id })).toThrow(/^Unsupported protocol$/);
        expect(seen.length).toBe(before);
    });
    test("get returns a protocol whose id matches", () => {
        for (const { id } of ctx.fns.models.protocol.list({})) expect(ctx.fns.models.protocol.get({ id }).id).toBe(id);
    });
});
