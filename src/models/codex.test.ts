import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import codex from "./$modelProvider_codex";

const ISSUER = "https://auth.openai.com";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims: Record<string, unknown>) => `h.${b64(claims)}.s`;
const ACCOUNT = "acct-123";
const access = (expSec: number, tag = "a") => jwt({ exp: expSec, tag, "https://api.openai.com/auth": { chatgpt_account_id: ACCOUNT } });
const ID_TOKEN = jwt({ "https://api.openai.com/auth": { chatgpt_account_id: ACCOUNT } });
const REFRESH = "rt-SECRET-refresh-token-value";
const tagOf = (token: string | undefined) => JSON.parse(Buffer.from(String(token).split(".")[1]!, "base64url").toString()).tag;

type Call = { url: string; method: string; headers: Record<string, string>; body: string; transport: types.models.TransportSpec };
type Handler = (call: Call) => Response | Promise<Response>;

async function setup(handler: Handler, transport: types.models.TransportSpec = { kind: "direct" }) {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"), CODEX_CLI_VERSION: "0.99.0" } });
    ctx.state.models ??= {};
    ctx.state.models.providers = { codex: { owner: "core", module: "models", rel: "models/$modelProvider_codex.ts", definition: codex } };
    ctx.state.models.health = {};
    ctx.state.models.codexRefresh = {};
    ctx.state.models.loginFlows = {};
    const calls: Call[] = [];
    ctx.state.registry.models.transport.validateTransport = async (_c: unknown, _s: unknown, o: { transport: types.models.TransportSpec }) => o.transport;
    ctx.state.registry.models.transport.fetch = async (_c: unknown, _s: unknown, o: { transport: types.models.TransportSpec; url: string; init?: RequestInit }) => {
        const call: Call = { url: o.url, method: o.init?.method ?? "GET", headers: Object.fromEntries(new Headers(o.init?.headers).entries()), body: String(o.init?.body ?? ""), transport: o.transport };
        calls.push(call);
        return handler(call);
    };
    // SDK independence: any legacy llm call from the provider path fails loudly.
    for (const name of Object.keys(ctx.state.registry.llm ?? {})) ctx.state.registry.llm[name] = () => { throw new Error(`legacy llm.${name} called`); };
    const view = await ctx.fns.models.create({ provider: "codex", accountName: "me", config: {}, secrets: {}, transport });
    const conn = async () => (await ctx.fns.models.connections.resolve({ id: view.id })).conn;
    return { ctx, calls, view, conn };
}

const store = async (ctx: Context, conn: types.models.ResolvedConnection, expSec: number) =>
    ctx.fns.models.provider.codex.codexAuth({ conn, op: "store", tokens: { id_token: ID_TOKEN, access_token: access(expSec), refresh_token: REFRESH } });

const sse = (events: unknown[]) => new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });

beforeAll(async () => { await mkTestCtx(); }, 60000);

