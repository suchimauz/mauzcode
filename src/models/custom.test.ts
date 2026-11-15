import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import provider from "./$modelProvider_custom";

beforeAll(async () => { await mkTestCtx(); }, 120000);

async function fixture(protocol = "openai-chat", suffix = "") {
    const requests: { path: string; headers: Headers; body: any; method: string }[] = [];
    const state = { modelsStatus: 200, generationStatus: 200, malformed: false };
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
        const path = new URL(req.url).pathname;
        requests.push({ path, headers: req.headers, body: req.method === "POST" ? await req.json() : null, method: req.method });
        if (req.method === "POST") return Response.json({}, { status: state.generationStatus });
        return Response.json(state.malformed ? {} : protocol === "gemini" ? { models: [{ name: "models/mock", displayName: "Mock" }] } : { data: [{ id: "mock" }] }, { status: state.modelsStatus });
    } });
    const ctx = await mkTestCtx();
    ctx.state.models ??= {};
    ctx.state.models.providers = { custom: { owner: "core", module: "models", rel: "models/$modelProvider_custom.ts", definition: provider } };
    const conn: types.models.ResolvedConnection = {
        id: "fixture", provider: "custom", accountName: "mock", config: { baseUrl: server.url.origin + suffix, protocol, testModel: "mock", models: ["manual", "mock"] },
        secret: async key => key === "apiKey" ? "test-only-key" : null,
        fetch: async (url, init) => await fetch(url, init),
    };
    return { ctx, conn, requests, state, server };
}

async function viaProtocol(f: Awaited<ReturnType<typeof fixture>>, op: "models" | "generation") {
    const protocol = f.ctx.fns.models.protocol.get({ id: String(f.conn.config.protocol) });
    const endpoint = await f.ctx.fns.models.provider.custom.customEndpoint({ conn: f.conn, protocol });
    if (op === "models") return await protocol.listModels(f.ctx, { fetch: f.conn.fetch, endpoint });
    await protocol.probe(f.ctx, { fetch: f.conn.fetch, endpoint, model: String(f.conn.config.testModel) });
    return [];
}

