import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import antigravity from "./$modelProvider_antigravity";
// Synthetic fetchAvailableModels inventory: public or invented ids only, never an account dump.
import INVENTORY from "./fixtures/antigravity-inventory.json";

const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://daily-cloudcode-pa.googleapis.com/v1internal";
const STREAM = API + ":streamGenerateContent?alt=sse";
const REDIRECT = "http://localhost:51121/oauth-callback";
const ACCESS = "ya29.SECRET-access";
const REFRESH = "1//SECRET-refresh";
const CODE = "4/SECRET-code";

type Call = { url: string; method: string; headers: Record<string, string>; body: string; transport: types.models.TransportSpec };
type Handler = (call: Call) => Response | Promise<Response>;

async function setup(handler: Handler, opts: { env?: Record<string, string>; accountName?: string } = {}) {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64"), ...(opts.env ?? {}) } });
    ctx.state.models ??= {};
    ctx.state.models.providers = { ...(ctx.state.models.providers ?? {}), antigravity: { owner: "core", module: "models", rel: "models/$modelProvider_antigravity.ts", definition: antigravity } };
    ctx.state.models.health = {};
    const calls: Call[] = [];
    ctx.state.registry.models.transport.validateTransport = async (_c: unknown, _s: unknown, o: { transport: types.models.TransportSpec }) => o.transport;
    ctx.state.registry.models.transport.fetch = async (_c: unknown, _s: unknown, o: { transport: types.models.TransportSpec; url: string; init?: RequestInit }) => {
        if (o.init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
        const call: Call = { url: o.url, method: o.init?.method ?? "GET", headers: Object.fromEntries(new Headers(o.init?.headers).entries()), body: String(o.init?.body ?? ""), transport: o.transport };
        calls.push(call);
        return handler(call);
    };
    const view = await ctx.fns.models.create({ provider: "antigravity", accountName: opts.accountName ?? "ag-" + crypto.randomUUID().slice(0, 8), config: {}, secrets: {}, transport: { kind: "direct" } });
    const conn = async (id = view.id) => (await ctx.fns.models.connections.resolve({ id })).conn;
    return { ctx, calls, view, conn };
}

const form = (body: string) => Object.fromEntries(new URLSearchParams(body));
const json = (body: string) => JSON.parse(body || "{}");
const tokens = (access = ACCESS) => Response.json({ access_token: access, refresh_token: REFRESH, expires_in: 3600 });
const store = (ctx: Context, conn: types.models.ResolvedConnection, expiresIn = 3600, access = ACCESS) =>
    ctx.fns.models.provider.antigravity.auth({ conn, op: "store", tokens: { access_token: access, refresh_token: REFRESH, expires_in: expiresIn } });
const sse = (events: unknown[]) => new Response(events.map(e => "data: " + JSON.stringify(e) + "\n\n").join(""), { headers: { "content-type": "text/event-stream" } });
const G = "MODEL_PROVIDER_GOOGLE";
const NEON = { id: "gemini-4-neon", label: "Gemini 4 Neon", contextWindow: 1048576, maxOutputTokens: 32768, family: "gemini", reasoning: { supported: ["high", "xhigh", "medium", "low"], variants: { default: "gemini-4-neon-high", members: [
    { level: "high", id: "gemini-4-neon-high" }, { level: "xhigh", id: "gemini-4-neon-xhigh" }, { level: "medium", id: "gemini-4-neon-medium" }, { level: "low", id: "gemini-4-neon-low" }] } } };
const FLASH = { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", contextWindow: 1048576, maxOutputTokens: 65536, family: "gemini", reasoning: { supported: ["high", "medium", "low"], variants: { members: [
    { level: "high", id: "gemini-3.8-flash-high" }, { level: "medium", id: "gemini-3.8-flash-medium" }, { level: "low", id: "gemini-3.8-flash-low" }] } } };
const OPUS = { id: "claude-opus-5-5", label: "Claude Opus 5.5", contextWindow: 200000, family: "claude", reasoning: { supported: ["low", "medium", "high"], variants: { members: [
    { level: "low", id: "claude-opus-5-5-low" }, { level: "medium", id: "claude-opus-5-5-medium" }, { level: "high", id: "claude-opus-5-5-high" }] } } };
const CATALOGUE = [NEON, FLASH,
    { id: "gemini-3-flash", label: "Gemini 3 Flash", contextWindow: 1048576, maxOutputTokens: 65536, family: "gemini" }, OPUS,
    { id: "gemini-3-pro-high", contextWindow: 1048576, maxOutputTokens: 65535, family: "gemini" }, { id: "gemini-2.5-flash-lite", family: "gemini" }];
const api: Handler = call => {
    if (call.url === API + ":loadCodeAssist") return Response.json({ cloudaicompanionProject: { id: "proj-1" } });
    if (call.url === API + ":fetchAvailableModels") return Response.json(INVENTORY);
    return new Response("unexpected", { status: 500 });
};