describe("codex device login", () => {
    test("start → pending → succeeded through the SOCKS transport, exact request shapes, no secrets exposed", async () => {
        let polls = 0;
        const { ctx, calls, view, conn } = await setup(call => {
            if (call.url === `${ISSUER}/api/accounts/deviceauth/usercode`) return Response.json({ device_auth_id: "dev-SECRET-id", user_code: "ABCD-1234", interval: "1" });
            if (call.url === `${ISSUER}/api/accounts/deviceauth/token`) return ++polls < 2 ? new Response("", { status: 403 }) : Response.json({ authorization_code: "authcode-SECRET", code_challenge: "c", code_verifier: "verifier-SECRET" });
            if (call.url === `${ISSUER}/oauth/token`) return Response.json({ id_token: ID_TOKEN, access_token: access(Math.floor(Date.now() / 1000) + 3600), refresh_token: REFRESH });
            return new Response("unexpected", { status: 500 });
        }, { kind: "socks", proxyId: "p1" } as types.models.TransportSpec);
        const c = await conn();
        const started = await ctx.fns.models.provider.codex.codexLogin({ conn: c, op: "start", intervalMs: 5 });
        expect(started).toMatchObject({ status: "pending", verificationUri: `${ISSUER}/codex/device`, userCode: "ABCD-1234" });
        await ctx.state.models!.loginFlows![view.id]!.done;
        const status = await ctx.fns.models.action({ id: view.id, action: "loginStatus" });
        expect(status).toMatchObject({ loggedIn: true, needsLogin: false, flow: { status: "succeeded" } });
        const json = JSON.stringify([started, status]);
        for (const s of ["dev-SECRET-id", "authcode-SECRET", "verifier-SECRET", REFRESH, "access_token"]) expect(json).not.toContain(s);
        expect(calls.every(x => x.transport.kind === "socks")).toBe(true);
        expect(JSON.parse(calls[0]!.body)).toEqual({ client_id: "app_EMoamEEZ73f0CkXaXp7hrann" });
        expect(JSON.parse(calls[1]!.body)).toEqual({ device_auth_id: "dev-SECRET-id", user_code: "ABCD-1234" });
        const exchange = calls.filter(x => x.url === `${ISSUER}/oauth/token`);
        expect(exchange.length).toBe(1);
        expect(exchange[0]!.headers["content-type"]).toBe("application/x-www-form-urlencoded");
        expect(Object.fromEntries(new URLSearchParams(exchange[0]!.body))).toEqual({ grant_type: "authorization_code", client_id: "app_EMoamEEZ73f0CkXaXp7hrann", code: "authcode-SECRET", redirect_uri: `${ISSUER}/deviceauth/callback`, code_verifier: "verifier-SECRET" });
        const st = await ctx.fns.models.provider.codex.codexAuth({ conn: c, op: "status" });
        expect(st).toMatchObject({ loggedIn: true, accountId: ACCOUNT });
    });

    test("404 on usercode reports device login unavailable", async () => {
        const { ctx, conn } = await setup(() => new Response("", { status: 404 }));
        await expect(ctx.fns.models.provider.codex.codexLogin({ conn: await conn(), op: "start" })).rejects.toThrow(/not enabled/);
    });

    test("expiry, cancel and a failed exchange that is never retried", async () => {
        let mode: "pending" | "code" = "pending";
        const { ctx, calls, view, conn } = await setup(call => {
            if (call.url.endsWith("/usercode")) return Response.json({ device_auth_id: "d", usercode: "WXYZ", interval: "1" });
            if (call.url.endsWith("/deviceauth/token")) return mode === "pending" ? new Response("", { status: 404 }) : Response.json({ authorization_code: "ac", code_verifier: "cv" });
            return new Response("boom", { status: 502 });
        });
        const c = await conn();
        await ctx.fns.models.provider.codex.codexLogin({ conn: c, op: "start", intervalMs: 5, maxWaitMs: 30 });
        await ctx.state.models!.loginFlows![view.id]!.done;
        expect(await ctx.fns.models.provider.codex.codexLogin({ conn: c, op: "status" })).toMatchObject({ status: "expired", userCode: "WXYZ" });

        await ctx.fns.models.provider.codex.codexLogin({ conn: c, op: "start", intervalMs: 5 });
        const cancelled = await ctx.fns.models.provider.codex.codexLogin({ conn: c, op: "cancel" });
        expect(cancelled).toMatchObject({ status: "failed", message: "Login cancelled" });
        await ctx.state.models!.loginFlows![view.id]!.done;

        mode = "code";
        const before = calls.length;
        await ctx.fns.models.provider.codex.codexLogin({ conn: c, op: "start", intervalMs: 5 });
        await ctx.state.models!.loginFlows![view.id]!.done;
        expect(await ctx.fns.models.provider.codex.codexLogin({ conn: c, op: "status" })).toMatchObject({ status: "failed" });
        expect(calls.slice(before).filter(x => x.url === `${ISSUER}/oauth/token`).length).toBe(1);
        expect((await ctx.fns.models.provider.codex.codexAuth({ conn: c, op: "status" })).loggedIn).toBe(false);
    });
});