describe("custom protocol local HTTP requests", () => {
    for (const protocol of ["openai-chat", "openai-responses", "anthropic", "gemini"]) {
        test(protocol + " discovery, authentication and minimal generation", async () => {
            const f = await fixture(protocol, protocol.startsWith("openai") ? "/v1/" : "");
            try {
                expect(await viaProtocol(f, "models")).toEqual([{ id: "mock" }]);
                await viaProtocol(f, "generation");
                const [models, gen] = f.requests;
                expect(models!.path).toBe(protocol === "gemini" ? "/v1beta/models" : "/v1/models");
                expect(models!.method).toBe("GET");
                expect(gen!.method).toBe("POST");
                for (const r of f.requests) {
                    expect(r.headers.get("accept")).toBe("application/json");
                    expect(r.headers.get("authorization")).toBe(protocol.startsWith("openai") ? "Bearer test-only-key" : null);
                    expect(r.headers.get("x-api-key")).toBe(protocol === "anthropic" ? "test-only-key" : null);
                    expect(r.headers.get("anthropic-version")).toBe(protocol === "anthropic" ? "2023-06-01" : null);
                    expect(r.headers.get("x-goog-api-key")).toBe(protocol === "gemini" ? "test-only-key" : null);
                }
                for (const r of f.requests) expect(r.headers.get("x-session-affinity")).toBeNull();
                expect(gen!.path).toBe(({ "openai-chat": "/v1/chat/completions", "openai-responses": "/v1/responses", anthropic: "/v1/messages", gemini: "/v1beta/models/mock:generateContent" })[protocol]!);
                if (protocol === "gemini") { expect(gen!.body.generationConfig.maxOutputTokens).toBe(1); expect(gen!.body.contents[0].parts[0].text).toBe("Hi"); }
                else { expect(gen!.body.model).toBe("mock"); expect(gen!.body[protocol === "openai-responses" ? "max_output_tokens" : "max_tokens"]).toBe(1); expect(gen!.body.stream).toBe(false); }
                expect(await provider.listModels!(f.ctx, f.conn)).toEqual([{ id: "mock" }, { id: "manual" }]);
                f.state.generationStatus = 401;
                expect((await provider.test(f.ctx, f.conn)).reason).toBe("generation-failed");
                f.state.modelsStatus = 500;
                expect((await provider.test(f.ctx, f.conn)).status).toBe("unavailable");
                for (const r of f.requests) expect(r.headers.get("x-session-affinity")).toBeNull();
            } finally { f.server.stop(true); }
        });
    }
    test("versioned bases, optional keys and malformed discovery", async () => {
        for (const [protocol, suffix] of [["anthropic", "/v1/"], ["gemini", "/v1beta/"], ["gemini", "/v1/"]]) {
            const f = await fixture(protocol, suffix);
            try {
                f.conn.secret = async () => null;
                await viaProtocol(f, "models");
                expect(f.requests[0]!.path).toBe(suffix + "models");
                expect(f.requests[0]!.headers.has("authorization")).toBe(false);
                expect(f.requests[0]!.headers.has("x-api-key")).toBe(false);
                expect(f.requests[0]!.headers.has("x-goog-api-key")).toBe(false);
                expect(f.requests[0]!.headers.get("anthropic-version")).toBe(protocol === "anthropic" ? "2023-06-01" : null);
                f.state.malformed = true;
                await expect(viaProtocol(f, "models")).rejects.toThrow("catalogue");
                await expect(provider.listModels!(f.ctx, f.conn)).rejects.toThrow("catalogue");
            } finally { f.server.stop(true); }
        }
    });
    test("protocol select options equal the shared protocol set in order", async () => {
        const f = await fixture();
        try {
            const field = provider.fields.find(x => x.key === "protocol") as { options?: { value: string; label: string }[] };
            expect(field.options!.map(o => ({ id: o.value, label: o.label }))).toEqual(f.ctx.fns.models.protocol.list({}));
        } finally { f.server.stop(true); }
    });
    test("anthropic without a key still sends anthropic-version on discovery and probe", async () => {
        const f = await fixture("anthropic");
        try {
            f.conn.secret = async () => null;
            expect((await provider.test(f.ctx, f.conn)).reason).toBe("generation-ok");
            expect(f.requests).toHaveLength(2);
            for (const r of f.requests) { expect(r.headers.get("anthropic-version")).toBe("2023-06-01"); expect(r.headers.has("x-api-key")).toBe(false); }
        } finally { f.server.stop(true); }
    });
    test("discovery failure without a test model returns models-failed without generation", async () => {
        const f = await fixture();
        try {
            delete f.conn.config.testModel;
            f.state.modelsStatus = 500;
            expect(await provider.test(f.ctx, f.conn)).toMatchObject({ status: "unavailable", reason: "models-failed" });
            expect(f.requests.map(r => r.method)).toEqual(["GET"]);
            f.state.modelsStatus = 200; f.requests.length = 0;
            expect(await provider.test(f.ctx, f.conn)).toMatchObject({ status: "available", reason: "models-ok" });
            expect(f.requests.map(r => r.method)).toEqual(["GET"]);
            f.conn.config.protocol = "other"; f.requests.length = 0;
            expect((await provider.test(f.ctx, f.conn)).reason).toBe("models-failed");
            f.conn.config.protocol = "openai-chat"; f.conn.config.baseUrl = "https://example.test?"; f.conn.config.testModel = "mock";
            expect((await provider.test(f.ctx, f.conn)).reason).toBe("models-failed");
            expect(f.requests).toHaveLength(0);
        } finally { f.server.stop(true); }
    });
});