beforeAll(async () => { await mkTestCtx(); }, 60000);

describe("antigravity registration and client identity (1.1)", () => {
    test("distinct route, no fields, login actions; a new connection sends nothing before sign-in", async () => {
        expect(antigravity.id).toBe("antigravity");
        expect(antigravity.fields).toEqual([]);
        expect(Object.keys(antigravity.actions)).toEqual(["login", "loginStatus", "submitLogin", "cancelLogin", "logout"]);
        expect(antigravity.description).toMatch(/suspend/);
        const { ctx, calls, view } = await setup(() => new Response("unexpected", { status: 500 }));
        expect(ctx.fns.models.providers({}).map((p: types.models.ProviderView) => p.id)).toContain("antigravity");
        const status = await ctx.fns.models.action({ id: view.id, action: "loginStatus" }) as Record<string, unknown>;
        expect(status).toMatchObject({ loggedIn: false, needsLogin: true, flow: null });
        expect(String(status.warning)).toMatch(/suspend/);
        expect(await ctx.fns.models.test({ id: view.id })).toMatchObject({ status: "configured", reason: "login-required" });
        expect((await ctx.fns.models.listModels({ id: view.id, refresh: true })).models).toEqual([]);
        const err = await ctx.fns.models.stream({ connectionId: view.id, model: "gemini-3-flash", instructions: "", sessionId: "s", messages: [{ role: "user", content: "hi" }] }).then(() => null, (e: any) => e);
        // A cold catalogue is not a current choice: the route fails locally, before sign-in is even consulted.
        expect(err?.failure).toMatchObject({ code: "MODEL_UNAVAILABLE", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true });
        expect(err.message).toMatch(/sign in or refresh/);
        expect(calls).toHaveLength(0);
    });

    test("built-in client identity by default, installation overrides for sign-in and refresh", async () => {
        const plain = await setup(() => tokens());
        const k = plain.ctx.fns.models.provider.antigravity.constants({});
        expect(k.clientId).toStartWith("1071006060591-");
        expect(k.redirectUri).toBe(REDIRECT);
        const { ctx, calls, conn } = await setup(call => call.url === TOKEN ? tokens("ya29.new") : new Response("", { status: 500 }), { env: { ANTIGRAVITY_OAUTH_CLIENT_ID: "override-id", ANTIGRAVITY_OAUTH_CLIENT_SECRET: "override-secret" } });
        const c = await conn();
        const f = await ctx.fns.models.provider.antigravity.login({ conn: c, op: "start", loopback: false });
        expect(new URL(f!.authorizationUrl!).searchParams.get("client_id")).toBe("override-id");
        const state = new URL(f!.authorizationUrl!).searchParams.get("state");
        await ctx.fns.models.provider.antigravity.login({ conn: c, op: "submit", flowId: f!.flowId, redirect: `${REDIRECT}?code=${CODE}&state=${state}` });
        await store(ctx, c, 1);
        await ctx.fns.models.provider.antigravity.auth({ conn: c, op: "token" });
        expect(calls.map(x => form(x.body))).toEqual([
            expect.objectContaining({ grant_type: "authorization_code", client_id: "override-id", client_secret: "override-secret" }),
            expect.objectContaining({ grant_type: "refresh_token", client_id: "override-id", client_secret: "override-secret" }),
        ]);
    });
});

const stateOf = (url: string) => new URL(url).searchParams.get("state")!;