describe("codex token refresh", () => {
    test("concurrent refreshes send one request and rotate tokens", async () => {
        const { ctx, calls, conn } = await setup(async call => {
            if (call.url === `${ISSUER}/oauth/token`) { await Bun.sleep(20); return Response.json({ access_token: access(Math.floor(Date.now() / 1000) + 3600, "new"), refresh_token: "rt-rotated" }); }
            return new Response("", { status: 500 });
        });
        const c = await conn();
        await store(ctx, c, Math.floor(Date.now() / 1000) + 10);
        const [a, b] = await Promise.all([ctx.fns.models.provider.codex.codexAuth({ conn: c, op: "token" }), ctx.fns.models.provider.codex.codexAuth({ conn: c, op: "token" })]);
        expect(calls.length).toBe(1);
        expect(Object.fromEntries(new URLSearchParams(calls[0]!.body))).toEqual({ grant_type: "refresh_token", client_id: "app_EMoamEEZ73f0CkXaXp7hrann", refresh_token: REFRESH });
        expect(a.accessToken).toBe(b.accessToken!);
        expect(tagOf(a.accessToken)).toBe("new");
        expect(a.accountId).toBe(ACCOUNT);
        // A fresh token needs no request.
        await ctx.fns.models.provider.codex.codexAuth({ conn: c, op: "token" });
        expect(calls.length).toBe(1);
    });

    test("rejected refresh marks login required; logout clears without network", async () => {
        const { ctx, calls, view, conn } = await setup(() => new Response("{}", { status: 401 }));
        const c = await conn();
        await store(ctx, c, Math.floor(Date.now() / 1000) + 10);
        await expect(ctx.fns.models.provider.codex.codexAuth({ conn: c, op: "token" })).rejects.toMatchObject({ code: "LOGIN_REQUIRED" });
        expect(await ctx.fns.models.provider.codex.codexAuth({ conn: c, op: "status" })).toMatchObject({ loggedIn: false, needsLogin: true });
        expect((await ctx.fns.models.test({ id: view.id })).reason).toBe("login-required");
        const n = calls.length;
        expect(await ctx.fns.models.action({ id: view.id, action: "logout" })).toEqual({ loggedIn: false, needsLogin: true });
        expect(calls.length).toBe(n);
        const rows = await ctx.fns.procs.db.select({ sql: "SELECT name FROM local_secrets WHERE namespace='models' AND name=?", params: [`${view.id}.codex-auth`] });
        expect(rows.length).toBe(0);
    });

    test("stale revision does not overwrite a newer one", async () => {
        const { ctx, conn } = await setup(async call => {
            if (call.url === `${ISSUER}/oauth/token`) {
                // Another writer stores a newer login while this refresh is in flight.
                await store(ctx, await conn(), Math.floor(Date.now() / 1000) + 7200);
                return Response.json({ access_token: access(Math.floor(Date.now() / 1000) + 3600, "loser") });
            }
            return new Response("", { status: 500 });
        });
        const c = await conn();
        await store(ctx, c, Math.floor(Date.now() / 1000) + 10);
        const got = await ctx.fns.models.provider.codex.codexAuth({ conn: c, op: "token" });
        expect(tagOf(got.accessToken)).toBe("a");
        expect(got.expiresAt! - Date.now()).toBeGreaterThan(3700_000);
    });
});

