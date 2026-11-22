import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import codex from "./$modelProvider_codex";

// SDK-only Codex parity suite: every legacy inference/agent namespace is replaced by a throwing stub,
// so any direct or transitive call into it fails the test. Requests are captured at conn.fetch.

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const ACCOUNT = "acct-123";
const TOKEN = `h.${b64({ exp: Math.floor(Date.now() / 1000) + 3600, "https://api.openai.com/auth": { chatgpt_account_id: ACCOUNT } })}.s`;
const ID_TOKEN = `h.${b64({ "https://api.openai.com/auth": { chatgpt_account_id: ACCOUNT } })}.s`;
const LEGACY = ["llm", "llms", "agent", "session", "codexAccount", "sshAccount"];

type Call = { url: string; method: string; headers: Record<string, string>; body: string; transport: types.models.TransportSpec; signal?: AbortSignal };
type Reply = Response | (() => Response | Promise<Response>);

const sse = (events: unknown[], headers: Record<string, string> = {}, raw = "") =>
    new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join("") + raw, { headers: { "content-type": "text/event-stream", ...headers } });
const done = (extra: Record<string, unknown> = {}) => ({ type: "response.completed", response: { id: "r1", status: "completed", usage: { input_tokens: 1, output_tokens: 1 }, ...extra } });

async function setup(opts: { transport?: types.models.TransportSpec; config?: Record<string, string>; models?: unknown[] } = {}) {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") } });
    ctx.state.models ??= {};
    ctx.state.models.providers = { codex: { owner: "core", module: "models", rel: "models/$modelProvider_codex.ts", definition: codex } };
    ctx.state.models.health = {};
    ctx.state.models.codexRefresh = {};
    ctx.state.models.loginFlows = {};
    const legacy: string[] = [];
    for (const ns of LEGACY) for (const name of Object.keys(ctx.state.registry[ns] ?? {})) {
        // This is the transaction participant for cache/auth invalidation, not legacy chat dispatch.
        if (ns === "session" && name === "reconcileCodexControls") continue;
        ctx.state.registry[ns][name] = () => { legacy.push(`${ns}.${name}`); throw new Error(`legacy ${ns}.${name} called`); };
    }
    const calls: Call[] = [];
    const replies: Reply[] = [];
    ctx.state.registry.models.transport.validateTransport = async (_c: unknown, _s: unknown, o: { transport: types.models.TransportSpec }) => o.transport;
    ctx.state.registry.models.transport.fetch = async (_c: unknown, _s: unknown, o: { transport: types.models.TransportSpec; url: string; init?: RequestInit }) => {
        const record = (body: string) => { calls.push({ url: o.url, method: o.init?.method ?? "GET", headers: Object.fromEntries(new Headers(o.init?.headers).entries()), body, transport: o.transport, signal: o.init?.signal ?? undefined }); };
        const admit = o.init && ctx.state.models?.codexHandoff?.get(o.init);
        if (admit) await admit(record); else record(String(o.init?.body ?? ""));
        if (o.url.includes("/codex/models")) return Response.json({ models: opts.models ?? [] });
        const r = replies.shift();
        if (!r) return new Response("no reply queued", { status: 500 });
        return typeof r === "function" ? r() : r;
    };
    const view = await ctx.fns.models.create({ provider: "codex", accountName: "me", config: opts.config ?? {}, secrets: {}, transport: opts.transport ?? { kind: "direct" } });
    const { conn } = await ctx.fns.models.connections.resolve({ id: view.id });
    const intent = crypto.randomUUID();
    await ctx.fns.procs.db.run({sql:'UPDATE llm_connections SET codex_login_intent=? WHERE id=?',params:[intent,conn.id]});
    await ctx.fns.models.provider.codex.codexAuth({ conn, op: "store", intent, tokens: { id_token: ID_TOKEN, access_token: TOKEN, refresh_token: "rt-SECRET" } });
    const stream = (o: Partial<Parameters<typeof ctx.fns.models.stream>[0]> = {}): Promise<types.models.StreamResult> =>
        ctx.fns.models.stream({ connectionId: view.id, model: "gpt-5", instructions: "sys", messages: [{ role: "user", content: "hi" }], sessionId: "s1", ...o });
    return { ctx, calls, replies, view, legacy, stream };
}

let spawn: ReturnType<typeof spyOn> | undefined;
beforeAll(async () => { await mkTestCtx(); }, 60000);
afterEach(() => { spawn?.mockRestore(); spawn = undefined; });

