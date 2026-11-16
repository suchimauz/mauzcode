import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import qwen from "./$modelProvider_qwen";

const AUTH = "https://auth.qwen.ai/api/oauth";
const API = "https://api.qwen.ai/compatible-mode/v1";
const ACCESS = "qa-SECRET-access-token";
const REFRESH = "qr-SECRET-refresh-token";
const DEVICE = "dc-SECRET-device-code";

type Call = { url: string; method: string; headers: Record<string, string>; body: string; transport: types.models.TransportSpec };
type Handler = (call: Call) => Response | Promise<Response>;

async function setup(handler: Handler, transport: types.models.TransportSpec = { kind: "direct" }, accountName = "qwen") {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") } });
    ctx.state.models ??= {};
    ctx.state.models.providers = { qwen: { owner: "core", module: "models", rel: "models/$modelProvider_qwen.ts", definition: qwen } };
    ctx.state.models.health = {};
    ctx.state.models.qwenRefresh = {};
    ctx.state.models.qwenLocks = {};
    ctx.state.models.loginFlows = {};
    const calls: Call[] = [];
    ctx.state.registry.models.transport.validateTransport = async (_c: unknown, _s: unknown, o: { transport: types.models.TransportSpec }) => o.transport;
    ctx.state.registry.models.transport.fetch = async (_c: unknown, _s: unknown, o: { transport: types.models.TransportSpec; url: string; init?: RequestInit }) => {
        if (o.init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
        const call: Call = { url: o.url, method: o.init?.method ?? "GET", headers: Object.fromEntries(new Headers(o.init?.headers).entries()), body: String(o.init?.body ?? ""), transport: o.transport };
        calls.push(call);
        return handler(call);
    };
    const view = await ctx.fns.models.create({ provider: "qwen", accountName, config: {}, secrets: {}, transport });
    const conn = async () => (await ctx.fns.models.connections.resolve({ id: view.id })).conn;
    return { ctx, calls, view, conn };
}

const store = (ctx: Context, conn: types.models.ResolvedConnection, expiresIn: number, access = ACCESS) =>
    ctx.fns.models.provider.qwen.auth({ conn, op: "store", tokens: { access_token: access, refresh_token: REFRESH, expires_in: expiresIn } });
const form = (body: string) => Object.fromEntries(new URLSearchParams(body));
const oauthError = (error: string, status = 400) => new Response(JSON.stringify({ error, error_description: "x" }), { status, headers: { "content-type": "application/json" } });
const deviceCode = (extra: Record<string, unknown> = {}) => Response.json({ device_code: DEVICE, user_code: "QW-1234", verification_uri: "https://chat.qwen.ai/authorize", verification_uri_complete: "https://chat.qwen.ai/authorize?user_code=QW-1234", expires_in: 900, interval: 1, ...extra });
const flowOf = (ctx: Context, id: string) => ctx.state.models!.loginFlows![id]!;

beforeAll(async () => { await mkTestCtx(); }, 60000);

describe("qwen provider registration", () => {
    test("declares no fields, three transports and login actions; a new connection requires login", async () => {
        expect(qwen.id).toBe("qwen");
        expect(qwen.fields).toEqual([]);
        expect(qwen.transports).toEqual(["direct", "socks", "ssh-tunnel"]);
        expect(Object.keys(qwen.actions!)).toEqual(["login", "loginStatus", "cancelLogin", "logout"]);
        expect(qwen.description).toMatch(/Log in/);
        const { ctx, calls, view } = await setup(() => new Response("unexpected", { status: 500 }));
        expect(ctx.fns.models.providers({}).map((p: types.models.ProviderView) => p.id)).toContain("qwen");
        expect(view.secrets).toEqual({});
        expect(await ctx.fns.models.action({ id: view.id, action: "loginStatus" })).toMatchObject({ loggedIn: false, needsLogin: true, flow: null });
        const t = await ctx.fns.models.test({ id: view.id });
        expect(t).toMatchObject({ reason: "login-required" });
        await expect(ctx.fns.models.provider.qwen.listModels({ conn: (await ctx.fns.models.connections.resolve({ id: view.id })).conn })).rejects.toMatchObject({ code: "LOGIN_REQUIRED" });
        expect(calls).toHaveLength(0);
    });
});

describe("qwen device-code login", () => {
    test("success over SOCKS: pending, slow_down, tokens stored, userinfo renames, nothing secret exposed", async () => {
        let polls = 0;
        const { ctx, calls, view, conn } = await setup(call => {
            if (call.url === `${AUTH}/device/code`) return deviceCode();
            if (call.url === `${AUTH}/token`) return ++polls === 1 ? oauthError("authorization_pending") : polls === 2 ? oauthError("slow_down") : Response.json({ access_token: ACCESS, refresh_token: REFRESH, token_type: "Bearer", expires_in: 3600, scope: "model:invoke profile:read" });
            if (call.url === `${AUTH}/userinfo`) return Response.json({ sub: "u1", name: "Dev", email: "dev@example.com", member_type: "pro" });
            return new Response("unexpected", { status: 500 });
        }, { kind: "socks", proxyId: "p1" } as types.models.TransportSpec);
        const c = await conn();
        const started = await ctx.fns.models.provider.qwen.login({ conn: c, op: "start", intervalMs: 5, slowDownMs: 3 });
        expect(started).toMatchObject({ kind: "device-code", status: "pending", userCode: "QW-1234", verificationUri: "https://chat.qwen.ai/authorize?user_code=QW-1234&client=cli" });
        await flowOf(ctx, view.id).done;
        const status = await ctx.fns.models.action({ id: view.id, action: "loginStatus" });
        expect(status).toMatchObject({ loggedIn: true, needsLogin: false, account: { name: "Dev", email: "dev@example.com", plan: "pro" }, flow: { status: "succeeded" } });
        const json = JSON.stringify([started, status]);
        for (const s of [ACCESS, REFRESH, DEVICE]) expect(json).not.toContain(s);
        expect(calls.every(x => x.transport.kind === "socks")).toBe(true);
        expect(form(calls[0]!.body)).toEqual({ client_id: "qwen-code-cli", scope: "model:invoke profile:read" });
        const tokenCalls = calls.filter(x => x.url === `${AUTH}/token`);
        expect(tokenCalls).toHaveLength(3);
        expect(form(tokenCalls[0]!.body)).toEqual({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: "qwen-code-cli", device_code: DEVICE });
        expect(calls.find(x => x.url === `${AUTH}/userinfo`)!.headers.authorization).toBe("Bearer " + ACCESS);
        expect((await ctx.fns.models.connections.get({ id: view.id })).accountName).toBe("dev@example.com");
        const rows = await ctx.fns.procs.db.select({ sql: "SELECT value_enc FROM local_secrets WHERE namespace='models' AND name=?", params: [`${view.id}.qwen-auth`] }) as { value_enc: string }[];
        expect(rows).toHaveLength(1);
        expect(String(rows[0]!.value_enc)).not.toContain(ACCESS);
    });

    test("userinfo failure keeps login succeeded and the account name unchanged", async () => {
        const { ctx, view, conn } = await setup(call => {
            if (call.url === `${AUTH}/device/code`) return deviceCode();
            if (call.url === `${AUTH}/token`) return Response.json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 });
            return new Response("down", { status: 500 });
        });
        await ctx.fns.models.provider.qwen.login({ conn: await conn(), op: "start", intervalMs: 5 });
        await flowOf(ctx, view.id).done;
        expect(flowOf(ctx, view.id).status).toBe("succeeded");
        expect((await ctx.fns.models.connections.get({ id: view.id })).accountName).toBe("qwen");
    });

    test("transient 429/5xx/network failures keep polling; denial fails without tokens", async () => {
        let polls = 0;
        const { ctx, view, conn } = await setup(call => {
            if (call.url === `${AUTH}/device/code`) return deviceCode();
            polls++;
            if (polls === 1) return new Response("", { status: 429, headers: { "retry-after": "0" } });
            if (polls === 2) return new Response("", { status: 503 });
            if (polls === 3) throw new TypeError("socket closed");
            return oauthError("access_denied");
        });
        const c = await conn();
        await ctx.fns.models.provider.qwen.login({ conn: c, op: "start", intervalMs: 2 });
        await flowOf(ctx, view.id).done;
        expect(polls).toBe(4);
        expect(flowOf(ctx, view.id)).toMatchObject({ status: "failed", message: "Login was denied" });
        expect((await ctx.fns.models.provider.qwen.auth({ conn: c, op: "status" })).loggedIn).toBe(false);
    });

    test("expiry and cancel stop polling without tokens", async () => {
        const { ctx, view, conn, calls } = await setup(call => call.url === `${AUTH}/device/code` ? deviceCode() : oauthError("authorization_pending"));
        const c = await conn();
        await ctx.fns.models.provider.qwen.login({ conn: c, op: "start", intervalMs: 5, maxWaitMs: 25 });
        await flowOf(ctx, view.id).done;
        expect(await ctx.fns.models.provider.qwen.login({ conn: c, op: "status" })).toMatchObject({ status: "expired" });
        await ctx.fns.models.provider.qwen.login({ conn: c, op: "start", intervalMs: 5 });
        expect(await ctx.fns.models.action({ id: view.id, action: "cancelLogin" })).toMatchObject({ status: "failed", message: "Login cancelled" });
        await flowOf(ctx, view.id).done;
        const n = calls.length;
        await Bun.sleep(20);
        expect(calls.length).toBe(n);
        expect((await ctx.fns.models.provider.qwen.auth({ conn: c, op: "status" })).loggedIn).toBe(false);
    });

    test("logout during an in-flight poll: a late success stores nothing", async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        let polled!: () => void;
        const inFlight = new Promise<void>(r => { polled = r; });
        const { ctx, view, conn } = await setup(async call => {
            if (call.url === `${AUTH}/device/code`) return deviceCode();
            if (call.url === `${AUTH}/token`) { polled(); await gate; return Response.json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 }); }
            return new Response("", { status: 200 });
        });
        const c = await conn();
        await ctx.fns.models.provider.qwen.login({ conn: c, op: "start", intervalMs: 1 });
        await inFlight;
        expect(await ctx.fns.models.action({ id: view.id, action: "logout" })).toMatchObject({ loggedIn: false, needsLogin: true });
        release();
        await flowOf(ctx, view.id).done;
        expect(flowOf(ctx, view.id)).toMatchObject({ status: "failed", message: "Login cancelled" });
        expect(await ctx.fns.models.provider.qwen.auth({ conn: c, op: "status" })).toMatchObject({ loggedIn: false, needsLogin: true });
    });
});

