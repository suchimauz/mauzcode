import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import gemini from "./$modelProvider_gemini";

const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://cloudcode-pa.googleapis.com/v1internal";
const USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo";
const ACCESS = "ya29.SECRET-access";
const REFRESH = "1//SECRET-refresh";
const CODE = "4/SECRET-code";

type Call = { url: string; method: string; headers: Record<string, string>; body: string; transport: types.models.TransportSpec };
type Handler = (call: Call) => Response | Promise<Response>;

async function setup(handler: Handler, transport: types.models.TransportSpec = { kind: "direct" }) {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") } });
    ctx.state.models ??= {};
    ctx.state.models.providers = { gemini: { owner: "core", module: "models", rel: "models/$modelProvider_gemini.ts", definition: gemini } };
    ctx.state.models.health = {};
    ctx.state.models.geminiRefresh = {};
    ctx.state.models.geminiLocks = {};
    ctx.state.models.geminiSetup = {};
    ctx.state.models.geminiLogin = {};
    const calls: Call[] = [];
    ctx.state.registry.models.transport.validateTransport = async (_c: unknown, _s: unknown, o: { transport: types.models.TransportSpec }) => o.transport;
    ctx.state.registry.models.transport.fetch = async (_c: unknown, _s: unknown, o: { transport: types.models.TransportSpec; url: string; init?: RequestInit }) => {
        if (o.init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
        const call: Call = { url: o.url, method: o.init?.method ?? "GET", headers: Object.fromEntries(new Headers(o.init?.headers).entries()), body: String(o.init?.body ?? ""), transport: o.transport };
        calls.push(call);
        return handler(call);
    };
    const view = await ctx.fns.models.create({ provider: "gemini", accountName: "gemini-" + crypto.randomUUID().slice(0, 8), config: {}, secrets: {}, transport });
    const conn = async () => (await ctx.fns.models.connections.resolve({ id: view.id })).conn;
    return { ctx, calls, view, conn };
}

const store = (ctx: Context, conn: types.models.ResolvedConnection, expiresIn = 3600, access = ACCESS) =>
    ctx.fns.models.provider.gemini.auth({ conn, op: "store", tokens: { access_token: access, refresh_token: REFRESH, expires_in: expiresIn } });
const withProject = async (ctx: Context, conn: types.models.ResolvedConnection) => {
    await store(ctx, conn);
    await ctx.fns.models.provider.gemini.auth({ conn, op: "setup", setup: { projectId: "proj-1", tier: { id: "free-tier", name: "Gemini Code Assist for individuals" } } });
};
const form = (body: string) => Object.fromEntries(new URLSearchParams(body));
const json = (body: string) => JSON.parse(body || "{}");
const sse = (events: unknown[]) => new Response(events.map(e => "data: " + JSON.stringify(e) + "\n\n").join(""), { headers: { "content-type": "text/event-stream" } });
const flowOf = (ctx: Context, id: string) => ctx.state.models!.geminiLogin![id]!;
const reasoning = (applied: string, wire?: string): types.models.ReasoningResolution => ({ requested: applied as types.models.ReasoningLevel, applied: applied as types.models.ReasoningLevel, ...(wire ? { wire } : {}), fallbackReason: null, source: "profile" });

beforeAll(async () => { await mkTestCtx(); }, 60000);

describe("gemini provider registration", () => {
    test("no fields, three transports, warning, login actions; a new connection requires login without network", async () => {
        expect(gemini.id).toBe("gemini");
        expect(gemini.fields).toEqual([]);
        expect(gemini.transports).toEqual(["direct", "socks", "ssh-tunnel"]);
        expect(gemini.description).toMatch(/unofficial/i);
        expect(gemini.description).toMatch(/block/i);
        expect(gemini.description).toMatch(/non-critical Google account/i);
        expect(Object.keys(gemini.actions)).toEqual(["login", "loginStatus", "submitLogin", "cancelLogin", "logout"]);
        const { ctx, view, calls, conn } = await setup(() => new Response("unexpected", { status: 500 }));
        expect(ctx.fns.models.providers({}).map((p: types.models.ProviderView) => p.id)).toContain("gemini");
        expect(await ctx.fns.models.action({ id: view.id, action: "loginStatus" })).toMatchObject({ loggedIn: false, needsLogin: true, flow: null });
        expect(await ctx.fns.models.test({ id: view.id })).toMatchObject({ reason: "login-required" });
        await expect(ctx.fns.models.provider.gemini.stream({ conn: await conn(), req: { model: "gemini-2.5-pro", instructions: "", sessionId: "s", messages: [{ role: "user", content: "hi" }] } })).rejects.toMatchObject({ code: "LOGIN_REQUIRED" });
        expect(calls).toHaveLength(0);
    });
});

describe("gemini login", () => {
    test("pasted-code login over SOCKS: PKCE exchange once, tokens stored, userinfo email, setup, nothing secret exposed", async () => {
        const { ctx, calls, view, conn } = await setup(call => {
            if (call.url === TOKEN) return Response.json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3599 });
            if (call.url === USERINFO) return Response.json({ email: "dev@example.com" });
            if (call.url === `${API}:loadCodeAssist`) return Response.json({ cloudaicompanionProject: "proj-9", currentTier: { id: "free-tier", name: "Free" } });
            return new Response("unexpected", { status: 500 });
        }, { kind: "socks", proxyId: "p1" } as types.models.TransportSpec);
        const c = await conn();
        const started = await ctx.fns.models.provider.gemini.login({ conn: c, op: "start", loopback: false });
        expect(started).toMatchObject({ kind: "authorization-code", status: "pending", callbackListening: false });
        expect(started!.callbackAuthorizationUrl).toBeUndefined();
        const auth = new URL(started!.authorizationUrl!);
        expect(auth.origin + auth.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
        expect(auth.searchParams.get("redirect_uri")).toBe("https://codeassist.google.com/authcode");
        expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
        expect(auth.searchParams.get("access_type")).toBe("offline");
        expect(auth.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/cloud-platform");
        const done = await ctx.fns.models.action({ id: view.id, action: "submitLogin", input: { flowId: started!.flowId, code: CODE } });
        expect(done).toMatchObject({ status: "succeeded" });
        await flowOf(ctx, view.id).done;
        // Duplicate submission sends nothing.
        await ctx.fns.models.action({ id: view.id, action: "submitLogin", input: { flowId: started!.flowId, code: CODE } });
        const tokenCalls = calls.filter(x => x.url === TOKEN);
        expect(tokenCalls).toHaveLength(1);
        const sent = form(tokenCalls[0]!.body);
        expect(sent).toMatchObject({ grant_type: "authorization_code", code: CODE, redirect_uri: "https://codeassist.google.com/authcode" });
        expect(sent.code_verifier!.length).toBeGreaterThan(40);
        expect(calls.every(x => x.transport.kind === "socks")).toBe(true);
        const status = await ctx.fns.models.action({ id: view.id, action: "loginStatus" });
        expect(status).toMatchObject({ loggedIn: true, account: { email: "dev@example.com", plan: "Free" }, flow: { status: "succeeded" } });
        expect((await ctx.fns.models.provider.gemini.auth({ conn: c, op: "status" })).projectId).toBe("proj-9");
        const text = JSON.stringify([started, done, status]);
        for (const s of [ACCESS, REFRESH, CODE, sent.code_verifier!]) expect(text).not.toContain(s);
    });

    test("rejected code fails safely without tokens; expiry rejects later codes without network", async () => {
        const { ctx, calls, view, conn } = await setup(() => new Response(JSON.stringify({ error: "invalid_grant", error_description: "SECRET-detail" }), { status: 400 }));
        const c = await conn();
        const f = await ctx.fns.models.provider.gemini.login({ conn: c, op: "start", loopback: false });
        const r = await ctx.fns.models.provider.gemini.login({ conn: c, op: "submit", flowId: f!.flowId, code: CODE });
        expect(r).toMatchObject({ status: "failed" });
        expect(JSON.stringify(r)).not.toContain("SECRET");
        expect((await ctx.fns.models.provider.gemini.auth({ conn: c, op: "status" })).loggedIn).toBe(false);
        const g = await ctx.fns.models.provider.gemini.login({ conn: c, op: "start", loopback: false });
        flowOf(ctx, view.id).expiresAt = Date.now() - 1;
        const n = calls.length;
        expect(await ctx.fns.models.provider.gemini.login({ conn: c, op: "status" })).toMatchObject({ status: "expired" });
        await expect(ctx.fns.models.provider.gemini.login({ conn: c, op: "submit", flowId: g!.flowId, code: CODE })).resolves.toMatchObject({ status: "expired" });
        expect(calls.length).toBe(n);
    });

    test("loopback callback: state mismatch sends nothing, matching state succeeds and closes the listener; restart closes the old listener", async () => {
        const { ctx, calls, view, conn } = await setup(call => {
            if (call.url === TOKEN) return Response.json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 });
            return new Response("down", { status: 500 });
        });
        const c = await conn();
        const first = await ctx.fns.models.provider.gemini.login({ conn: c, op: "start" });
        expect(first).toMatchObject({ callbackListening: true });
        const firstRedirect = new URL(first!.callbackAuthorizationUrl!).searchParams.get("redirect_uri")!;
        const second = await ctx.fns.models.provider.gemini.login({ conn: c, op: "start" });
        await expect(fetch(firstRedirect + "?code=x&state=y")).rejects.toThrow();
        expect(second!.flowId).not.toBe(first!.flowId);
        const cb = new URL(second!.callbackAuthorizationUrl!);
        const redirect = cb.searchParams.get("redirect_uri")!;
        expect(redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth2callback$/);
        const bad = await fetch(redirect + "?code=" + encodeURIComponent(CODE) + "&state=wrong");
        expect(bad.status).toBe(400);
        await bad.text();
        expect(calls.filter(x => x.url === TOKEN)).toHaveLength(0);
        expect(flowOf(ctx, view.id).status).toBe("pending");
        const ok = await fetch(redirect + "?code=" + encodeURIComponent(CODE) + "&state=" + cb.searchParams.get("state"));
        expect(await ok.text()).toContain("Login complete");
        expect(form(calls.find(x => x.url === TOKEN)!.body).redirect_uri).toBe(redirect);
        expect(flowOf(ctx, view.id).status).toBe("succeeded");
        await flowOf(ctx, view.id).done;
        await expect(fetch(redirect)).rejects.toThrow();
        expect((await ctx.fns.models.provider.gemini.login({ conn: c, op: "status" }))!.callbackAuthorizationUrl).toBeUndefined();
    });

    test("cancel closes the listener", async () => {
        const { ctx, conn } = await setup(() => new Response("", { status: 500 }));
        const c = await conn();
        const f = await ctx.fns.models.provider.gemini.login({ conn: c, op: "start" });
        const redirect = new URL(f!.callbackAuthorizationUrl!).searchParams.get("redirect_uri")!;
        expect(await ctx.fns.models.provider.gemini.login({ conn: c, op: "cancel" })).toMatchObject({ status: "failed", callbackListening: false });
        await expect(fetch(redirect)).rejects.toThrow();
    });

    test("bind failure falls back to the pasted code only", async () => {
        const { ctx, conn } = await setup(() => new Response("", { status: 500 }));
        const original = Bun.serve;
        (Bun as { serve: unknown }).serve = () => { throw new Error("EADDRINUSE"); };
        try {
            const f = await ctx.fns.models.provider.gemini.login({ conn: await conn(), op: "start" });
            expect(f).toMatchObject({ status: "pending", callbackListening: false });
            expect(f!.callbackAuthorizationUrl).toBeUndefined();
        } finally { (Bun as { serve: unknown }).serve = original; }
    });

    test("logout during an in-flight exchange: the late response stores nothing; revoke failure keeps logout", async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        let started!: () => void;
        const inFlight = new Promise<void>(r => { started = r; });
        const { ctx, calls, conn } = await setup(async call => {
            if (call.url === TOKEN) { started(); await gate; return Response.json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 }); }
            throw new TypeError("offline");
        });
        const c = await conn();
        const f = await ctx.fns.models.provider.gemini.login({ conn: c, op: "start", loopback: false });
        const pending = ctx.fns.models.provider.gemini.login({ conn: c, op: "submit", flowId: f!.flowId, code: CODE });
        await inFlight;
        const out = await ctx.fns.models.provider.gemini.logout({ conn: c });
        release();
        await pending.catch(() => undefined);
        expect(out).toMatchObject({ loggedIn: false, needsLogin: true });
        expect((await ctx.fns.models.provider.gemini.auth({ conn: c, op: "status" })).loggedIn).toBe(false);
        // Stored login + offline revoke: tokens are still deleted.
        await store(ctx, c);
        const out2 = await ctx.fns.models.provider.gemini.logout({ conn: c, revokeTimeoutMs: 50 });
        expect(out2).toMatchObject({ loggedIn: false, note: expect.stringContaining("deleted locally") });
        expect(JSON.stringify(out2)).not.toContain(REFRESH);
        expect((await ctx.fns.models.provider.gemini.auth({ conn: c, op: "status" })).loggedIn).toBe(false);
        expect(calls.some(x => x.url === "https://oauth2.googleapis.com/revoke")).toBe(true);
    });
});