describe("antigravity sign-in (2.1)", () => {
    test("remote paste exchanges once; invalid addresses send nothing; nothing secret is returned", async () => {
        const { ctx, calls, view, conn } = await setup(call => call.url === TOKEN ? tokens() : new Response("", { status: 500 }));
        const c = await conn();
        const started = await ctx.fns.models.action({ id: view.id, action: "login" }) as Record<string, any>;
        await ctx.fns.models.action({ id: view.id, action: "cancelLogin" });
        const f = await ctx.fns.models.provider.antigravity.login({ conn: c, op: "start", loopback: false });
        expect(String(started.warning)).toMatch(/suspend/);
        const auth = new URL(f!.authorizationUrl!);
        expect(Object.fromEntries(auth.searchParams)).toMatchObject({ redirect_uri: REDIRECT, code_challenge_method: "S256", response_type: "code", access_type: "offline" });
        const state = stateOf(f!.authorizationUrl!);
        const submit = (redirect: string) => ctx.fns.models.action({ id: view.id, action: "submitLogin", input: { flowId: f!.flowId, code: redirect } }) as Promise<Record<string, any>>;
        for (const bad of [`http://evil.test:51121/oauth-callback?code=${CODE}&state=${state}`, `http://localhost:51121/other?code=${CODE}&state=${state}`, `http://localhost:9999/oauth-callback?code=${CODE}&state=${state}`, `https://localhost:51121/oauth-callback?code=${CODE}&state=${state}`, `${REDIRECT}?state=${state}`, `${REDIRECT}?code=${CODE}&state=other`, "not a url"]) {
            const r = await submit(bad);
            expect(r.status).toBe("pending");
            expect(r.message).toBeTruthy();
        }
        expect(calls).toHaveLength(0);
        const done = await submit(`${REDIRECT}?code=${CODE}&state=${state}&scope=x`);
        expect(done).toMatchObject({ status: "succeeded" });
        const again = await submit(`${REDIRECT}?code=${CODE}&state=${state}`);
        expect(again.message).toMatch(/already used|no longer active/);
        expect(calls).toHaveLength(1);
        const sent = form(calls[0]!.body);
        expect(sent).toMatchObject({ grant_type: "authorization_code", code: CODE, redirect_uri: REDIRECT });
        const status = await ctx.fns.models.action({ id: view.id, action: "loginStatus" });
        expect(status).toMatchObject({ loggedIn: true });
        const text = JSON.stringify([started, done, again, status]);
        for (const s of [ACCESS, REFRESH, CODE, sent.code_verifier!]) expect(text).not.toContain(s);
    });

    test("cancelled and expired flows store nothing and send nothing", async () => {
        const { ctx, calls, conn } = await setup(() => tokens());
        const c = await conn();
        const a = await ctx.fns.models.provider.antigravity.login({ conn: c, op: "start", loopback: false });
        await ctx.fns.models.provider.antigravity.login({ conn: c, op: "cancel" });
        expect(await ctx.fns.models.provider.antigravity.login({ conn: c, op: "submit", flowId: a!.flowId, redirect: `${REDIRECT}?code=${CODE}&state=${stateOf(a!.authorizationUrl!)}` })).toMatchObject({ status: "failed" });
        const b = await ctx.fns.models.provider.antigravity.login({ conn: c, op: "start", loopback: false });
        (ctx.state.models as any).antigravityLogin[c.id].expiresAt = Date.now() - 1;
        expect(await ctx.fns.models.provider.antigravity.login({ conn: c, op: "submit", flowId: b!.flowId, redirect: `${REDIRECT}?code=${CODE}&state=${stateOf(b!.authorizationUrl!)}` })).toMatchObject({ status: "expired" });
        expect(calls).toHaveLength(0);
        expect((await ctx.fns.models.provider.antigravity.auth({ conn: c, op: "status" })).loggedIn).toBe(false);
    });

    test("loopback completion then the same paste: one exchange, account unchanged", async () => {
        const { ctx, calls, conn } = await setup(call => call.url === TOKEN ? tokens() : new Response("", { status: 500 }));
        const c = await conn();
        const f = await ctx.fns.models.provider.antigravity.login({ conn: c, op: "start" });
        if (!f!.callbackListening) return void expect(f!.message).toMatch(/Paste/); // port busy on this machine
        const state = stateOf(f!.authorizationUrl!);
        const res = await fetch(`http://127.0.0.1:51121/oauth-callback?code=${CODE}&state=${state}`);
        expect(res.status).toBe(200);
        await res.text();
        const pasted = await ctx.fns.models.provider.antigravity.login({ conn: c, op: "submit", flowId: f!.flowId, redirect: `${REDIRECT}?code=${CODE}&state=${state}` });
        expect(pasted).toMatchObject({ status: "succeeded", callbackListening: false });
        expect(pasted!.message).toMatch(/already used/);
        expect(calls).toHaveLength(1);
    });
});