describe("qwen tokens", () => {
    test("proactive refresh is single-flight and rotates the refresh token", async () => {
        let refreshes = 0;
        const { ctx, calls, conn } = await setup(async call => {
            if (call.url === `${AUTH}/token`) { refreshes++; await Bun.sleep(10); return Response.json({ access_token: "qa-new", refresh_token: "qr-new", expires_in: 3600 }); }
            return new Response("", { status: 500 });
        });
        const c = await conn();
        await store(ctx, c, 10);
        const [a, b] = await Promise.all([ctx.fns.models.provider.qwen.headers({ conn: c }), ctx.fns.models.provider.qwen.headers({ conn: c })]);
        expect(refreshes).toBe(1);
        expect(a.authorization).toBe("Bearer qa-new");
        expect(b.authorization).toBe("Bearer qa-new");
        expect(form(calls[0]!.body)).toEqual({ grant_type: "refresh_token", client_id: "qwen-code-cli", refresh_token: REFRESH });
        await ctx.fns.models.provider.qwen.auth({ conn: c, op: "invalidate" });
        await ctx.fns.models.provider.qwen.headers({ conn: c });
        expect(form(calls[1]!.body).refresh_token).toBe("qr-new");
    });

    test("invalid_grant marks login required", async () => {
        const { ctx, view, conn } = await setup(() => oauthError("invalid_grant"));
        const c = await conn();
        await store(ctx, c, 5);
        await expect(ctx.fns.models.provider.qwen.route({ conn: c, model: "qwen3.8-max" })).rejects.toMatchObject({ code: "LOGIN_REQUIRED" });
        expect(await ctx.fns.models.provider.qwen.auth({ conn: c, op: "status" })).toMatchObject({ loggedIn: false, needsLogin: true });
        expect((await ctx.fns.models.test({ id: view.id })).reason).toBe("login-required");
    });

    test("stale revision does not overwrite newer tokens", async () => {
        let ctxRef!: Context, connRef!: types.models.ResolvedConnection;
        const { ctx, conn } = await setup(async call => {
            if (call.url === `${AUTH}/token`) {
                await store(ctxRef, connRef, 3600, "qa-concurrent");
                return Response.json({ access_token: "qa-stale", expires_in: 3600 });
            }
            return new Response("", { status: 500 });
        });
        ctxRef = ctx; connRef = await conn();
        await store(ctx, connRef, 5);
        expect((await ctx.fns.models.provider.qwen.headers({ conn: connRef })).authorization).toBe("Bearer qa-concurrent");
    });

    test("revoke timeout: logout still succeeds and tokens are gone; removing a connection removes its secret", async () => {
        const { ctx, calls, view, conn } = await setup(async call => {
            if (call.url === `${AUTH}/revoke`) await new Promise(() => undefined);
            return new Response("", { status: 500 });
        });
        const c = await conn();
        await store(ctx, c, 3600);
        const out = await ctx.fns.models.provider.qwen.logout({ conn: c, revokeTimeoutMs: 20 });
        expect(out).toMatchObject({ loggedIn: false, needsLogin: true });
        expect(String((out as { note?: string }).note)).toMatch(/revocation/);
        expect(form(calls.find(x => x.url === `${AUTH}/revoke`)!.body)).toMatchObject({ token: REFRESH, token_type_hint: "refresh_token", client_id: "qwen-code-cli" });
        expect(await ctx.fns.models.provider.qwen.auth({ conn: c, op: "status" })).toMatchObject({ loggedIn: false });
        await store(ctx, c, 3600);
        await ctx.fns.models.remove({ id: view.id });
        const rows = await ctx.fns.procs.db.select({ sql: "SELECT name FROM local_secrets WHERE namespace='models' AND name=?", params: [`${view.id}.qwen-auth`] });
        expect(rows).toHaveLength(0);
    });
});