describe("custom provider spec scenarios", () => {
    test("schema rejects unsupported protocol and invalid base URLs", async () => {
        const f = await fixture();
        try {
            await expect(f.ctx.fns.models.connections.validateConfig({ provider: "custom", config: { baseUrl: "https://example.test", protocol: "other" } })).rejects.toThrow();
            for (const baseUrl of ["relative", "ftp://example.test", "https://u:p@example.test", "https://example.test?q=1", "https://example.test#hash", "https://example.test?", "https://example.test#"]) {
                await expect(f.ctx.fns.models.connections.validateConfig({ provider: "custom", config: { baseUrl, protocol: "openai-chat" } })).rejects.toThrow();
            }
            expect(provider.transports).toEqual(["direct", "socks", "ssh-tunnel"]);
        } finally { f.server.stop(true); }
    });
    test("discovery merges manual ids, failure preserves them with error; no-model test and usage are status-only", async () => {
        const f = await fixture();
        try {
            const view = await f.ctx.fns.models.create({ provider: "custom", accountName: "test", config: { baseUrl: f.server.url.origin, protocol: "openai-chat", models: ["manual", "mock"] } });
            expect((await f.ctx.fns.models.listModels({ id: view.id })).models).toEqual([{ id: "mock", disabled: false }, { id: "manual", disabled: false }]);
            const status = await f.ctx.fns.models.test({ id: view.id });
            expect(status.status).toBe("available"); expect(status.reason).toBe("models-ok");
            const usage = await f.ctx.fns.models.usage({ id: view.id, refresh: true });
            expect(Object.keys(usage).sort()).toEqual(["checkedAt", "reason", "status"]);
            expect(usage.reason).toBe("models-ok");
            expect(f.requests.every(r => r.method === "GET")).toBe(true);
            f.state.modelsStatus = 503;
            const fallback = await f.ctx.fns.models.listModels({ id: view.id });
            expect(fallback.models).toEqual([{ id: "mock", disabled: false }, { id: "manual", disabled: false }]); expect(fallback.error).toBeFalsy(); expect(fallback.source).toBe("provider");
            const failed = await f.ctx.fns.models.listModels({ id: view.id, refresh: true });
            expect(failed.models).toEqual(fallback.models); expect(failed.error).toBeTruthy(); expect(failed.source).toBe("provider");
        } finally { f.server.stop(true); }
    });
    test("generation success and failure, models failure short-circuits generation", async () => {
        const f = await fixture();
        try {
            expect((await provider.test(f.ctx, f.conn)).reason).toBe("generation-ok");
            f.state.generationStatus = 500;
            expect(await provider.test(f.ctx, f.conn)).toMatchObject({ status: "unavailable", reason: "generation-failed" });
            f.state.modelsStatus = 500; f.requests.length = 0;
            expect((await provider.test(f.ctx, f.conn)).reason).toBe("models-failed");
            expect(f.requests).toHaveLength(1);
        } finally { f.server.stop(true); }
    });
    test("saved SOCKS connection sends discovery and generation through the selected proxy", async () => {
        const f = await fixture();
        try {
            const sent: any[] = [];
            const proxyId = "12345678-1234-4234-8234-123456789abc";
            await f.ctx.fns.procs.db.run({ sql: 'INSERT INTO socks_proxies(id,name,host,port,revision,created_at,updated_at) VALUES (?,?,?,?,1,?,?)', params: [proxyId, "custom-test-proxy", "127.0.0.1", 1080, Date.now(), Date.now()] });
            f.ctx.state.registry.socksProxy.validateIdentity = async () => {};
            f.ctx.state.registry.socksProxy.readSaved = async (_c: any, _s: any, opts: any) => { expect(opts.id).toBe(proxyId); return { host: "127.0.0.1", port: 1080 }; };
            f.ctx.state.registry.socksProxy.request = async (_c: any, _s: any, opts: any) => { sent.push(opts); return Response.json(opts.method === "POST" ? {} : { data: [{ id: "mock" }] }); };
            const view = await f.ctx.fns.models.create({ provider: "custom", accountName: "proxy", config: { baseUrl: "https://example.invalid/v1", protocol: "openai-chat", testModel: "mock" }, transport: { kind: "socks", proxyId } });
            expect(view.transport).toEqual({ kind: "socks", proxyId });
            expect((await f.ctx.fns.models.test({ id: view.id })).status).toBe("available");
            expect(sent).toHaveLength(2);
            expect(sent.every(r => r.proxy.host === "127.0.0.1" && r.proxy.port === 1080)).toBe(true);
            expect(sent.map(r => r.method)).toEqual(["GET", "POST"]);
            expect(f.requests).toHaveLength(0);
        } finally { f.server.stop(true); }
    });
    test("provider uses only connection-bound fetch without direct fallback", async () => {
        const f = await fixture();
        try {
            let calls = 0;
            f.conn.fetch = async () => { calls++; throw new Error("transport unavailable"); };
            expect((await provider.test(f.ctx, f.conn)).status).toBe("unavailable");
            expect(calls).toBe(1); expect(f.requests).toHaveLength(0);
        } finally { f.server.stop(true); }
    });
});

describe("custom provider streaming through shared protocols", () => {
    const frames: Record<string, unknown[]> = {
        "openai-chat": [{ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }, "[DONE]"],
        "openai-responses": [{ type: "response.output_text.delta", delta: "ok" }, { type: "response.completed", response: {} }],
        anthropic: [{ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }, { type: "message_delta", delta: { stop_reason: "end_turn" } }, { type: "message_stop" }],
        gemini: [{ candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] }],
    };
    for (const protocol of Object.keys(frames)) {
        test(protocol + " stream goes through the configured protocol with the API key", async () => {
            const seen: { path: string; auth: string | null; affinity: string | null; body: any }[] = [];
            const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
                seen.push({ path: new URL(req.url).pathname, auth: req.headers.get("authorization") ?? req.headers.get("x-api-key") ?? req.headers.get("x-goog-api-key"), affinity: req.headers.get("x-session-affinity"), body: await req.json() });
                const body = frames[protocol]!.map(f => "data: " + (typeof f === "string" ? f : JSON.stringify(f)) + "\n\n").join("");
                return new Response(body, { headers: { "content-type": "text/event-stream" } });
            } });
            try {
                const ctx = await mkTestCtx();
                const conn: types.models.ResolvedConnection = {
                    id: "fixture", provider: "custom", accountName: "mock", config: { baseUrl: server.url.origin, protocol },
                    secret: async key => key === "apiKey" ? "test-only-key" : null,
                    fetch: async (url, init) => await fetch(url, init),
                };
                const r = await provider.stream!(ctx, conn, { model: "mock", instructions: "sys", messages: [{ role: "user", content: "hi" }], sessionId: "s1", maxTokens: 5 });
                expect(r).toMatchObject({ text: "ok", finishReason: "stop" });
                expect(seen).toHaveLength(1);
                expect(seen[0]!.auth).toContain("test-only-key");
                expect(seen[0]!.affinity).toMatch(/^[0-9a-f]{32}$/);
                expect(seen[0]!.affinity).not.toContain("s1");
                await expect(provider.stream!(ctx, conn, { model: "mock", instructions: "", messages: [{ role: "user", content: "hi" }], sessionId: "s1", providerOptions: { x: 1 } })).rejects.toMatchObject({ code: "INVALID_INPUT" });
                expect(seen).toHaveLength(1);
            } finally { server.stop(true); }
        });
    }
});