describe("antigravity grant storage (2.2)", () => {
    test("connections are isolated; concurrent refresh sends one request", async () => {
        let refreshes = 0;
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const { ctx, view, conn } = await setup(async call => { if (call.url === TOKEN) { refreshes++; await gate; return Response.json({ access_token: "ya29.refreshed", expires_in: 3600 }); } return new Response("", { status: 500 }); });
        const other = await ctx.fns.models.create({ provider: "antigravity", accountName: "ag-other-" + crypto.randomUUID().slice(0, 6), config: {}, secrets: {}, transport: { kind: "direct" } });
        const a = await conn(), b = await conn(other.id);
        await store(ctx, a, 1);
        expect((await ctx.fns.models.provider.antigravity.auth({ conn: b, op: "status" })).loggedIn).toBe(false);
        await expect(ctx.fns.models.provider.antigravity.auth({ conn: b, op: "token" })).rejects.toMatchObject({ code: "LOGIN_REQUIRED" });
        const p = [1, 2, 3].map(() => ctx.fns.models.provider.antigravity.auth({ conn: a, op: "token" }));
        release();
        expect((await Promise.all(p)).map(r => r.accessToken)).toEqual(["ya29.refreshed", "ya29.refreshed", "ya29.refreshed"]);
        expect(refreshes).toBe(1);
        expect(JSON.stringify(await ctx.fns.models.get({ id: view.id }))).not.toContain("ya29");
    });

    test("logout during refresh does not restore the grant", async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const { ctx, view, conn } = await setup(async call => { if (call.url === TOKEN) { await gate; return Response.json({ access_token: "ya29.late", expires_in: 3600 }); } return new Response("", { status: 500 }); });
        const c = await conn();
        await store(ctx, c, 1);
        const pending = ctx.fns.models.provider.antigravity.auth({ conn: c, op: "token" }).then(() => null, (e: any) => e);
        await Bun.sleep(20);
        await ctx.fns.models.action({ id: view.id, action: "logout" });
        release();
        expect((await pending)?.code).toBe("LOGIN_REQUIRED");
        expect(await ctx.fns.models.provider.antigravity.auth({ conn: c, op: "status" })).toMatchObject({ loggedIn: false, expiresAt: null });
    });

    test("revoked grant requires sign-in, forgets the catalogue, and errors carry no secrets", async () => {
        const { ctx, view, conn } = await setup(call => call.url === TOKEN ? new Response(JSON.stringify({ error: "invalid_grant", error_description: "SECRET-detail " + REFRESH }), { status: 400 }) : api(call));
        const c = await conn();
        await store(ctx, c);
        expect((await ctx.fns.models.listModels({ id: view.id, refresh: true })).models.length).toBeGreaterThan(0);
        await ctx.fns.models.provider.antigravity.auth({ conn: c, op: "rejected", accessToken: ACCESS });
        const err = await ctx.fns.models.provider.antigravity.auth({ conn: c, op: "token" }).then(() => null, (e: any) => e);
        expect(err).toMatchObject({ code: "LOGIN_REQUIRED" });
        expect(JSON.stringify({ m: err.message, f: err.failure })).not.toMatch(/SECRET|ya29/);
        expect(await ctx.fns.models.provider.antigravity.auth({ conn: c, op: "status" })).toMatchObject({ loggedIn: false, needsLogin: true, projectId: null });
        const list = await ctx.fns.models.listModels({ id: view.id, cacheOnly: true });
        expect(list).toMatchObject({ models: [], source: "manual" });
        expect(await ctx.fns.models.test({ id: view.id })).toMatchObject({ reason: "login-required" });
    });
});