describe("qwen models, routing and failures", () => {
    test("discovery maps protocol, context and image input; malformed lists fail", async () => {
        let payload: unknown = { data: [
            { id: "qwen3.8-max", input_modalities: ["text", "image"], context_window_tokens: 1000000 },
            { id: "qwen3.8-coder", input_modalities: ["text", "audio-x"], context_window_tokens: "n/a" },
            { id: "qwen3.8-max" }, { id: "bad id" }, null,
        ] };
        const { ctx, calls, conn } = await setup(call => call.url === `${API}/models` ? Response.json(payload) : new Response("", { status: 500 }));
        const c = await conn();
        await store(ctx, c, 3600);
        expect(await qwen.listModels!(ctx, c)).toEqual([
            { id: "qwen3.8-max", protocol: "openai-chat", contextWindow: 1000000, description: "Text and image input" },
            { id: "qwen3.8-coder", protocol: "openai-chat" },
        ]);
        expect(calls[0]!.headers.authorization).toBe("Bearer " + ACCESS);
        for (payload of [{ data: [] }, { models: [] }, "x"]) await expect(qwen.listModels!(ctx, c)).rejects.toThrow("Invalid model catalogue");
    });

    test("route returns the Chat Completions base and a bearer header", async () => {
        const { ctx, conn } = await setup(() => new Response("", { status: 500 }));
        const c = await conn();
        await store(ctx, c, 3600);
        expect(await qwen.route!(ctx, c, { model: "qwen3.8-max", info: null, sessionId: "s" })).toEqual({ protocol: "openai-chat", baseUrl: API, headers: { authorization: "Bearer " + ACCESS, "user-agent": "MauzCode" } });
    });

    test("a streaming 401 is auth, not replayed, and the next request refreshes", async () => {
        let refreshes = 0;
        const { ctx, calls, view, conn } = await setup(call => {
            if (call.url === `${API}/chat/completions`) return new Response(JSON.stringify({ error: { code: "invalid_token", message: "secret upstream" } }), { status: 401 });
            if (call.url === `${AUTH}/token`) { refreshes++; return Response.json({ access_token: "qa-2", expires_in: 3600 }); }
            return new Response("", { status: 500 });
        });
        const c = await conn();
        await store(ctx, c, 3600);
        const err = await ctx.fns.models.stream({ connectionId: view.id, model: "qwen3.8-max", instructions: "", sessionId: "s", messages: [{ role: "user", content: "hi" }] }).then(() => null, (e: any) => e);
        expect(err?.failure ?? err).toMatchObject({ classification: "auth" });
        expect(String(err?.message)).not.toContain("secret upstream");
        expect(calls.filter(x => x.url === `${API}/chat/completions`)).toHaveLength(1);
        expect(calls[0]!.headers.authorization).toBe("Bearer " + ACCESS);
        expect((await qwen.route!(ctx, c, { model: "qwen3.8-max", info: null, sessionId: "s" })).headers.authorization).toBe("Bearer qa-2");
        expect(refreshes).toBe(1);
    });

    test("classifier: 429 quota keeps Retry-After 60, rate limit, 402/403 plan errors, unknown falls back", async () => {
        const { ctx, conn } = await setup(() => new Response(JSON.stringify({ error: { code: "insufficient_quota", message: "upstream text" } }), { status: 429, headers: { "retry-after": "60" } }));
        const c = await conn();
        const err = await ctx.fns.models.protocol.openaiChat.stream({
            fetch: c.fetch, endpoint: { base: API, headers: {} },
            request: { model: "qwen3.8-max", sessionId: "s", instructions: "", messages: [{ role: "user", content: "hi" }] },
            classifyFailure: (input: { status: number; body: unknown | null }) => qwen.classifyFailure!(ctx, c, { ...input, model: "qwen3.8-max" }),
        }).then(() => null, (e: any) => e);
        expect(err.failure).toMatchObject({ code: "QUOTA_EXHAUSTED", classification: "quota", retryAfterMs: 60000, upstreamStatus: 429 });
        expect(String(err.message)).not.toContain("upstream text");
        const classify = (status: number, body: unknown) => ctx.fns.models.provider.qwen.failure({ conn: c, status, body });
        expect(await classify(429, { error: { code: "rate_limited_requests" } })).toMatchObject({ code: "RATE_LIMITED", classification: "throttled" });
        expect(await classify(402, null)).toMatchObject({ code: "QUOTA_EXHAUSTED" });
        expect(await classify(403, { error: { code: "subscription_required" } })).toMatchObject({ code: "QUOTA_EXHAUSTED" });
        expect(await classify(403, { error: { code: "forbidden" } })).toBeNull();
        expect(await classify(500, null)).toBeNull();
    });

    test("402 insufficient_quota sets resetAt, a tier hint and a weekly usage window until reset", async () => {
        const { ctx, view, conn } = await setup(() => new Response("", { status: 500 }));
        const c = await conn();
        expect(await qwen.usage!(ctx, c)).toMatchObject({ status: "configured", reason: "login-required" });
        await store(ctx, c, 3600);
        await ctx.fns.models.provider.qwen.auth({ conn: c, op: "account", account: { plan: "plus" } });
        expect(await qwen.usage!(ctx, c)).toEqual({ status: "available", reason: "usage-ok", checkedAt: expect.any(Number), plan: "plus" });
        const reset = Math.floor(Date.now() / 1000) + 7200;
        const r = await ctx.fns.models.provider.qwen.failure({ conn: c, status: 402, body: { error: { code: "insufficient_quota", message: "upstream text", quota: { member_type: "plus", reset_at: reset } } } });
        expect(r).toMatchObject({ code: "QUOTA_EXHAUSTED", classification: "quota", retryable: false, resetAt: reset * 1000 });
        expect(r!.message).toContain("upgrade");
        expect(r!.message).not.toContain("upstream text");
        const u = await ctx.fns.models.usage({ id: view.id, refresh: true });
        expect(u.windows).toEqual([expect.objectContaining({ id: "qwen:weekly", period: "weekly", scope: "account", usedPercent: 100, resetAt: reset * 1000 })]);
        // An elapsed reset clears the window; a 402 without quota context still classifies.
        ctx.state.models!.qwenQuota![c.id]!.until = Date.now() - 1;
        expect((await qwen.usage!(ctx, c)).windows).toBeUndefined();
        const bare = await ctx.fns.models.provider.qwen.failure({ conn: c, status: 402, body: { error: { code: "insufficient_quota" } } });
        expect(bare).toMatchObject({ code: "QUOTA_EXHAUSTED" });
        expect(bare!.resetAt).toBeUndefined();
        expect((await qwen.usage!(ctx, c)).windows?.[0]).toMatchObject({ usedPercent: 100 });
    });
});