describe("gemini tokens", () => {
    test("expiring token refreshes once for concurrent requests over the transport", async () => {
        let refreshes = 0;
        const { ctx, calls, conn } = await setup(async call => {
            if (call.url === TOKEN) { refreshes++; await Bun.sleep(10); return Response.json({ access_token: "ya29.SECRET-new", expires_in: 3600 }); }
            return new Response("", { status: 500 });
        });
        const c = await conn();
        await store(ctx, c, 30);
        const [a, b] = await Promise.all([ctx.fns.models.provider.gemini.auth({ conn: c, op: "token" }), ctx.fns.models.provider.gemini.auth({ conn: c, op: "token" })]);
        expect(refreshes).toBe(1);
        expect(a.accessToken).toBe("ya29.SECRET-new");
        expect(b.accessToken).toBe("ya29.SECRET-new");
        expect(form(calls[0]!.body)).toMatchObject({ grant_type: "refresh_token", refresh_token: REFRESH });
    });

    test("rejected refresh marks login required", async () => {
        const { ctx, conn } = await setup(() => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
        const c = await conn();
        await store(ctx, c, 10);
        await expect(ctx.fns.models.provider.gemini.auth({ conn: c, op: "token" })).rejects.toMatchObject({ code: "LOGIN_REQUIRED" });
        expect(await ctx.fns.models.provider.gemini.auth({ conn: c, op: "status" })).toMatchObject({ loggedIn: false, needsLogin: true });
    });

    test("request sends bearer, v1internal URL and User-Agent; a 401 invalidates, then a rejected refresh is LOGIN_REQUIRED", async () => {
        let step = 0;
        const { ctx, calls, conn } = await setup(call => {
            if (call.url === `${API}:loadCodeAssist`) return ++step === 1 ? new Response("", { status: 401 }) : Response.json({});
            if (call.url === TOKEN) return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
            return new Response("", { status: 500 });
        });
        const c = await conn();
        await store(ctx, c);
        await expect(ctx.fns.models.provider.gemini.request({ conn: c, method: "loadCodeAssist", body: {}, model: "gemini-2.5-pro" })).rejects.toMatchObject({ code: "AUTH" });
        expect(calls[0]!.headers.authorization).toBe("Bearer " + ACCESS);
        expect(calls[0]!.headers["user-agent"]).toMatch(/^GeminiCLI\/[\d.]+\/gemini-2\.5-pro \(.+; .+; mauzcode\)$/);
        await expect(ctx.fns.models.provider.gemini.request({ conn: c, method: "loadCodeAssist", body: {} })).rejects.toMatchObject({ code: "LOGIN_REQUIRED" });
        expect(calls[1]!.url).toBe(TOKEN);
        expect(await ctx.fns.models.provider.gemini.auth({ conn: c, op: "status" })).toMatchObject({ needsLogin: true });
    });
});

describe("gemini Code Assist setup", () => {
    const run = async (load: unknown, extra: Handler = () => new Response("", { status: 500 }), opts: { timeoutMs?: number } = {}) => {
        const s = await setup(call => call.url === `${API}:loadCodeAssist` ? Response.json(load) : extra(call));
        const c = await s.conn();
        await store(s.ctx, c);
        const result = s.ctx.fns.models.provider.gemini.setup({ conn: c, pollMs: 2, ...opts });
        return { ...s, c, result };
    };
    test("existing project is stored with the paid tier preferred; no onboarding", async () => {
        const { result, calls, ctx, c } = await run({ cloudaicompanionProject: "p-1", currentTier: { id: "standard-tier", name: "Standard" }, paidTier: { id: "g1-pro", name: "Google AI Pro" } });
        expect(await result).toEqual({ projectId: "p-1", tier: { id: "g1-pro", name: "Google AI Pro" } });
        expect(calls.map(x => x.url)).toEqual([`${API}:loadCodeAssist`]);
        // Reused until logout.
        expect((await ctx.fns.models.provider.gemini.setup({ conn: c })).projectId).toBe("p-1");
        expect(calls).toHaveLength(1);
    });
    test("free-tier onboarding polls the operation until it reports a project", async () => {
        let polls = 0;
        const { result, calls } = await run({ allowedTiers: [{ id: "free-tier", name: "Free", isDefault: true }] }, call => {
            if (call.url === `${API}:onboardUser`) return Response.json({ name: "operations/op1", done: false });
            if (call.url === `${API}/operations/op1`) return Response.json(++polls < 2 ? { name: "operations/op1", done: false } : { name: "operations/op1", done: true, response: { cloudaicompanionProject: { id: "free-proj" } } });
            return new Response("", { status: 500 });
        });
        expect(await result).toMatchObject({ projectId: "free-proj", tier: { id: "free-tier" } });
        const onboard = calls.find(x => x.url === `${API}:onboardUser`)!;
        expect(json(onboard.body)).toMatchObject({ tierId: "free-tier" });
        expect(json(onboard.body).cloudaicompanionProject).toBeUndefined();
        expect(calls.filter(x => x.url.endsWith("/operations/op1")).every(x => x.method === "GET")).toBe(true);
    });
    test("INELIGIBLE, PROJECT_REQUIRED and VALIDATION_REQUIRED fail safely", async () => {
        await expect((await run({ currentTier: { id: "free-tier" }, ineligibleTiers: [{ reasonCode: "X", reasonMessage: "Not available in your country" }] })).result).rejects.toMatchObject({ code: "INELIGIBLE", message: expect.stringContaining("Not available in your country") });
        await expect((await run({ allowedTiers: [{ id: "standard-tier", isDefault: true, userDefinedCloudaicompanionProject: true }] })).result).rejects.toMatchObject({ code: "PROJECT_REQUIRED" });
        await expect((await run({ ineligibleTiers: [{ reasonCode: "VALIDATION_REQUIRED", validationUrl: "https://accounts.google.com/verify" }] })).result).rejects.toMatchObject({ code: "VALIDATION_REQUIRED", message: expect.stringContaining("https://accounts.google.com/verify") });
    });
    test("onboarding that never finishes fails retryable", async () => {
        const { result } = await run({ allowedTiers: [{ id: "free-tier", isDefault: true }] }, () => Response.json({ name: "operations/slow", done: false }), { timeoutMs: 15 });
        await expect(result).rejects.toMatchObject({ code: "SETUP_TIMEOUT", retryable: true });
    });
});

describe("gemini reasoning", () => {
    test("profiles per model use SDK levels only and no default; wire thinkingConfig per level", async () => {
        const ctx = await mkTestCtx();
        const rp = (model: string) => ctx.fns.models.provider.gemini.reasoningProfile({ model });
        expect(rp("gemini-3-pro-preview")).toMatchObject({ supported: ["low", "high"], wire: { low: "low", high: "high" }, source: "profile" });
        expect(rp("gemini-3-flash-preview")!.supported).toEqual(["low", "medium", "high"]);
        expect(rp("gemini-2.5-pro")).toMatchObject({ supported: ["low", "medium", "high"], wire: { low: "1024", medium: "8192", high: "24576" } });
        expect(rp("gemini-2.5-pro")!.disable).toBeUndefined();
        expect(rp("gemini-2.5-flash")).toMatchObject({ supported: ["off", "low", "medium", "high"], wire: { off: "0" }, disable: true });
        expect(rp("gemini-2.5-flash-lite")!.supported).toContain("off");
        for (const id of ["gemini-3.1-pro-preview", "gemini-2.5-flash"]) expect(rp(id)!.default).toBeUndefined();
        expect(rp("other-model")).toBeNull();
        const tc = (model: string, r?: types.models.ReasoningResolution) => ctx.fns.models.provider.gemini.thinkingConfig({ model, ...(r ? { reasoning: r } : {}) });
        expect(tc("gemini-2.5-pro", reasoning("auto"))).toEqual({ thinkingBudget: -1, includeThoughts: true });
        expect(tc("gemini-2.5-flash", reasoning("off", "0"))).toEqual({ thinkingBudget: 0 });
        expect(tc("gemini-2.5-pro", reasoning("medium", "8192"))).toEqual({ thinkingBudget: 8192, includeThoughts: true });
        expect(tc("gemini-3-pro-preview", reasoning("high", "high"))).toEqual({ thinkingLevel: "high", includeThoughts: true });
        expect(tc("gemini-3-flash-preview", reasoning("auto"))).toEqual({ includeThoughts: true });
    });
});

describe("gemini streaming", () => {
    const streamHandler = (events: unknown[]): Handler => call => call.url.startsWith(`${API}:streamGenerateContent`) ? sse(events) : new Response("", { status: 500 });
    const req = (extra: Partial<types.models.StreamRequest> = {}): types.models.StreamRequest => ({ model: "gemini-2.5-pro", instructions: "sys", sessionId: "sess-1", messages: [{ role: "user", content: "hi" }], ...extra });

    test("wraps the request, reads response events, reports deltas and a stable prompt id", async () => {
        const events = [
            { response: { candidates: [{ content: { parts: [{ text: "think", thought: true }, { text: "Hel" }] } }] }, traceId: "t" },
            { response: { candidates: [{ content: { parts: [{ text: "lo" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, thoughtsTokenCount: 1 } } },
        ];
        const { ctx, calls, conn } = await setup(streamHandler(events), { kind: "ssh-tunnel", instance: "h" } as types.models.TransportSpec);
        const c = await conn();
        await withProject(ctx, c);
        const deltas: types.models.StreamEvent[] = [];
        const r = await ctx.fns.models.provider.gemini.stream({ conn: c, req: req({ onEvent: e => deltas.push(e), reasoning: reasoning("auto") }) });
        expect(r).toMatchObject({ text: "Hello", thinking: "think", finishReason: "stop", usage: { prompt_tokens: 4, completion_tokens: 3 } });
        expect(deltas.map(d => d.type)).toEqual(["thinking_delta", "text_delta", "text_delta"]);
        expect(calls[0]!.url).toBe(`${API}:streamGenerateContent?alt=sse`);
        expect(calls[0]!.transport.kind).toBe("ssh-tunnel");
        expect(calls[0]!.headers.authorization).toBe("Bearer " + ACCESS);
        const body = json(calls[0]!.body);
        expect(body).toMatchObject({ model: "gemini-2.5-pro", project: "proj-1", user_prompt_id: "sess-1########1", request: { session_id: "sess-1", systemInstruction: { parts: [{ text: "sys" }] }, generationConfig: { thinkingConfig: { thinkingBudget: -1, includeThoughts: true } } } });
        // Retry of the same step keeps ids; a new user turn bumps the turn number.
        await ctx.fns.models.provider.gemini.stream({ conn: c, req: req() });
        expect(json(calls[1]!.body).user_prompt_id).toBe("sess-1########1");
        await ctx.fns.models.provider.gemini.stream({ conn: c, req: req({ messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "x" }, { role: "user", content: "again" }] }) });
        expect(json(calls[2]!.body)).toMatchObject({ user_prompt_id: "sess-1########2", request: { session_id: "sess-1" } });
    });

    test("structured output, sampling and an explicit Gemini 3 level; shared thinkingLevel mapping is not applied", async () => {
        const { ctx, calls, conn } = await setup(streamHandler([{ response: { candidates: [{ content: { parts: [{ text: "{}" }] }, finishReason: "STOP" }] } }]));
        const c = await conn();
        await withProject(ctx, c);
        await ctx.fns.models.provider.gemini.stream({ conn: c, req: req({ model: "gemini-3-pro-preview", temperature: 0.2, maxTokens: 50, responseFormat: { type: "json_schema", name: "r", schema: { type: "object" } }, reasoning: reasoning("high", "high") }) });
        expect(json(calls[0]!.body).request.generationConfig).toEqual({ temperature: 0.2, maxOutputTokens: 50, responseMimeType: "application/json", responseSchema: { type: "object" }, thinkingConfig: { thinkingLevel: "high", includeThoughts: true } });
        await ctx.fns.models.provider.gemini.stream({ conn: c, req: req({ model: "gemini-2.5-flash", reasoning: reasoning("off", "0") }) });
        expect(json(calls[1]!.body).request.generationConfig).toEqual({ thinkingConfig: { thinkingBudget: 0 } });
    });

    test("signatures: signed and parallel calls returned per call; unsigned replay gets the placeholder only on the first call", async () => {
        const { ctx, calls, conn } = await setup(streamHandler([{ response: { candidates: [{ content: { parts: [{ functionCall: { name: "a", args: {} }, thoughtSignature: "sig-1" }, { functionCall: { name: "b", args: {} } }] }, finishReason: "STOP" }] } }]));
        const c = await conn();
        await withProject(ctx, c);
        const r = await ctx.fns.models.provider.gemini.stream({ conn: c, req: req({ model: "gemini-3-pro-preview" }) });
        expect(r.toolCalls[0]!.thoughtSignature).toBe("sig-1");
        expect("thoughtSignature" in r.toolCalls[1]!).toBe(false);
        const replay = [{ role: "user", content: "hi" }, { role: "assistant", content: "", tool_calls: r.toolCalls }, ...r.toolCalls.map((t: { id: string }) => ({ role: "tool", tool_call_id: t.id, content: "ok" }))];
        await ctx.fns.models.provider.gemini.stream({ conn: c, req: req({ model: "gemini-3-pro-preview", messages: replay }) });
        expect(json(calls[1]!.body).request.contents[1].parts).toEqual([{ functionCall: { name: "a", args: {} }, thoughtSignature: "sig-1" }, { functionCall: { name: "b", args: {} } }]);
        const foreign = [{ role: "user", content: "hi" }, { role: "assistant", content: "", tool_calls: [{ id: "x", name: "a", args: {} }, { id: "y", name: "b", args: {} }] }, { role: "tool", tool_call_id: "x", content: "ok" }, { role: "tool", tool_call_id: "y", content: "ok" }];
        await ctx.fns.models.provider.gemini.stream({ conn: c, req: req({ model: "gemini-3-pro-preview", messages: foreign }) });
        expect(json(calls[2]!.body).request.contents[1].parts).toEqual([{ functionCall: { name: "a", args: {} }, thoughtSignature: "skip_thought_signature_validator" }, { functionCall: { name: "b", args: {} } }]);
    });

    test("interrupted stream fails retryable with acceptance uncertain", async () => {
        const { ctx, conn } = await setup(streamHandler([{ response: { candidates: [{ content: { parts: [{ text: "partial" }] } }] } }]));
        const c = await conn();
        await withProject(ctx, c);
        const err = await ctx.fns.models.provider.gemini.stream({ conn: c, req: req() }).then(() => null, (e: any) => e);
        expect(err).toMatchObject({ code: "STREAM_INTERRUPTED", failure: { acceptance: "uncertain", retryable: true } });
    });

    test("failures: quota vs throttled 429 with RetryInfo, 403 auth, 404 model unavailable; no body text", async () => {
        const quota = { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "SECRET-body", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [] }, { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "60s" }] } };
        const throttle = { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "SECRET-body", details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "RATE_LIMIT_EXCEEDED" }] } };
        const responses = [Response.json(quota, { status: 429 }), Response.json(throttle, { status: 429 }), Response.json({ error: { message: "SECRET-body" } }, { status: 403 }), Response.json({ error: { message: "SECRET-body" } }, { status: 404 })];
        const { ctx, conn } = await setup(() => responses.shift()!);
        const c = await conn();
        await withProject(ctx, c);
        const errs = [];
        for (let i = 0; i < 4; i++) errs.push(await ctx.fns.models.provider.gemini.stream({ conn: c, req: req() }).then(() => null, (e: any) => e));
        expect(errs[0]).toMatchObject({ code: "QUOTA_EXHAUSTED", failure: { classification: "quota", retryAfterMs: 60000 } });
        expect(errs[1]).toMatchObject({ code: "RATE_LIMITED", failure: { classification: "throttled", retryable: true } });
        expect(errs[2]).toMatchObject({ failure: { classification: "auth" } });
        expect(errs[3]).toMatchObject({ code: "MODEL_UNAVAILABLE" });
        for (const e of errs) expect(String(e.message)).not.toContain("SECRET");
    });

    test("401 on a stream invalidates; the next request refreshes first", async () => {
        let n = 0;
        const { ctx, calls, conn } = await setup(call => {
            if (call.url === TOKEN) return Response.json({ access_token: "ya29.SECRET-new", expires_in: 3600 });
            return ++n === 1 ? new Response("", { status: 401 }) : sse([{ response: { candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] } }]);
        });
        const c = await conn();
        await withProject(ctx, c);
        await expect(ctx.fns.models.provider.gemini.stream({ conn: c, req: req() })).rejects.toMatchObject({ failure: { classification: "auth" } });
        await ctx.fns.models.provider.gemini.stream({ conn: c, req: req() });
        expect(calls[1]!.url).toBe(TOKEN);
        expect(calls[2]!.headers.authorization).toBe("Bearer ya29.SECRET-new");
    });
});