describe("antigravity project and Gemini discovery (3.x)", () => {
    test("mixed inventory yields one choice per group and each standalone model; GPT-OSS and service ids are dropped", async () => {
        const { ctx, calls, conn } = await setup(api);
        const c = await conn();
        await store(ctx, c);
        const models = await antigravity.listModels!(ctx, c);
        expect<unknown>(models).toEqual(CATALOGUE);
        expect(models.some(m => "price" in m || "pricing" in m)).toBe(false);
        expect(calls.map(x => [x.url, json(x.body), x.headers.authorization])).toEqual([
            [API + ":loadCodeAssist", { metadata: { ideType: "ANTIGRAVITY" } }, "Bearer " + ACCESS],
            [API + ":fetchAvailableModels", { project: "proj-1" }, "Bearer " + ACCESS],
        ]);
        await antigravity.listModels!(ctx, c);
        expect(calls.filter(x => x.url.endsWith(":loadCodeAssist"))).toHaveLength(1);
    });

    test("a rejected project lookup preserves provider evidence for generation only", async () => {
        const { ctx, conn } = await setup(() => Response.json({ error: { status: 'PERMISSION_DENIED', message: 'Subscription is inactive' } }, { status: 403 }));
        const c = await conn();
        await store(ctx, c);
        const project = (inference: boolean) => ctx.fns.models.provider.antigravity.project({ conn: c, inference }).then(() => null, (e: any) => e);
        expect((await project(false)).failure.diagnostic).toBeUndefined();
        const err = await project(true);
        expect(err.failure).toMatchObject({ code: 'ACCESS_DENIED', retryable: false, diagnostic: { provider: 'antigravity', stage: 'http', status: 403, message: 'Subscription is inactive' } });
    });

    test("inaccessible project and empty inventory are distinct; nothing is invented", async () => {
        let mode: "noProject" | "denied" | "empty" = "noProject";
        const { ctx, calls, view, conn } = await setup(call => {
            if (call.url.endsWith(":loadCodeAssist")) return mode === "denied" ? new Response("{}", { status: 403 }) : Response.json(mode === "empty" ? { cloudaicompanionProject: "proj-2" } : {});
            if (call.url.endsWith(":fetchAvailableModels")) return Response.json({ models: { "claude-x": {} }, agentModelSorts: [{ groups: [{ modelIds: ["claude-x"] }] }] });
            return new Response("", { status: 500 });
        });
        await store(ctx, await conn());
        expect(await ctx.fns.models.test({ id: view.id })).toMatchObject({ status: "unavailable", reason: "project-unavailable" });
        mode = "denied"; ctx.state.models!.health = {};
        await ctx.fns.models.update({ id: view.id, accountName: view.accountName + "-x" });
        expect(await ctx.fns.models.test({ id: view.id })).toMatchObject({ status: "unavailable", reason: "access-denied" });
        mode = "empty"; ctx.state.models!.health = {};
        await ctx.fns.models.update({ id: view.id, accountName: view.accountName + "-y" });
        expect(await ctx.fns.models.test({ id: view.id })).toMatchObject({ status: "unavailable", reason: "no-models" });
        expect(await ctx.fns.models.listModels({ id: view.id, refresh: true })).toMatchObject({ models: [], source: "provider" });
        expect(calls.some(x => x.url.includes("streamGenerateContent") || x.url.includes("onboardUser"))).toBe(false);
    });

    test("missing metadata and no thinking: no limits, no levels; auto sends no thinking level", async () => {
        expect((await mkTestCtx()).fns.models.provider.antigravity.mapModels({ response: { models: { "gemini-3-flash": { supportsThinking: false, modelProvider: G }, "gemini-x": { modelProvider: G } }, agentModelSorts: [{ groups: [{ modelIds: ["gemini-3-flash", "gemini-x"] }] }] } })).toEqual([{ id: "gemini-3-flash", family: "gemini" }, { id: "gemini-x", family: "gemini" }]);
    });

    test("quota summary is the only added control method: fixed URL, POST, project payload, saved transport, no redirect", async () => {
        const { ctx, calls, conn } = await setup(call => call.url === API + ":retrieveUserQuotaSummary" ? Response.json({ groups: [] }) : api(call));
        const c = await conn();
        await store(ctx, c);
        const project = await ctx.fns.models.provider.antigravity.project({ conn: c });
        const inits: RequestInit[] = [];
        const fetch0 = c.fetch;
        const spy = { ...c, fetch: (url: string, init?: RequestInit) => { inits.push(init ?? {}); return fetch0(url, init); } } as types.models.ResolvedConnection;
        expect(await ctx.fns.models.provider.antigravity.api({ conn: spy, method: "retrieveUserQuotaSummary", body: { project } })).toEqual({ groups: [] });
        const call = calls.at(-1)!;
        expect([call.url, call.method, json(call.body), call.headers.authorization, call.headers["user-agent"], call.transport]).toEqual([
            API + ":retrieveUserQuotaSummary", "POST", { project: "proj-1" }, "Bearer " + ACCESS, ctx.fns.models.provider.antigravity.constants({}).userAgent, { kind: "direct" }]);
        expect(inits.map(i => i.redirect)).toEqual(["error"]);
        const n = calls.length;
        const refused = (url: string, method = "POST") => ctx.fns.models.provider.antigravity.request({ conn: c, url, init: { method } }).then(() => null, (e: any) => e.code);
        for (const url of [API + ":retrieveUserQuota", API + ":retrieveUserQuotaSummary?x=1", API + ":onboardUser", API + ":generateContent", "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary", "http://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary"]) expect(await refused(url)).toBe("PROXY_CONFIG");
        expect(await refused(API + ":retrieveUserQuotaSummary", "GET")).toBe("PROXY_CONFIG");
        expect(calls).toHaveLength(n);
        expect(calls.some(x => x.url.includes("streamGenerateContent"))).toBe(false);
    });

    test("a new account sign-in exposes no stale models", async () => {
        const { ctx, view, conn } = await setup(api);
        const c = await conn();
        await store(ctx, c);
        expect((await ctx.fns.models.listModels({ id: view.id, refresh: true })).models.length).toBe(6);
        await store(ctx, c, 3600, "ya29.other-account");
        expect(await ctx.fns.models.listModels({ id: view.id, cacheOnly: true })).toMatchObject({ models: [], source: "manual" });
        expect((await ctx.fns.models.provider.antigravity.auth({ conn: c, op: "status" })).projectId).toBeNull();
    });
});

const wrap = (response: unknown) => ({ response, traceId: "t" });
async function signedIn(handler: (call: Call, n: number) => Response | Promise<Response>) {
    let n = 0;
    const s = await setup(call => call.url === STREAM ? handler(call, ++n) : call.url === TOKEN ? Response.json({ access_token: "ya29.refreshed", expires_in: 3600 }) : api(call));
    const c = await s.conn();
    await store(s.ctx, c);
    await s.ctx.fns.models.listModels({ id: s.view.id, refresh: true });
    return { ...s, gens: () => s.calls.filter(x => x.url === STREAM) };
}