describe("codex provider operations", () => {
    const now = () => Math.floor(Date.now() / 1000);

    test("not logged in: test is configured/login-required with no network", async () => {
        const { ctx, calls, view } = await setup(() => new Response("", { status: 500 }));
        expect(await ctx.fns.models.test({ id: view.id })).toMatchObject({ status: "configured", reason: "login-required" });
        expect(calls.length).toBe(0);
    });

    test("models, usage and test map the backend responses", async () => {
        const { ctx, calls, view, conn } = await setup(call => {
            if (call.url.includes("/codex/models")) return Response.json({ models: [{ slug: "gpt-5", display_name: "GPT-5" }, { slug: "hidden-1", visibility: "hidden" }, { slug: "no-api", supported_in_api: false }] });
            if (call.url.endsWith("/wham/usage")) return Response.json({ plan_type: "plus", rate_limit: { primary_window: { used_percent: 12.5, reset_after_seconds: 600, limit_window_seconds: 18000 }, secondary_window: { used_percent: 40, reset_at: 2000000000, limit_window_seconds: 604800 } } });
            return new Response("", { status: 500 });
        });
        await store(ctx, await conn(), now() + 3600);
        const listed = await ctx.fns.models.listModels({ id: view.id });
        expect(listed).toMatchObject({ source: "provider", models: [{ id: "gpt-5", label: "GPT-5", disabled: false }] });
        expect(listed.models.length).toBe(1);
        expect(calls[0]!.url).toBe("https://chatgpt.com/backend-api/codex/models?client_version=0.157.1");
        expect(calls[0]!.headers.originator).toBe("codex_cli_rs");
        const usage = await ctx.fns.models.usage({ id: view.id, refresh: true });
        expect(usage.windows).toEqual([
            { id: "codex:primary", label: "Session (5h)", period: "fiveHour", scope: "account", durationSeconds: 18000, observedAt: expect.any(Number), usedPercent: 12.5, resetAt: expect.any(Number) },
            { id: "codex:secondary", label: "Weekly (7d)", period: "weekly", scope: "account", durationSeconds: 604800, observedAt: expect.any(Number), usedPercent: 40, resetAt: 2000000000 * 1000 },
        ]);
        const usageCall = calls.find(x => x.url.endsWith("/wham/usage"))!;
        expect(usageCall.headers["chatgpt-account-id"]).toBe(ACCOUNT);
        expect((await ctx.fns.models.test({ id: view.id })).status).toBe("available");
    });

    // One connection per test: other tests recreate the provider fixture, so a shared one would not survive.
    const usageClient = async () => {
        let body: unknown = {};
        const { ctx, view, conn } = await setup(call => call.url.endsWith("/wham/usage") ? Response.json(body) : new Response("", { status: 500 }));
        await store(ctx, await conn(), now() + 3600);
        return async (next: unknown) => { body = next; return await ctx.fns.models.usage({ id: view.id, refresh: true }); };
    };
    const brief = (r: types.models.UsageReport) => (r.windows ?? []).map(w => [w.id, w.period ?? null, w.scope, w.usedPercent ?? null]);

    test("usage periods come from duration, never slot, label or reset countdown", async () => {
        const usageOf = await usageClient();
        expect(brief(await usageOf({ rate_limit: { primary_window: { used_percent: 30, limit_window_seconds: 604800, reset_after_seconds: 100 } } })))
            .toEqual([["codex:primary", "weekly", "account", 30]]);
        expect(brief(await usageOf({ rate_limit: { primary_window: { used_percent: 1, limit_window_seconds: 604800 }, secondary_window: { used_percent: 2, limit_window_seconds: 18000 } } })))
            .toEqual([["codex:primary", "weekly", "account", 1], ["codex:secondary", "fiveHour", "account", 2]]);
        expect(brief(await usageOf({ rate_limit: { primary: { used_percent: 5, window_minutes: 10080 } } }))).toEqual([["codex:primary", "weekly", "account", 5]]);
        const unknown = await usageOf({ rate_limit: {
            primary_window: { used_percent: 7, reset_after_seconds: 18000 },
            secondary_window: { used_percent: 8, limit_window_seconds: 18000, window_minutes: 10080 },
        } });
        expect(brief(unknown)).toEqual([["codex:primary", null, "account", 7], ["codex:secondary", null, "account", 8]]);
        expect(unknown.windows![0]).toMatchObject({ label: "Codex", resetAt: expect.any(Number) });
        for (const bad of [{ limit_window_seconds: 0 }, { limit_window_seconds: -5 }, { limit_window_seconds: "18000" }, { limit_window_seconds: 86400 }])
            expect(brief(await usageOf({ rate_limit: { primary_window: { used_percent: 9, ...bad } } }))).toEqual([["codex:primary", null, "account", 9]]);
    });

    test("null usage is never zero, valid siblings and extra rate_limits entries survive", async () => {
        const usageOf = await usageClient();
        expect(brief(await usageOf({ rate_limit: { primary_window: { used_percent: null, limit_window_seconds: 18000 }, secondary_window: { used_percent: 4, limit_window_seconds: 604800 } } })))
            .toEqual([["codex:secondary", "weekly", "account", 4]]);
        const r = await usageOf({ rate_limits: [
            { limit_id: "gpt-5-codex-mini", limit_name: "GPT-5 Codex Mini", primary_window: { used_percent: 90, limit_window_seconds: 604800 } },
            { limit_id: "codex", primary_window: { used_percent: 10, limit_window_seconds: 18000 }, secondary_window: { used_percent: 20, limit_window_seconds: 604800 } },
            { limit_id: "other", primary_window: { used_percent: Infinity } },
            null, "junk",
        ] });
        expect(brief(r)).toEqual([["codex:primary", "fiveHour", "account", 10], ["codex:secondary", "weekly", "account", 20], ["codex:gpt-5-codex-mini:primary", "weekly", "model", 90]]);
        expect(r.windows![2]).toMatchObject({ label: "GPT-5 Codex Mini (7d)", model: "GPT-5 Codex Mini" });
        await expect(usageOf({ rate_limit: { primary_window: { used_percent: null } } })).resolves.toMatchObject({ status: "unavailable" });
    });

    test("401 from the backend marks login required", async () => {
        const { ctx, view, conn } = await setup(() => new Response("", { status: 401 }));
        const c = await conn();
        await store(ctx, c, now() + 3600);
        expect(await ctx.fns.models.test({ id: view.id })).toMatchObject({ status: "unavailable", reason: "login-required" });
        expect((await ctx.fns.models.provider.codex.codexAuth({ conn: c, op: "status" })).needsLogin).toBe(true);
    });

    test("stream parses SSE into text, thinking, tool calls and usage; disabled model never fetches", async () => {
        const { ctx, calls, view, conn } = await setup(call => call.url.endsWith("/codex/responses") ? sse([
            { type: "response.reasoning_summary_text.delta", delta: "think" },
            { type: "response.output_text.delta", delta: "Hel" },
            { type: "response.output_text.delta", delta: "lo" },
            { type: "response.function_call_arguments.delta", delta: "{\"a\"", item_id: "fc1" },
            { type: "response.output_item.done", item: { type: "function_call", call_id: "call_1", name: "read", arguments: "{\"path\":\"x\"}" } },
            { type: "response.completed", response: { status: "completed", usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 3 } } } },
        ]) : new Response("", { status: 500 }));
        await store(ctx, await conn(), now() + 3600);
        const events: types.models.StreamEvent[] = [];
        const tools = [{ type: "function", name: "read", parameters: {} }];
        const r = await ctx.fns.models.stream({ connectionId: view.id, model: "gpt-5", instructions: "sys", messages: [{ role: "user", content: "hi" }], tools, reasoningEffort: "off", sessionId: "sess1", onEvent: (e: types.models.StreamEvent) => events.push(e) });
        expect(r).toEqual({ text: "Hello", thinking: "think", finishReason: "tool_calls", usage: { prompt_tokens: 10, completion_tokens: 5, cache_read_tokens: 3 }, toolCalls: [{ id: "call_1", name: "read", args: { path: "x" } }], reasoning: { requested: "off", applied: "off", fallbackReason: null, source: "profile", profile: "codex-2026-07" } });
        expect(events.map(e => e.type)).toEqual(["thinking_delta", "text_delta", "text_delta", "tool_args_delta"]);
        const call = calls.at(-1)!;
        expect(call.headers).toMatchObject({ "chatgpt-account-id": ACCOUNT, originator: "codex_cli_rs", version: "0.157.1", session_id: "sess1", accept: "text/event-stream" });
        expect(JSON.parse(call.body)).toMatchObject({ model: "gpt-5", store: false, stream: true, instructions: "sys", reasoning: { effort: "none", summary: "auto" }, tools, parallel_tool_calls: true, prompt_cache_key: "sess1" });
        await ctx.fns.models.setModelEnabled({ id: view.id, model: "gpt-5", enabled: false });
        const n = calls.length;
        await expect(ctx.fns.models.stream({ connectionId: view.id, model: "gpt-5", instructions: "sys", messages: [], sessionId: "sess1" })).rejects.toThrow("Model gpt-5 is disabled by user");
        expect(calls.length).toBe(n);
    });

    test("stream failure event throws; compaction returns the checkpoint", async () => {
        let fail = true;
        const { ctx, calls, view, conn } = await setup(() => fail
            ? sse([{ type: "response.failed", response: { error: { code: "usage_limit_reached", message: "quota" } } }])
            : sse([{ type: "response.output_item.done", item: { type: "compaction", id: "cmp1", encrypted_content: "ENC" } }, { type: "response.completed", response: { id: "resp1", usage: { input_tokens: 7, output_tokens: 2 } } }]));
        await store(ctx, await conn(), now() + 3600);
        await expect(ctx.fns.models.stream({ connectionId: view.id, model: "gpt-5", instructions: "", messages: [], sessionId: "s" })).rejects.toMatchObject({ code: "QUOTA_EXHAUSTED", failure: { classification: "quota", acceptance: "accepted", replaySafe: false } });
        fail = false;
        const r = await ctx.fns.models.compact({ connectionId: view.id, model: "gpt-5", instructions: "sys", messages: [{ role: "user", content: "hi" }], sessionId: "s" });
        expect(r).toEqual({ item: { type: "compaction", id: "cmp1", encrypted_content: "ENC" }, responseId: "resp1", usage: { prompt_tokens: 7, completion_tokens: 2 }, checkpoint: { kind: "native-checkpoint", version: 1, provider: "codex", connectionId: view.id, model: "gpt-5", payload: { type: "compaction", id: "cmp1", encrypted_content: "ENC" } } });
        const body = JSON.parse(calls.at(-1)!.body);
        expect(body.input.at(-1)).toEqual({ type: "compaction_trigger" });
        expect(body).toMatchObject({ tools: [], parallel_tool_calls: false, reasoning: { effort: "medium" } });
    });
});