describe("codex SDK request parity", () => {
    test("golden prepared tool conversation: URL, method, headers and body", async () => {
        const { calls, replies, legacy, stream } = await setup();
        replies.push(sse([done()]));
        const tools = [{ name: "read", description: "Read", parameters: { type: "object", properties: { path: { type: "string" } } } }];
        await stream({
            messages: [
                { role: "system", content: "ignored by stream instructions" },
                { role: "user", content: [{ type: "text", text: "look" }, { type: "image", data: "AAA", mimeType: "image/png" }, { type: "document", fileName: "a.pdf", extractedText: "pdf text" }] },
                { role: "assistant", content: "calling", tool_calls: [{ id: "c1", name: "read", args: { path: "x" } }, { id: "c2", name: "read", args: { path: "y" } }] },
                { role: "tool", tool_call_id: "c1", content: "X" },
                { role: "tool", tool_call_id: "c2", content: [{ type: "image", data: "BBB", mimeType: "image/jpeg" }] },
            ],
            tools, reasoningEffort: "high",
        });
        const call = calls.at(-1)!;
        expect(call.url).toBe("https://chatgpt.com/backend-api/codex/responses");
        expect(call.method).toBe("POST");
        expect(call.headers).toEqual({
            authorization: `Bearer ${TOKEN}`, "chatgpt-account-id": ACCOUNT, originator: "codex_cli_rs", version: "0.157.1",
            "openai-beta": "responses=experimental", accept: "text/event-stream", "content-type": "application/json",
            session_id: "s1", "x-client-request-id": "s1",
        });
        expect(JSON.parse(call.body)).toEqual({
            model: "gpt-5", store: false, stream: true, instructions: "sys",
            input: [
                { type: "message", role: "user", content: [{ type: "input_text", text: "look" }, { type: "input_image", detail: "auto", image_url: "data:image/png;base64,AAA" }, { type: "input_text", text: "[Attached PDF: a.pdf]\n\npdf text" }] },
                { type: "message", role: "assistant", content: [{ type: "output_text", text: "calling" }] },
                { type: "function_call", call_id: "c1", name: "read", arguments: "{\"path\":\"x\"}" },
                { type: "function_call", call_id: "c2", name: "read", arguments: "{\"path\":\"y\"}" },
                { type: "function_call_output", call_id: "c1", output: "X" },
                { type: "function_call_output", call_id: "c2", output: "(image attached below)" },
                { type: "message", role: "user", content: [{ type: "input_image", detail: "auto", image_url: "data:image/jpeg;base64,BBB" }] },
            ],
            prompt_cache_key: "s1",
            reasoning: { effort: "high", summary: "auto" }, tools: tools.map(t => ({ type: "function", ...t, strict: false })), parallel_tool_calls: true,
        });
        expect(legacy).toEqual([]);
    });

    test("version override, no CLI or shell lookup", async () => {
        spawn = spyOn(Bun, "spawnSync");
        const { calls, replies, ctx, view, stream } = await setup({ config: { clientVersion: "1.2.3" }, models: [{ slug: "gpt-5" }] });
        replies.push(sse([done()]));
        await stream({});
        await ctx.fns.models.listModels({ id: view.id, refresh: true });
        expect(calls.every(c => c.headers.version === "1.2.3" || c.url.endsWith("client_version=1.2.3"))).toBe(true);
        expect(spawn).not.toHaveBeenCalled();
    });

    test("structured output maps responseFormat to text.format", async () => {
        const { calls, replies, stream } = await setup();
        replies.push(sse([done()]), sse([done()]));
        await stream({ responseFormat: { type: "json_schema", name: "r", schema: { type: "object" } } });
        expect(JSON.parse(calls.at(-1)!.body).text).toEqual({ format: { type: "json_schema", name: "r", schema: { type: "object" }, strict: true } });
        await expect(stream({ providerOptions: { x: 1 } })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(replies).toHaveLength(1);
    });

    test("trusted upstream tier captures on both SDK paths; independent verbosity, format and max", async () => {
        const evidence = await Bun.file(`${import.meta.dir}/fixtures/codex-controls/0.170.0.json`).json();
        const { ctx, view, calls, stream, replies } = await setup({ models: [{ ...evidence.bundledModelExcerpt, slug: "gpt-5", service_tiers: [...evidence.bundledModelExcerpt.service_tiers, ...evidence.upstreamUltrafastTestModelOverride.service_tiers], supported_reasoning_levels: ["high", "max"], default_reasoning_level: "future" }] });
        await ctx.fns.models.listModels({ id: view.id, refresh: true });
        for (const sdk of ["stream", "call"]) for (const [index, speed] of ["standard", "fast", "ultrafast"].entries()) {
            for (const verbosity of ["default", "low", "medium", "high"]) {
                const responseFormat = { type: "json_schema" as const, name: "obj", schema: { type: "object" } };
                const options = { providerOptions: { speed, verbosity }, reasoningEffort: speed === "standard" ? "auto" : "max", responseFormat };
                replies.push(sse([{ type: "response.output_text.delta", delta: "{}" }, done()]));
                if (sdk === "stream") await stream(options);
                else await ctx.fns.models.call({ connectionId: view.id, model: "gpt-5", user: "go", ...options });
                const wire = JSON.parse(calls.at(-1)!.body);
                expect(wire.service_tier).toBe(evidence.capturedRequests[index].service_tier);
                expect(wire.text).toEqual({ format: { ...responseFormat, strict: true }, ...(verbosity === "default" ? {} : { verbosity }) });
                expect(wire.reasoning).toEqual(speed === "standard" ? undefined : { effort: "max", summary: "auto" });
            }
        }
        expect(calls.every(call => call.headers["chatgpt-account-id"] === ACCOUNT)).toBe(true);
    });

    test.each(["explicit", "default", "unknown"])("generation change during authentication: %s", async mode => {
        const { ctx, view, calls, replies, stream } = await setup({ models: [{ slug: "gpt-5", additional_speed_tiers: ["fast"] }] });
        await ctx.fns.models.listModels({ id: view.id, refresh: true });
        const provider = ctx.state.registry.models.provider.codex;
        const wireAuth = provider.codexWireAuth;
        let changed = false;
        provider.codexWireAuth = async (c: Context, s: Session | null, o: {conn: types.models.ResolvedConnection}) => {
            if (!changed) {
                changed = true;
                const intent = crypto.randomUUID();
                await ctx.fns.procs.db.run({ sql: 'UPDATE llm_connections SET codex_login_intent=? WHERE id=?', params: [intent,view.id] });
                const claims = { exp: Math.floor(Date.now()/1000)+3600, ...(mode === 'unknown' ? {} : { 'https://api.openai.com/auth': { chatgpt_account_id: 'B', organizations: ['A','B'] } }) };
                await ctx.fns.models.provider.codex.codexAuth({ conn: o.conn, op: 'store', intent, tokens: { access_token: `h.${b64(claims)}.s` } });
                await ctx.fns.models.listModels({ id:view.id, refresh:true });
            }
            return wireAuth(c,s,o);
        };
        replies.push(sse([done()]),sse([done()]));
        if (mode === 'explicit') {
            await expect(ctx.fns.models.call({connectionId:view.id,model:'gpt-5',user:'hi',providerOptions:{speed:'fast'}})).rejects.toMatchObject({code:'INVALID_INPUT'});
            expect(calls.filter(c => c.url.endsWith('/responses'))).toHaveLength(0);
        } else {
            await stream();
            await ctx.fns.models.call({connectionId:view.id,model:'gpt-5',user:'hi'});
            expect(calls.slice(1).map(c => c.headers['chatgpt-account-id'])).toEqual(Array(3).fill(mode === 'unknown' ? undefined : 'B'));
            expect(calls.filter(c => c.url.endsWith('/responses')).map(c => [JSON.parse(c.body).service_tier, JSON.parse(c.body).text?.verbosity])).toEqual([[undefined,undefined],[undefined,undefined]]);
        }
    });

    test("explicit unusable reasoning list never falls back or sends inference", async () => {
        const { ctx, view, calls, stream } = await setup({models:[{slug:'gpt-5',supported_reasoning_levels:['ultra']}]});
        await ctx.fns.models.listModels({id:view.id,refresh:true});
        await expect(stream({reasoningEffort:'high'})).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});
        expect(calls.filter(c => c.url.endsWith('/responses'))).toHaveLength(0);
    });

    test.each(["switch", "relogin", "paid", "unknown", "renew"])("retry fence: %s", async scenario => {
            const { ctx, view, calls, replies } = await setup({ models: [{ slug: "gpt-5", additional_speed_tiers: ["fast"] }] });
            const { conn } = await ctx.fns.models.connections.resolve({ id: view.id });
            const login = async (account: string | null) => {
                const intent = crypto.randomUUID();
                await ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET codex_login_intent=? WHERE id=?", params: [intent, view.id] });
                const token = `h.${b64({ exp: Math.floor(Date.now()/1000)+3600, ...(account ? { "https://api.openai.com/auth": { chatgpt_account_id: account } } : {}) })}.s`;
                await ctx.fns.models.provider.codex.codexAuth({ conn, op: "store", intent, tokens: { access_token: token, refresh_token: "fixture" } });
            };
            if (scenario === "unknown") await login(null);
            await ctx.fns.models.listModels({ id: view.id, refresh: true });
            const backoff = Promise.withResolvers<void>();
            const decide = ctx.state.registry.models.inference.retryDecision;
            ctx.state.registry.models.inference.retryDecision = (c: Context, s: Session | null, o: Parameters<typeof ctx.fns.models.inference.retryDecision>[0]) => {
                const result = decide(c, s, o);
                backoff.resolve();
                return { ...result, delayMs: 250 };
            };
            replies.push(new Response("rate limit", { status: 429 }), sse([done()]));
            const request = ctx.fns.models.call({ connectionId: view.id, model: "gpt-5", user: "hello", ...(scenario === "paid" ? { providerOptions: { speed: "fast" } } : scenario === "relogin" ? { providerOptions: { speed: "standard", verbosity: "default" } } : {}) });
            void request.catch(() => {});
            await backoff.promise;
            if (scenario === "renew") {
                // Model a verified same-account renewal's committed credential revision.
                await ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET codex_credential_revision=codex_credential_revision+1 WHERE id=?", params: [view.id] });
            } else {
                await login(scenario === "relogin" ? ACCOUNT : "account-B");
                await ctx.fns.models.listModels({ id: view.id, refresh: true });
            }
            if (scenario === "renew") expect((await request).attempts).toBe(2);
            else await expect(request).rejects.toMatchObject({ code: scenario === "unknown" ? "RATE_LIMITED" : "INVALID_INPUT" });
            const posts = calls.filter(call => call.url.endsWith("/responses"));
            expect(posts).toHaveLength(scenario === "renew" ? 2 : 1);
            expect(posts.every(call => call.headers["chatgpt-account-id"] === (scenario === "unknown" ? undefined : ACCOUNT))).toBe(true);
    });

    test("tier rejection is not replayed and does not mutate catalogue", async () => {
        const { ctx, view, calls, replies } = await setup({ models: [{ slug: "gpt-5", additional_speed_tiers: ["fast"] }] });
        await ctx.fns.models.listModels({ id: view.id, refresh: true });
        const cache = () => ctx.fns.procs.db.select({ sql: "SELECT models_cache,models_published_ticket FROM llm_connections WHERE id=?", params: [view.id] });
        const before = await cache();
        replies.push(Response.json({error:{code:"unsupported_service_tier"}}, {status:400}));
        await expect(ctx.fns.models.call({ connectionId:view.id,model:"gpt-5",user:"hello",providerOptions:{speed:"fast"} })).rejects.toMatchObject({code:"INVALID_INPUT",failure:{retryable:false}});
        expect(calls.filter(call => call.url.endsWith("/responses"))).toHaveLength(1);
        expect(await cache()).toEqual(before);
    });

    test("malformed and unadvertised overrides never reach authentication or transport", async () => {
        const { ctx, view, calls, stream } = await setup();
        let authCalls = 0;
        ctx.state.registry.models.provider.codex.codexWireAuth = () => { authCalls++; throw Error("unexpected auth"); };
        for (const providerOptions of [null, [], 1, "fast", { bogus: 1 }, { speed: "priority" }, { speed: "fast" }, { verbosity: "medium" }, { verbosity: false }] as any[]) {
            await expect(stream({ providerOptions })).rejects.toMatchObject({ code: "INVALID_INPUT", failure: { retryable: false } });
            await expect(ctx.fns.models.call({ connectionId: view.id, model: "gpt-5", user: "go", providerOptions })).rejects.toMatchObject({ code: "INVALID_INPUT", failure: { retryable: false } });
        }
        expect(authCalls).toBe(0);
        expect(calls).toHaveLength(0);
    });

    test("malformed tool arguments are an explicit parse failure; framing across chunks and CRLF", async () => {
        const { replies, stream } = await setup();
        const frames = [
            { type: "response.output_text.delta", delta: "a" },
            { type: "response.output_item.done", item: { type: "function_call", call_id: "c9", name: "x", arguments: "{bad" } },
            done(),
        ].map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join("");
        const bytes = new TextEncoder().encode(frames);
        replies.push(new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close(); } })));
        const r = await stream({});
        expect(r.text).toBe("a");
        expect(r.toolCalls).toEqual([{ id: "c9", name: "x", args: { __unparsed: "{bad" } }]);
        expect(r.finishReason).toBe("tool_calls");
    });
});