describe("antigravity wrapped generation and tools (4.x)", () => {
    test("envelope, inner request and streamed text, finish and usage", async () => {
        const { ctx, view, gens } = await signedIn(() => sse([
            wrap({ candidates: [{ content: { parts: [{ text: "Hel" }] } }] }),
            wrap({ candidates: [{ content: { parts: [{ text: "lo" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2, thoughtsTokenCount: 3 } }),
        ]));
        const deltas: string[] = [];
        const r = await ctx.fns.models.stream({ connectionId: view.id, model: "gemini-3-flash", reasoningEffort: "medium", instructions: "Be brief", sessionId: "sess-1", messages: [{ role: "user", content: "hi" }], tools: [{ name: "read", description: "Read", parameters: { type: "object", properties: {} } }], onEvent: (e: types.models.StreamEvent) => { if (e.type === "text_delta") deltas.push(e.delta); } });
        expect(deltas).toEqual(["Hel", "lo"]);
        expect(r).toMatchObject({ text: "Hello", finishReason: "stop", usage: { prompt_tokens: 7, completion_tokens: 5 } });
        const g = gens()[0]!;
        expect(g.headers.authorization).toBe("Bearer " + ACCESS);
        expect(g.headers["user-agent"]).toStartWith("antigravity/hub/");
        const body = json(g.body);
        expect(body).toMatchObject({ project: "proj-1", model: "gemini-3-flash", requestType: "agent", userAgent: "antigravity" });
        expect(body.request).toMatchObject({ sessionId: "sess-1", systemInstruction: { parts: [{ text: "Be brief" }] }, contents: [{ role: "user", parts: [{ text: "hi" }] }], tools: [{ functionDeclarations: [{ name: "read" }] }] });
        // A standalone model has no advertised levels: the preference selects nothing and no thinking option is sent.
        expect(body.request.generationConfig).toBeUndefined();
    });

    test("parallel calls keep their own signatures; unsigned calls get none; next request correlates results", async () => {
        const { ctx, view, gens } = await signedIn((_c, n) => n === 1 ? sse([wrap({ candidates: [{ content: { parts: [
            { functionCall: { name: "read", args: { path: "a" } }, thoughtSignature: "sig-A" },
            { functionCall: { name: "read", args: { path: "b" } }, thoughtSignature: "sig-B" },
            { functionCall: { name: "list", args: {} } },
        ] }, finishReason: "STOP" }] })]) : sse([wrap({ candidates: [{ content: { parts: [{ text: "done" }] }, finishReason: "STOP" }] })]));
        const base = { connectionId: view.id, model: "gemini-3-pro-high", instructions: "", sessionId: "s" };
        const first = await ctx.fns.models.stream({ ...base, messages: [{ role: "user", content: "go" }] });
        expect(first.finishReason).toBe("tool_calls");
        expect(first.toolCalls.map((t: types.models.StreamResult["toolCalls"][number]) => [t.name, t.thoughtSignature])).toEqual([["read", "sig-A"], ["read", "sig-B"], ["list", undefined]]);
        expect("thoughtSignature" in first.toolCalls[2]!).toBe(false);
        const second = await ctx.fns.models.stream({ ...base, messages: [
            { role: "user", content: "go" },
            { role: "assistant", content: "", tool_calls: first.toolCalls },
            ...first.toolCalls.map((t: types.models.StreamResult["toolCalls"][number], i: number) => ({ role: "tool", tool_call_id: t.id, content: "result-" + i })),
        ] });
        expect(second.text).toBe("done");
        const contents = json(gens()[1]!.body).request.contents;
        expect(contents[1]).toEqual({ role: "model", parts: [
            { functionCall: { name: "read", args: { path: "a" } }, thoughtSignature: "sig-A" },
            { functionCall: { name: "read", args: { path: "b" } }, thoughtSignature: "sig-B" },
            { functionCall: { name: "list", args: {} } },
        ] });
        expect(contents[2].parts.map((p: any) => [p.functionResponse.name, p.functionResponse.response.output])).toEqual([["read", "result-0"], ["read", "result-1"], ["list", "result-2"]]);
    });
});

describe("antigravity failure classification (4.3)", () => {
    const call = (ctx: Context, id: string) => ctx.fns.models.call({ connectionId: id, model: "gemini-3-flash", user: "hi", timeoutMs: 30000 }).then(() => null, (e: any) => e);
    const rpc = (status: number, rpcStatus: string, details: unknown[] = []) => new Response(JSON.stringify({ error: { code: status, status: rpcStatus, message: "Service refused credentials", details } }), { status });

    test("429 quota: one request, QUOTA_EXHAUSTED with reset time", async () => {
        const { ctx, view, gens } = await signedIn(() => rpc(429, "RESOURCE_EXHAUSTED", [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "90s" }]));
        const before = Date.now();
        const err = await call(ctx, view.id);
        expect(err.failure).toMatchObject({ code: "QUOTA_EXHAUSTED", classification: "quota", retryable: false });
        expect(err.failure.resetAt).toBeGreaterThanOrEqual(before + 89000);
        expect(err.failure.retryAfterMs).toBeUndefined();
        expect(err.failure.diagnostic).toMatchObject({ provider: "antigravity", status: 429 });
        expect(gens()).toHaveLength(1);
    });

    test("400 exposes safe Google evidence without changing rejection policy", async () => {
        const { ctx, view, gens } = await signedIn(() => rpc(400, "INVALID_ARGUMENT"));
        const err = await call(ctx, view.id);
        expect(err.failure).toMatchObject({ code: "INVALID_INPUT", acceptance: "rejected", retryable: false, replaySafe: true, upstreamStatus: 400 });
        expect(err.message).toBe("antigravity · HTTP 400 · INVALID_ARGUMENT · Service refused credentials");
        expect(gens()).toHaveLength(1);
    });

    test("a Gemini user role does not suppress Google's location rejection", async () => {
        const message = 'User location is not supported for the API use.';
        const { ctx, view, gens } = await signedIn(() => Response.json({ error: { code: 400, status: 'FAILED_PRECONDITION', message } }, { status: 400 }));
        const err = await call(ctx, view.id);
        expect(json(gens()[0]!.body).request.contents).toContainEqual({ role: 'user', parts: [{ text: 'hi' }] });
        expect(err.failure.diagnostic).toMatchObject({ provider: 'antigravity', status: 400, code: 'FAILED_PRECONDITION', message });
        expect(err.message).toBe(`antigravity · HTTP 400 · FAILED_PRECONDITION · ${message}`);
        expect(gens()).toHaveLength(1);
    });

    test("403 access denied: one request, no retry or substitute", async () => {
        const { ctx, view, calls, gens } = await signedIn(() => rpc(403, "PERMISSION_DENIED"));
        const n = calls.length;
        const err = await call(ctx, view.id);
        expect(err.failure).toMatchObject({ code: "ACCESS_DENIED", retryable: false });
        expect(err.message).toBe("antigravity · HTTP 403 · PERMISSION_DENIED · Service refused credentials");
        expect(gens()).toHaveLength(1);
        expect(calls.slice(n).map(x => x.url)).toEqual([STREAM]);
    });

    test("403 exposes Google's status, reason and bounded message, not verification links or credentials", async () => {
        const { ctx, view } = await signedIn(() => Response.json({ error: {
            status: "PERMISSION_DENIED", message: `To continue, verify your account at\nhttps://accounts.google.com/signin?plt=private user@example.com ${ACCESS} ${REFRESH} ${CODE} code_verifier=private-verifier ${"x".repeat(350)}`,
            details: [null, { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "VALIDATION_REQUIRED", metadata: { validation_url: "private-metadata" } }],
        } }, { status: 403 }));
        const err = await call(ctx, view.id);
        expect(err.failure.diagnostic).toMatchObject({ provider: "antigravity", stage: "http", status: 403, code: "PERMISSION_DENIED", reason: "VALIDATION_REQUIRED" });
        expect(err.message).toBe(err.failure.diagnostic.summary);
        expect(err.message.length).toBeLessThanOrEqual(300);
        for (const value of ["accounts.google.com", "example.com", "private", ACCESS, REFRESH, CODE]) expect(err.message).not.toContain(value);
    });

    test("403 without a Google error envelope keeps a useful fallback", async () => {
        const { ctx, view } = await signedIn(() => new Response("not JSON", { status: 403 }));
        const err = await call(ctx, view.id);
        expect(err.failure.diagnostic.message).toBeUndefined();
        expect(err.message).toBe("antigravity · HTTP 403 · No safe provider explanation available");
    });

    for (const wrapped of [true, false]) {
        test(`stream provider error (${wrapped ? "inner" : "outer"} envelope) is not replayed`, async () => {
            const error = { error: { status: "UNAVAILABLE", message: "Capacity depleted" } };
            const { ctx, view, gens } = await signedIn(() => sse([wrap({ candidates: [{ content: { parts: [{ text: "partial" }] } }] }), wrapped ? wrap(error) : error]));
            const err = await call(ctx, view.id);
            expect(err.message).toBe("antigravity · stream · UNAVAILABLE · Capacity depleted");
            expect(err.failure).toMatchObject({ code: "PROVIDER_ERROR", acceptance: "uncertain", retryable: false });
            expect(gens()).toHaveLength(1);
        });
    }

    test("401 refreshes once and retries once on the same account", async () => {
        const ok = await signedIn((_c, n) => n === 1 ? rpc(401, "UNAUTHENTICATED") : sse([wrap({ candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] })]));
        expect((await ok.ctx.fns.models.call({ connectionId: ok.view.id, model: "gemini-3-flash", user: "hi" })).text).toBe("ok");
        expect(ok.gens().map(g => [g.headers.authorization, json(g.body).project])).toEqual([["Bearer " + ACCESS, "proj-1"], ["Bearer ya29.refreshed", "proj-1"]]);
        const bad = await signedIn(() => rpc(401, "UNAUTHENTICATED"));
        expect((await call(bad.ctx, bad.view.id)).failure).toMatchObject({ code: "AUTH", classification: "auth" });
        expect(bad.gens()).toHaveLength(2);
    });

    test("5xx before data is retryable; malformed frame and abort after data are not replayed", async () => {
        const flaky = await signedIn((_c, n) => n === 1 ? new Response("{}", { status: 503 }) : sse([wrap({ candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] })]));
        expect((await flaky.ctx.fns.models.call({ connectionId: flaky.view.id, model: "gemini-3-flash", user: "hi" })).attempts).toBe(2);
        const broken = await signedIn(() => new Response('data: {"response":{"candidates":[{"content":{"parts":[{"text":"partial"}]}}]}}\n\ndata: {not json\n\n', { headers: { "content-type": "text/event-stream" } }));
        const err = await call(broken.ctx, broken.view.id);
        expect(err.failure).toMatchObject({ acceptance: "uncertain" });
        expect(broken.gens()).toHaveLength(1);
        const ended = await signedIn(() => sse([wrap({ candidates: [{ content: { parts: [{ text: "partial" }] } }] })]));
        const e2 = await ended.ctx.fns.models.stream({ connectionId: ended.view.id, model: "gemini-3-flash", instructions: "", sessionId: "s", messages: [{ role: "user", content: "hi" }] }).then(() => null, (e: any) => e);
        expect(e2.failure).toMatchObject({ code: "STREAM_INTERRUPTED", acceptance: "uncertain" });
        const abort = new AbortController();
        const cancelled = await signedIn(() => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"response":{"candidates":[{"content":{"parts":[{"text":"x"}]}}]}}\n\n')); abort.signal.addEventListener("abort", () => c.error(abort.signal.reason)); } }), { headers: { "content-type": "text/event-stream" } }));
        const e3 = await cancelled.ctx.fns.models.stream({ connectionId: cancelled.view.id, model: "gemini-3-flash", instructions: "", sessionId: "s", messages: [{ role: "user", content: "hi" }], signal: abort.signal, onEvent: () => abort.abort() }).then(() => null, (e: any) => e);
        expect(e3?.name ?? e3?.code).toMatch(/Abort|CANCELLED/);
        expect(cancelled.gens()).toHaveLength(1);
    });
});

describe("antigravity through the Models facade (5.1)", () => {
    test("login, discovery, streamed tool round trip and logout with fixtures only", async () => {
        let gen = 0;
        const { ctx, view, calls } = await setup(call => {
            if (call.url === TOKEN) return tokens();
            if (call.url === STREAM) return ++gen === 1
                ? sse([wrap({ candidates: [{ content: { parts: [{ functionCall: { name: "read", args: { p: 1 } }, thoughtSignature: "sig-1" }] }, finishReason: "STOP" }] })])
                : sse([wrap({ candidates: [{ content: { parts: [{ text: "answer" }] }, finishReason: "STOP" }] })]);
            return api(call);
        });
        const flow = await ctx.fns.models.action({ id: view.id, action: "login" }) as Record<string, any>;
        const state = stateOf(flow.authorizationUrl);
        await ctx.fns.models.action({ id: view.id, action: "cancelLogin" });
        const again = await ctx.fns.models.action({ id: view.id, action: "login" }) as Record<string, any>;
        expect(await ctx.fns.models.action({ id: view.id, action: "submitLogin", input: { flowId: again.flowId, code: `${REDIRECT}?code=${CODE}&state=${state}` } })).toMatchObject({ status: "pending" });
        expect(await ctx.fns.models.action({ id: view.id, action: "submitLogin", input: { flowId: again.flowId, code: `${REDIRECT}?code=${CODE}&state=${stateOf(again.authorizationUrl)}` } })).toMatchObject({ status: "succeeded" });
        expect(await ctx.fns.models.test({ id: view.id })).toMatchObject({ status: "available", reason: "models-ok" });
        const ids = (await ctx.fns.models.listModels({ id: view.id, refresh: true })).models.map((m: types.models.ModelInfo) => m.id);
        expect(ids).toEqual(CATALOGUE.map(m => m.id));
        const base = { connectionId: view.id, model: "gemini-3-flash", instructions: "", sessionId: "s" };
        const first = await ctx.fns.models.stream({ ...base, messages: [{ role: "user", content: "q" }] });
        const second = await ctx.fns.models.stream({ ...base, messages: [{ role: "user", content: "q" }, { role: "assistant", content: "", tool_calls: first.toolCalls }, { role: "tool", tool_call_id: first.toolCalls[0]!.id, content: "r" }] });
        expect(second.text).toBe("answer");
        await ctx.fns.models.action({ id: view.id, action: "logout" });
        expect(await ctx.fns.models.action({ id: view.id, action: "loginStatus" })).toMatchObject({ loggedIn: false });
        const n = calls.length;
        const err = await ctx.fns.models.stream({ ...base, messages: [{ role: "user", content: "q" }] }).then(() => null, (e: any) => e);
        // Logout forgot the catalogue with the grant, so the old route is no longer a choice.
        expect(err.code).toBe("MODEL_UNAVAILABLE");
        expect(calls.length).toBe(n);
        expect(calls.every(x => x.transport.kind === "direct")).toBe(true);
    });
});