describe("gemini tokens, models, usage and test", () => {
    test("countTokens sends the exact body and no generation", async () => {
        const { ctx, calls, conn } = await setup(() => Response.json({ totalTokens: 42 }));
        const c = await conn();
        await withProject(ctx, c);
        expect(await ctx.fns.models.provider.gemini.countTokens({ conn: c, model: "gemini-2.5-pro", instructions: "sys", messages: [{ role: "system", content: "dropped" }, { role: "user", content: "hi" }] })).toBe(42);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe(`${API}:countTokens`);
        expect(json(calls[0]!.body)).toEqual({ request: { model: "models/gemini-2.5-pro", contents: [{ role: "user", parts: [{ text: "sys" }] }, { role: "user", parts: [{ text: "hi" }] }] } });
    });

    test("listModels returns the dated list without network", async () => {
        const { ctx, calls } = await setup(() => new Response("", { status: 500 }));
        const models = await ctx.fns.models.provider.gemini.listModels({});
        for (const id of ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-pro-preview", "gemini-3.1-pro-preview", "gemini-3-flash-preview"]) expect(models.map((m: types.models.ModelInfo) => m.id)).toContain(id);
        expect(models.find((m: types.models.ModelInfo) => m.id === "gemini-2.5-flash")!.reasoning).toMatchObject({ supported: ["off", "low", "medium", "high"] });
        expect(calls).toHaveLength(0);
    });

    test("usage maps remaining fraction to used percent, skips invalid buckets and merges duplicates", async () => {
        const reset = "2030-01-01T00:00:00Z";
        const { ctx, calls, conn } = await setup(() => Response.json({ buckets: [
            { modelId: "gemini-2.5-pro", remainingFraction: 0.25, resetTime: reset, tokenType: "REQUESTS" },
            { modelId: "gemini-2.5-flash", remainingFraction: 0.9, tokenType: "REQUESTS" },
            { modelId: "gemini-2.5-flash", remainingFraction: 0.4, resetTime: reset, tokenType: "TOKENS" },
            { remainingFraction: 0.1 }, { modelId: "x", remainingFraction: "0.2" },
        ] }));
        const c = await conn();
        await withProject(ctx, c);
        await ctx.fns.models.provider.gemini.auth({ conn: c, op: "account", account: { email: "dev@example.com" } });
        const u = await ctx.fns.models.provider.gemini.usage({ conn: c });
        expect(json(calls[0]!.body)).toEqual({ project: "proj-1" });
        expect(u.plan).toBe("Gemini Code Assist for individuals · dev@example.com");
        expect(u.windows!.map((w: NonNullable<types.models.UsageReport["windows"]>[number]) => [w.label, w.usedPercent, w.resetAt ?? null])).toEqual([["gemini-2.5-flash", 60, Date.parse(reset)], ["gemini-2.5-pro", 75, Date.parse(reset)]]);
        expect(gemini.usageRefreshMs).toBe(60000);
    });

    test("test reports available, unauthorized and unavailable", async () => {
        let mode = "ok";
        const { ctx, conn } = await setup(call => {
            if (call.url === TOKEN) return new Response("", { status: 401 });
            if (mode === "ok") return Response.json({ cloudaicompanionProject: "p", currentTier: { id: "free-tier", name: "Free" } });
            if (mode === "down") return new Response("", { status: 503 });
            return new Response("", { status: 401 });
        });
        const c = await conn();
        await store(ctx, c);
        expect(await ctx.fns.models.provider.gemini.test({ conn: c })).toMatchObject({ status: "available" });
        mode = "down";
        expect(await ctx.fns.models.provider.gemini.test({ conn: c })).toMatchObject({ status: "unavailable", reason: "setup-failed" });
        mode = "auth";
        expect(await ctx.fns.models.provider.gemini.test({ conn: c })).toMatchObject({ status: "unavailable", reason: "login-required" });
    });
});