describe("cache identity and sticky routing", () => {
    test("promptCacheKey is independent of session correlation; omission falls back to sessionId", async () => {
        const { calls, replies, stream } = await setup();
        replies.push(sse([done()]), sse([done()]), sse([done()]));
        await stream({ sessionId: "child-a", promptCacheKey: "root" });
        await stream({ sessionId: "child-b", promptCacheKey: "root" });
        await stream({ sessionId: "solo" });
        const seen = calls.map(c => [JSON.parse(c.body).prompt_cache_key, c.headers.session_id, c.headers["x-client-request-id"]]);
        expect(seen).toEqual([["root", "child-a", "child-a"], ["root", "child-b", "child-b"], ["solo", "solo", "solo"]]);
    });

    test("first turn-state token of a run is replayed and kept; new run, absent token and no runId send none", async () => {
        const { calls, replies, stream } = await setup();
        replies.push(sse([done()], { "x-codex-turn-state": "T1" }), sse([done()], { "x-codex-turn-state": "T2" }), sse([done()]), sse([done()], { "x-codex-turn-state": "T9" }));
        const first = await stream({ runId: "run1" });
        expect(first.state).toMatchObject({ provider: "codex", sessionId: "s1", runId: "run1", data: { turnState: "T1" } });
        expect(calls[0]!.headers["x-codex-turn-state"]).toBeUndefined();
        const second = await stream({ runId: "run1", state: first.state });
        expect(calls[1]!.headers["x-codex-turn-state"]).toBe("T1");
        expect(second.state!.data.turnState).toBe("T1");
        const fresh = await stream({ runId: "run2" });
        expect(calls[2]!.headers["x-codex-turn-state"]).toBeUndefined();
        expect(fresh.state).toBeUndefined();
        const noRun = await stream({});
        expect(calls[3]!.headers["x-codex-turn-state"]).toBeUndefined();
        expect(noRun.state).toBeUndefined();
    });

    test("foreign or malformed state is rejected before network", async () => {
        const { calls, replies, view, stream } = await setup();
        replies.push(sse([done()], { "x-codex-turn-state": "T1" }));
        const { state } = await stream({ runId: "r" });
        const n = calls.length;
        for (const [o, msg] of [
            [{ runId: "other", state }, /another provider, connection, session or run/],
            [{ runId: "r", sessionId: "s2", state }, /another/],
            [{ runId: "r", state: { ...state!, connectionId: "x" } }, /another/],
            [{ runId: "r", state: { ...state!, provider: "claude" } }, /another/],
            [{ state }, /requires runId/],
            [{ runId: "r", state: { ...state!, data: { turnState: 5 } } }, /Malformed/],
        ] as const) await expect(stream(o as never)).rejects.toMatchObject({ code: "INVALID_INPUT", message: expect.stringMatching(msg) });
        expect(calls.length).toBe(n);
        expect(view.provider).toBe("codex");
    });
});