describe("shared streamFetch Retry-After for classified failures", () => {
    const run = async (headers: Record<string, string>, classified: Record<string, unknown> | null) => {
        const ctx = await mkTestCtx();
        const fetch = (async () => new Response(JSON.stringify({ error: {} }), { status: 429, headers })) as unknown as types.models.ResolvedConnection["fetch"];
        return ctx.fns.models.protocol.common.streamFetch({
            fetch, url: "https://example.test/v1/chat/completions", headers: {}, body: {}, label: "Fixture",
            classifyFailure: () => classified as never,
        }).then(() => null, (e: any) => e.failure as types.models.FailureInfo);
    };
    const quota = { code: "QUOTA_EXHAUSTED", classification: "quota", retryable: false, message: "quota" };
    test("numeric and HTTP-date headers fill a missing classifier hint", async () => {
        expect((await run({ "retry-after": "60" }, quota))!.retryAfterMs).toBe(60000);
        const ms = (await run({ "retry-after": new Date(Date.now() + 120000).toUTCString() }, quota))!.retryAfterMs!;
        expect(ms).toBeGreaterThan(100000);
        expect(ms).toBeLessThanOrEqual(120000);
    });
    test("malformed headers give no hint; an explicit classifier hint wins", async () => {
        expect(await run({ "retry-after": "soon" }, quota)).not.toHaveProperty("retryAfterMs");
        expect((await run({ "retry-after": "60" }, { ...quota, retryAfterMs: 5 }))!.retryAfterMs).toBe(5);
    });
    test("status-only fallback is unchanged", async () => {
        expect(await run({ "retry-after": "3" }, null)).toMatchObject({ code: "THROTTLED", retryAfterMs: 3000 });
        expect(await run({}, null)).not.toHaveProperty("retryAfterMs");
    });
});