describe("custom provider session affinity header", () => {
    const frames = "data: " + JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }) + "\n\ndata: [DONE]\n\n";
    async function harness() {
        const seen: (string | null)[] = [];
        const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
            seen.push(req.headers.get("x-session-affinity"));
            return new Response(frames, { headers: { "content-type": "text/event-stream" } });
        } });
        const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 21).toString("base64") } });
        await ctx.fns.procs.db.run({ sql: "DELETE FROM local_secrets WHERE namespace='models' AND name='session-affinity-salt'", params: [] });
        ctx.state.models ??= {};
        ctx.state.models.sessionAffinitySalt = undefined;
        const conn = (id: string, extra: Record<string, boolean> = {}): types.models.ResolvedConnection => ({
            id, provider: "custom", accountName: "mock", config: { baseUrl: server.url.origin, protocol: "openai-chat", ...extra },
            secret: async () => null, fetch: async (url, init) => await fetch(url, init),
        });
        const send = async (c: types.models.ResolvedConnection, sessionId: string, promptCacheKey?: string) => {
            await provider.stream!(ctx, c, { model: "mock", instructions: "", messages: [{ role: "user", content: "hi" }], sessionId, ...(promptCacheKey ? { promptCacheKey } : {}) });
            return seen.at(-1);
        };
        return { ctx, server, conn, send, seen };
    }

    test("stable per connection and key, differs across connections and keys, falls back to session id", async () => {
        const h = await harness();
        try {
            const a = h.conn("conn-a"), b = h.conn("conn-b");
            const first = await h.send(a, "child", "root");
            expect(first).toMatch(/^[0-9a-f]{32}$/);
            expect(await h.send(a, "other", "root")).toBe(first!);
            h.ctx.state.models!.sessionAffinitySalt = undefined;
            expect(await h.send(a, "child", "root")).toBe(first!);
            expect(await h.send(b, "child", "root")).not.toBe(first!);
            expect(await h.send(a, "child", "fresh")).not.toBe(first!);
            expect(await h.send(a, "root")).toBe(first!);
            expect(await h.send(a, "child")).not.toBe(first!);
        } finally { h.server.stop(true); }
    });

    test("absent when disabled, present when the field is missing", async () => {
        const h = await harness();
        try {
            expect(await h.send(h.conn("c", { sessionAffinity: false }), "s1")).toBeNull();
            expect(await h.send(h.conn("c", { sessionAffinity: true }), "s1")).toMatch(/^[0-9a-f]{32}$/);
            expect(await h.send(h.conn("c"), "s1")).toMatch(/^[0-9a-f]{32}$/);
        } finally { h.server.stop(true); }
    });

    test("concurrent first calls store one salt; an undecryptable salt is replaced", async () => {
        const h = await harness();
        try {
            const values = await Promise.all([1, 2, 3].map(async () => {
                h.ctx.state.models!.sessionAffinitySalt = undefined;
                return await h.ctx.fns.models.provider.custom.sessionAffinity({ connectionId: "c", key: "k" });
            }));
            expect(new Set(values).size).toBe(1);
            const rows = await h.ctx.fns.procs.db.select({ sql: "SELECT count(*)::int AS n FROM local_secrets WHERE namespace='models' AND name='session-affinity-salt'", params: [] }) as any[];
            expect(rows[0].n).toBe(1);
            await h.ctx.fns.procs.db.run({ sql: "UPDATE local_secrets SET value_enc='broken' WHERE namespace='models' AND name='session-affinity-salt'", params: [] });
            h.ctx.state.models!.sessionAffinitySalt = undefined;
            const replaced = await h.ctx.fns.models.provider.custom.sessionAffinity({ connectionId: "c", key: "k" });
            expect(replaced).toMatch(/^[0-9a-f]{32}$/);
            expect(replaced).not.toBe(values[0]);
        } finally { h.server.stop(true); }
    });
});