describe("reasoning normalization", () => {
    const cases: [types.models.ReasoningLevel | 'auto' | undefined, string][] = [[undefined, "medium"], ["auto", "medium"], ["off", "none"], ["low", "low"], ["xhigh", "high"]];
    test.each(cases)("gpt-5 profile: %p → %p", async (pref, wire) => {
        const { calls, replies, stream } = await setup();
        replies.push(sse([done()]));
        const r = await stream({ reasoningEffort: pref });
        expect(JSON.parse(calls.at(-1)!.body).reasoning).toEqual({ effort: wire, summary: "auto" });
        expect(r.reasoning!.requested).toBe(pref ?? "auto");
    });

    test("off on a low-floor model falls back up; metadata wins over profile; caller preference preserved", async () => {
        const { calls, replies, ctx, view, stream } = await setup({ models: [{ slug: "gpt-6", supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }], default_reasoning_level: "high" }] });
        await ctx.fns.models.listModels({ id: view.id, refresh: true });
        replies.push(sse([done()]), sse([done()]));
        const req = { model: "gpt-6", reasoningEffort: "off" };
        const r = await stream(req);
        expect(req.reasoningEffort).toBe("off");
        expect(r.reasoning).toEqual({ requested: "off", applied: "low", fallbackReason: "off is unsupported by gpt-6; using low", source: "metadata" });
        await stream({ model: "gpt-6", reasoningEffort: "medium" });
        expect(calls.filter(c => c.url.endsWith("/responses")).map(c => JSON.parse(c.body).reasoning.effort)).toEqual(["low", "low"]);
    });

    test("unknown model, invalid preference and invalid metadata fail before inference", async () => {
        const { calls, stream, ctx } = await setup();
        await expect(stream({ model: "mystery-1" })).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
        await expect(stream({ reasoningEffort: "turbo" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(() => ctx.fns.models.inference.resolveReasoning({ model: "m", metadata: { supported: [], default: "low" } })).toThrow(/nonempty/);
        expect(() => ctx.fns.models.inference.resolveReasoning({ model: "m", metadata: { supported: ["low"], default: "high" } })).toThrow(/default/);
        expect(() => ctx.fns.models.inference.resolveReasoning({ model: "m", metadata: { supported: ["low", "low"], default: "low" } })).toThrow(/unique/);
        expect(calls.filter(c => c.url.endsWith("/responses")).length).toBe(0);
    });
});

describe("checkpoints", () => {
    test("compact → JSON round trip → next stream places the native item at its boundary", async () => {
        const { calls, replies, ctx, view, stream } = await setup();
        replies.push(sse([{ type: "response.output_item.done", item: { type: "compaction", id: "cmp1", encrypted_content: "ENC-SECRET" } }, done({ id: "resp-c" })]));
        const compacted = await ctx.fns.models.compact({ connectionId: view.id, model: "gpt-5", instructions: "sys", messages: [{ role: "user", content: "old" }], sessionId: "s1" });
        const compactBody = JSON.parse(calls.at(-1)!.body);
        expect(compactBody).toMatchObject({ tools: [], tool_choice: "auto", parallel_tool_calls: false, reasoning: { effort: "medium", summary: "auto" }, store: false, stream: true, include: [] });
        expect(compactBody.input.at(-1)).toEqual({ type: "compaction_trigger" });
        const meta = JSON.parse(calls.at(-1)!.headers["x-codex-turn-metadata"]!);
        expect(meta).toMatchObject({ session_id: "s1", thread_id: "s1", request_kind: "compaction", compaction: { trigger: "manual", reason: "user_requested", implementation: "remote", phase: "standalone_turn", strategy: "memento" } });
        const restored = JSON.parse(JSON.stringify(compacted.checkpoint)) as types.models.Checkpoint;
        // Replace the loaded verifier module in this isolated context, retaining only the durable test DB key.
        const freshModule = await import(new URL('./provider/codex/codexBindOpaque.ts?reload', import.meta.url).href);
        ctx.state.registry.models.provider.codex.codexBindOpaque = freshModule.default;
        const before=calls.length;
        for (const bad of [{...restored,binding:undefined}, {...restored,payload:{...restored.payload,encrypted_content:'substituted'}}, {...restored,payload:{...restored.payload,id:'changed'}}]) {
            await expect(stream({messages:[{type:'checkpoint',checkpoint:bad}]})).rejects.toMatchObject({code:'INVALID_INPUT'});
        }
        expect(calls.length).toBe(before);
        replies.push(sse([done()]));
        await stream({ messages: [{ type: "checkpoint", checkpoint: restored }, { role: "user", content: "next" }] });
        expect(JSON.parse(calls.at(-1)!.body).input).toEqual([
            { type: "compaction", id: "cmp1", encrypted_content: "ENC-SECRET" },
            { type: "message", role: "user", content: [{ type: "input_text", text: "next" }] },
        ]);
    });

    test('late sticky and checkpoint responses remain scoped to A after B replaces A', async () => {
        const { calls, replies, ctx, view, stream } = await setup();
        const compact = () => ctx.fns.models.compact({connectionId:view.id,model:'gpt-5',sessionId:'s1',instructions:'',messages:[]});
        const first = Promise.withResolvers<Response>(), second = Promise.withResolvers<Response>();
        const entered1 = Promise.withResolvers<void>(), entered2 = Promise.withResolvers<void>();
        replies.push(() => { entered1.resolve(); return first.promise; }, () => { entered2.resolve(); return second.promise; });
        const pendingState = stream({runId:'r'}); await entered1.promise;
        const pendingCheckpoint = compact(); await entered2.promise;
        await ctx.fns.procs.db.run({sql:'UPDATE llm_connections SET codex_generation=?,codex_credential_revision=codex_credential_revision+1 WHERE id=?',params:[crypto.randomUUID(),view.id]});
        first.resolve(sse([done()], {'x-codex-turn-state':'private-token'}));
        second.resolve(sse([{type:'response.output_item.done',item:{type:'compaction',encrypted_content:'private-item'}}, done()]));
        const {state} = await pendingState, {checkpoint} = await pendingCheckpoint;
        expect(state?.binding).toMatch(/^[a-f0-9]{64}$/); expect(checkpoint?.binding).toMatch(/^[a-f0-9]{64}$/);
        const before=calls.length;
        expect(await ctx.fns.models.canReplayCodex({connectionId:view.id,model:'gpt-5',state})).toBe(false);
        await expect(stream({runId:'r',state})).rejects.toMatchObject({code:'INVALID_INPUT'});
        await expect(stream({messages:[{type:'checkpoint',checkpoint:checkpoint!}]})).rejects.toMatchObject({code:'INVALID_INPUT'});
        expect(calls.length).toBe(before);
        replies.push(sse([done()],{'x-codex-turn-state':'new-token'})); const fresh=(await stream({runId:'r'})).state!;
        const count=calls.length;
        for (const altered of [{...fresh,binding:undefined}, {...fresh,data:{turnState:'private-token'}}, {...fresh,runId:'r2'}]) {
            await expect(stream({runId:altered.runId,state:altered})).rejects.toMatchObject({code:'INVALID_INPUT'});
        }
        expect(calls.length).toBe(count);
        await ctx.fns.procs.db.run({sql:'UPDATE llm_connections SET codex_generation=NULL WHERE id=?',params:[view.id]});
        replies.push(sse([done()],{'x-codex-turn-state':'unknown-token'})); expect((await stream({runId:'r'})).state).toBeUndefined();
        const unknownCount=calls.length; await expect(compact()).rejects.toMatchObject({code:'INVALID_INPUT'}); expect(calls.length).toBe(unknownCount);
    });

    test("invalid checkpoint input is rejected before network without echoing payload", async () => {
        const { calls, view, stream } = await setup();
        const good: types.models.Checkpoint = { kind: "native-checkpoint", version: 1, provider: "codex", connectionId: view.id, model: "gpt-5", payload: { type: "compaction", encrypted_content: "ENC-SECRET" } };
        const bad = [
            { ...good, model: "gpt-6" }, { ...good, connectionId: "other" }, { ...good, provider: "claude" }, { ...good, version: 2 },
            { ...good, payload: { type: "compaction", encrypted_content: "" } }, { ...good, payload: { type: "message" } },
        ];
        for (const checkpoint of bad) {
            const err = await stream({ messages: [{ type: "checkpoint", checkpoint } as never] }).catch(e => e);
            expect(err.code).toBe("INVALID_INPUT");
            expect(JSON.stringify({ m: err.message, f: err.failure })).not.toContain("ENC-SECRET");
        }
        await expect(stream({ messages: [{ role: "assistant", message_type: "codex_compaction", content: "{}" }] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(calls.filter(c => c.url.endsWith("/responses")).length).toBe(0);
    });

    test("invalid compaction responses never look successful", async () => {
        const { replies, ctx, view } = await setup();
        const item = (e: unknown) => ({ type: "response.output_item.done", item: { type: "compaction", encrypted_content: e } });
        replies.push(
            sse([item("A"), item("B"), done()]),
            sse([done()]),
            sse([item(""), done()]),
            sse([item(42), done()]),
            sse([item("A"), { type: "response.completed", response: {} }]),
            sse([item("A")]),
        );
        const compact = () => ctx.fns.models.compact({ connectionId: view.id, model: "gpt-5", instructions: "", messages: [], sessionId: "s1" });
        await expect(compact()).rejects.toThrow(/multiple/);
        await expect(compact()).rejects.toThrow(/no valid checkpoint/);
        await expect(compact()).rejects.toThrow(/no valid checkpoint/);
        await expect(compact()).rejects.toThrow(/no valid checkpoint/);
        await expect(compact()).rejects.toThrow(/response id/);
        await expect(compact()).rejects.toMatchObject({ code: "TRANSPORT", failure: { acceptance: "uncertain", replaySafe: false } });
    });
});

describe("failures and observations", () => {
    test("HTTP classification: 401, quota, throttling, 5xx, 400 — exactly one request each, no body leak", async () => {
        const { calls, replies, ctx, view, stream } = await setup();
        replies.push(
            Response.json({ error: { type: "usage_limit_reached", resets_in_seconds: 60 } }, { status: 429 }),
            new Response("slow down", { status: 429, headers: { "retry-after": "5" } }),
            new Response("boom", { status: 503 }),
            Response.json({ error: { code: "invalid_value", message: "token rt-SECRET" } }, { status: 400 }),
            // Last: a 401 flags the stored login, so later requests stop before the network.
            new Response("Bearer sk-SECRETSECRETSECRET", { status: 401 }),
        );
        const results = [];
        for (let i = 0; i < 5; i++) results.push(await stream({}).catch(e => e));
        expect(results.map(e => [e.code, e.failure.classification, e.failure.upstreamStatus, e.failure.retryable, e.failure.replaySafe, e.failure.retryAfterMs])).toEqual([
            ["QUOTA_EXHAUSTED", "quota", 429, false, true, 60000],
            ["RATE_LIMITED", "throttled", 429, true, true, 5000],
            ["PROVIDER_ERROR", "provider", 503, true, true, undefined],
            ["INVALID_INPUT", "invalid_input", 400, false, true, undefined],
            ["LOGIN_REQUIRED", "auth", 401, false, true, undefined],
        ]);
        expect(JSON.stringify(results.map(e => e.message))).not.toMatch(/SECRET|boom|slow down/);
        expect(calls.filter(c => c.url.endsWith("/responses")).length).toBe(5);
        const { conn } = await ctx.fns.models.connections.resolve({ id: view.id });
        expect((await ctx.fns.models.provider.codex.codexAuth({ conn, op: "status" })).needsLogin).toBe(true);
    });

    test("failed, truncated and malformed streams are not replies and are never replayed", async () => {
        const { calls, replies, stream } = await setup();
        replies.push(
            sse([{ type: "response.output_text.delta", delta: "x" }, { type: "response.failed", response: { error: { code: "server_error", message: "rt-SECRET" } } }]),
            sse([{ type: "response.output_text.delta", delta: "x" }]),
            sse([], {}, "data: {not json\n\n"),
            sse([{ type: "response.output_text.delta", delta: "x" }], {}, `data: ${JSON.stringify(done())}`),
            () => { throw new TypeError("socket closed"); },
        );
        const errs = [];
        for (let i = 0; i < 5; i++) errs.push(await stream({}).catch(e => e));
        expect(errs.map(e => [e.code, e.failure.acceptance, e.failure.replaySafe])).toEqual([
            ["PROVIDER_ERROR", "accepted", false],
            ["TRANSPORT", "uncertain", false],
            ["PROVIDER_ERROR", "uncertain", false],
            ["TRANSPORT", "uncertain", false],
            ["TRANSPORT", "uncertain", false],
        ]);
        expect(errs[0].message).not.toContain("SECRET");
        expect(calls.filter(c => c.url.endsWith("/responses")).length).toBe(5);
    });

    test("pre-aborted sends nothing; mid-stream abort is cancelled with uncertain acceptance", async () => {
        const { calls, replies, stream } = await setup();
        const pre = new AbortController(); pre.abort();
        await expect(stream({ signal: pre.signal })).rejects.toMatchObject({ code: "CANCELLED", failure: { acceptance: "none" } });
        expect(calls.length).toBe(0);
        const mid = new AbortController();
        replies.push(() => new Response(new ReadableStream({
            start(c) { c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "response.output_text.delta", delta: "x" })}\n\n`)); },
            pull() { mid.abort(); throw new DOMException("aborted", "AbortError"); },
        })));
        await expect(stream({ signal: mid.signal })).rejects.toMatchObject({ code: "CANCELLED", failure: { acceptance: "uncertain", replaySafe: false } });
        expect(calls.length).toBe(1);
    });

    test("token usage and quota observations are separate, with no usage request", async () => {
        const { calls, replies, stream } = await setup();
        replies.push(sse([{ type: "response.completed", response: { status: "completed", usage: { input_tokens: 100, output_tokens: 7, input_tokens_details: { cached_tokens: 64 } }, rate_limits: { primary: { used_percent: 12, window_minutes: 300, resets_at: 2000000000 } } } }], { "x-codex-primary-used-percent": "11" }));
        replies.push(sse([done()], { "x-codex-primary-used-percent": "20", "x-codex-secondary-used-percent": "3", "x-codex-secondary-window-minutes": "10080" }));
        replies.push(sse([{ type: "response.completed", response: { status: "completed" } }]));
        const a = await stream({}), b = await stream({}), c = await stream({});
        expect(a.usage).toEqual({ prompt_tokens: 100, completion_tokens: 7, cache_read_tokens: 64 });
        expect(a.quota).toEqual({ source: "stream", windows: [{ name: "primary", usedPercent: 12, windowMinutes: 300, resetAt: 2000000000000 }] });
        expect(b.quota).toEqual({ source: "headers", windows: [{ name: "primary", usedPercent: 20 }, { name: "secondary", usedPercent: 3, windowMinutes: 10080 }] });
        expect(c.usage).toEqual({});
        expect(c.quota).toBeUndefined();
        expect(calls.every(x => x.url.endsWith("/codex/responses"))).toBe(true);
    });
});

describe("architecture and transports", () => {
    test.each([{ kind: "direct" }, { kind: "socks", proxyId: "p1" }, { kind: "ssh-tunnel", instance: "box" }] as types.models.TransportSpec[])("%p: list, stream and compact use conn.fetch only, no legacy", async transport => {
        const { calls, replies, ctx, view, legacy, stream } = await setup({ transport, models: [{ slug: "gpt-5" }] });
        await ctx.fns.models.listModels({ id: view.id, refresh: true });
        replies.push(sse([done()]), sse([{ type: "response.output_item.done", item: { type: "compaction", encrypted_content: "E" } }, done()]));
        await stream({});
        await ctx.fns.models.compact({ connectionId: view.id, model: "gpt-5", instructions: "", messages: [], sessionId: "s1" });
        expect(calls.length).toBe(3);
        expect(calls.every(c => c.transport.kind === transport.kind)).toBe(true);
        expect(legacy).toEqual([]);
    });

    test("disabled connection makes no network call", async () => {
        const { calls, ctx, view, stream } = await setup();
        await ctx.fns.models.update({ id: view.id, enabled: false });
        await expect(stream({})).rejects.toMatchObject({ code: "CONNECTION_DISABLED" });
        expect(calls.length).toBe(0);
    });

    test("static: Codex SDK sources reference no legacy namespace or agent types", async () => {
        const files = ["$modelProvider_codex.ts", "transport/parseSSE.ts", "inference/resolveReasoning.ts", "inference/checkInput.ts", "inference/failure.ts", "stream.ts", "compact.ts", "StreamRequest.ts", "StreamResult.ts", "CompactRequest.ts", "CompactResult.ts", "Checkpoint.ts", "ProviderState.ts"];
        // Audit the root facades, inference/transport leaves and every Codex protocol leaf.
        for await (const leaf of new Bun.Glob("*.ts").scan(`${import.meta.dir}/provider/codex`)) {
            if (!leaf.endsWith(".test.ts")) files.push(`provider/codex/${leaf}`);
        }
        for (const f of files) {
            const src = await Bun.file(`${import.meta.dir}/${f}`).text();
            const audited = f === "provider/codex/codexAuth.ts" ? src.replaceAll("ctx.fns.session.reconcileCodexControls(", "reconcile(") : src;
            expect({ f, hit: audited.match(/ctx\.fns\.(llm|llms|agent|session|codexAccount|sshAccount)\b|types\.(llm|agent|session)\.|\bimport\s[^;]*from\s+["']\.\.?\//g) }).toEqual({ f, hit: null });
            // Only the opt-in local version detector may spawn; protocol paths stay CLI-independent.
            expect({ f, spawn: /Bun\.spawn|Bun\.\$|child_process/.test(src) }).toEqual({ f, spawn: f === "provider/codex/codexCliVersion.ts" });
        }
        const secrets = await Bun.file(`${import.meta.dir}/../secrets/decryptLocal.ts`).text() + await Bun.file(`${import.meta.dir}/../secrets/encryptLocal.ts`).text();
        expect(secrets).not.toMatch(/ctx\.fns\.llm\b/);
    });
});
