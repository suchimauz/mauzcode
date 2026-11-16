import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkTestCtx } from "../_testCtx.entry";
import api from "./api";

type Seen = { stream: number; compact: number; call: number; count: number; test: number; usage: number; list: number; login: number; fetch: number; resolve: number };

function provider(seen: Seen): types.models.ProviderDefinition {
    return {
        id: "acme", label: "Acme",
        fields: [{ key: "apiKey", label: "API key", type: "secret" }],
        transports: ["direct"],
        test: async () => { seen.test++; return { status: "available", reason: "ok", message: "ok", checkedAt: Date.now() }; },
        usage: async () => { seen.usage++; return { status: "available", checkedAt: Date.now() }; },
        listModels: async () => { seen.list++; return [{ id: "m1" }, { id: "m2" }]; },
        countTokens: async () => { seen.count++; return 7; },
        actions: { login: { label: "Log in", run: async () => { seen.login++; return { ok: true }; } } },
        stream: async (_ctx, conn, req) => { seen.stream++; await conn.fetch("https://api.example/x").catch(() => undefined); req.onEvent?.({ type: "text_delta", delta: "hi" }); return { text: "hi " + req.model, thinking: "", finishReason: "stop", usage: {}, toolCalls: [] }; },
        compact: async (_ctx, _conn, req) => { seen.compact++; return { item: { type: "compaction", encrypted_content: "enc-" + req.model }, responseId: "r1", usage: { prompt_tokens: 1, completion_tokens: 1 } }; },
    };
}

/** Two providers (acme, second) with instrumented methods; fetch and connections.resolve fail on any call. */
async function setup(opts: { settingsDir?: string } = {}) {
    const ctx = await mkTestCtx({ env: {
        MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
        ...(opts.settingsDir ? { MAUZCODE_SETTINGS: opts.settingsDir } : {}),
    } });
    const seen: Seen = { stream: 0, compact: 0, call: 0, count: 0, test: 0, usage: 0, list: 0, login: 0, fetch: 0, resolve: 0 };
    const second: Seen = { ...seen };
    ctx.state.models ??= {};
    ctx.state.models.providers = {
        acme: { owner: "core", module: "models", rel: "models/$modelProvider_acme.ts", definition: provider(seen) },
        beta: { owner: "core", module: "models", rel: "models/$modelProvider_beta.ts", definition: { ...provider(second), id: "beta", label: "Beta" } },
    };
    ctx.state.models.health = {};
    // Any network attempt is a failure the test can see; provider methods are counted separately.
    ctx.state.registry.models.transport.fetch = async () => { seen.fetch++; throw new Error("network forbidden while disabled"); };
    const resolve = ctx.state.registry.models.connections.resolve;
    ctx.state.registry.models.connections.resolve = async (c: any, s: any, o: any) => { seen.resolve++; return resolve(c, s, o); };
    const conn = await ctx.fns.models.create({ provider: "acme", accountName: "work-" + crypto.randomUUID(), config: {}, secrets: { apiKey: "sk-test-value" } });
    // Warm the cache while enabled so refresh-fallback has something to serve.
    await ctx.fns.models.listModels({ id: conn.id, refresh: true });
    seen.list = 0; seen.resolve = 0;
    return { ctx, seen, second, conn };
}

beforeAll(async () => { await mkTestCtx(); }, 60000);

const req = (connectionId: string, model: string) => ({ connectionId, model, instructions: "be brief", messages: [{ role: "user", content: "hi" }], sessionId: "s1" });
const disable = (ctx: any, ids: unknown) => ctx.fns.settings.set({ module: "models", scopeType: "global", key: "disabledProviders", value: ids });

const owner = { user: { id: "u1", role: "owner" } } as unknown as Session;
const member = { user: { id: "u2", role: "member" } } as unknown as Session;
function post(ctx: any, body: unknown, session: Session = owner, token = "good") {
    ctx.state.registry.auth.verifyCsrf = async (_c: unknown, _s: unknown, o: { token: string }) => o.token === "good";
    return api(ctx, session, { req: new Request("http://local/models/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-csrf-token": token } }) });
}
const get = (ctx: any, session: Session = owner) => api(ctx, session, { req: new Request("http://local/models/api") });

describe("models.disabledProviders setting and reader", () => {
    test("shape validation: array of non-empty strings; unknown ids kept", async () => {
        const { ctx } = await setup();
        for (const bad of ["x", 42, {}, [""], [" "], [1], ["ok", null]])
            await expect(disable(ctx, bad)).rejects.toMatchObject({ code: "INVALID_SETTING" });
        await disable(ctx, ["old-plugin", "acme"]);
        const set = await ctx.fns.models.disabledProviders({});
        expect([...set].sort()).toEqual(["acme", "old-plugin"]);
        // A toggle through the API keeps the unregistered id.
        const res = await post(ctx, { action: "setProviderEnabled", provider: "acme", enabled: true });
        expect(res.status).toBe(200);
        expect(await ctx.fns.settings.get({ module: "models", scopeType: "global", key: "disabledProviders" })).toEqual(["old-plugin"]);
    });

    test("read-through: a write is visible on the very next read", async () => {
        const { ctx } = await setup();
        expect((await ctx.fns.models.disabledProviders({})).size).toBe(0);
        await disable(ctx, ["acme"]);
        expect((await ctx.fns.models.disabledProviders({})).has("acme")).toBe(true);
        await disable(ctx, []);
        expect((await ctx.fns.models.disabledProviders({})).size).toBe(0);
    });
});

describe("inference enforcement while a provider is disabled", () => {
    test("stream/compact/call/countTokens fail PROVIDER_DISABLED with zero provider invocations", async () => {
        const { ctx, seen, conn } = await setup();
        await disable(ctx, ["acme"]);
        const expectOff = { code: "PROVIDER_DISABLED", retryable: false, status: 409 };
        await expect(ctx.fns.models.stream(req(conn.id, "m1"))).rejects.toMatchObject(expectOff);
        await expect(ctx.fns.models.stream(req(conn.id, "m1"))).rejects.toThrow("Provider acme is disabled");
        await expect(ctx.fns.models.compact({ ...req(conn.id, "m1"), focus: "keep" })).rejects.toMatchObject(expectOff);
        await expect(ctx.fns.models.call({ connectionId: conn.id, model: "m1", user: "hi" })).rejects.toMatchObject(expectOff);
        expect(await ctx.fns.models.countTokens({ connectionId: conn.id, model: "m1", messages: [{ role: "user", content: "hi" }] })).toBeNull();
        expect(seen.stream + seen.compact + seen.count + seen.fetch + seen.resolve).toBe(0);
    });

    test("provider check precedes connection and model checks; re-enable restores", async () => {
        const { ctx, seen, conn } = await setup();
        await ctx.fns.models.update({ id: conn.id, enabled: false });
        await ctx.fns.models.setModelEnabled({ id: conn.id, model: "m1", enabled: false });
        await disable(ctx, ["acme"]);
        // PROVIDER_DISABLED wins over CONNECTION_DISABLED and MODEL_DISABLED_BY_USER.
        await expect(ctx.fns.models.stream(req(conn.id, "m1"))).rejects.toMatchObject({ code: "PROVIDER_DISABLED" });
        await disable(ctx, []);
        await expect(ctx.fns.models.stream(req(conn.id, "m1"))).rejects.toMatchObject({ code: "CONNECTION_DISABLED" });
        await ctx.fns.models.update({ id: conn.id, enabled: true });
        await expect(ctx.fns.models.stream(req(conn.id, "m1"))).rejects.toMatchObject({ code: "MODEL_DISABLED_BY_USER" });
        await ctx.fns.models.setModelEnabled({ id: conn.id, model: "m1", enabled: true });
        const r = await ctx.fns.models.stream(req(conn.id, "m1"));
        expect(r.text).toBe("hi m1");
        expect(seen.stream).toBe(1);
    });

    test("resolveRoute fails before connections.list/resolve and beats CONNECTION_NOT_FOUND", async () => {
        const { ctx, seen, conn } = await setup();
        let listed = 0;
        const list = ctx.state.registry.models.connections.list;
        ctx.state.registry.models.connections.list = async (c: any, s: any, o: any) => { listed++; return list(c, s, o); };
        await disable(ctx, ["acme"]);
        // Unknown account: provider check still wins over CONNECTION_NOT_FOUND.
        await expect(ctx.fns.models.resolveRoute({ route: "acme/missing-account:m1" })).rejects.toMatchObject({ code: "PROVIDER_DISABLED", retryable: false });
        await expect(ctx.fns.models.resolveRoute({ route: `acme/${conn.accountName}:m1` })).rejects.toMatchObject({ code: "PROVIDER_DISABLED" });
        expect(listed).toBe(0);
        expect(seen.resolve).toBe(0);
        await disable(ctx, []);
        const resolved = await ctx.fns.models.resolveRoute({ route: `acme/${conn.accountName}:m1` });
        expect(resolved.connectionId).toBe(conn.id);
    });

    test("PROVIDER_DISABLED is never retryable", async () => {
        const { ctx } = await setup();
        expect(ctx.fns.agent.retryCodes({}).never).toContain("PROVIDER_DISABLED");
        // Even a policy that allows everything and a failure claiming retryable cannot revive it.
        await ctx.fns.settings.set({ module: "agent", scopeType: "global", key: "retryPolicy", value: { enabled: true, retryableCodes: ["PROVIDER_DISABLED"], maxRetries: 3, maxDelayMs: 5000 } }).catch(() => undefined);
        const error = Object.assign(new Error("Provider acme is disabled"), { code: "PROVIDER_DISABLED", retryable: true, failure: { code: "PROVIDER_DISABLED", classification: "invalid_input", acceptance: "none", retryable: true, replaySafe: true } });
        const decision = await ctx.fns.agent.retryDecision({ error, provider: "acme", retry: 0 });
        expect(decision.retry).toBe(false);
    });
});

describe("other network paths while a provider is disabled", () => {
    test("action(login) refused before resolve; test/usage disabled; refresh falls back to cache; refreshAll skips", async () => {
        const { ctx, seen, conn } = await setup();
        await disable(ctx, ["acme"]);
        await expect(ctx.fns.models.connections.action({ id: conn.id, action: "login" })).rejects.toMatchObject({ code: "PROVIDER_DISABLED", status: 409 });
        expect(seen.login).toBe(0);
        expect(seen.resolve).toBe(0);
        expect(await ctx.fns.models.connections.test({ id: conn.id })).toMatchObject({ status: "disabled", message: "Provider acme is disabled" });
        expect(await ctx.fns.models.connections.usage({ id: conn.id })).toMatchObject({ status: "disabled" });
        const refreshed = await ctx.fns.models.listModels({ id: conn.id, refresh: true });
        expect(refreshed.models.map((m: types.models.ModelInfo) => m.id)).toEqual(["m1", "m2"]);
        expect(refreshed.source).toBe("provider");
        expect(seen.list + seen.test + seen.usage + seen.fetch).toBe(0);
        const all = await ctx.fns.models.catalog.refreshAll({});
        expect(all.refreshed).toBe(0);
        expect(all.failed).toEqual([]);
        expect(seen.list).toBe(0);
    });

    test("create rejected with PROVIDER_DISABLED; existing connections stay manageable", async () => {
        const { ctx, seen, conn } = await setup();
        await disable(ctx, ["acme"]);
        await expect(ctx.fns.models.create({ provider: "acme", accountName: "new-" + crypto.randomUUID(), config: {}, secrets: {} })).rejects.toMatchObject({ code: "PROVIDER_DISABLED", status: 409 });
        // Listing, toggling, editing and removing the stored connection still work; secrets untouched.
        expect((await ctx.fns.models.list({ provider: "acme" })).map((c: types.models.ConnectionView) => c.id)).toContain(conn.id);
        const off = await ctx.fns.models.update({ id: conn.id, enabled: false });
        expect(off.enabled).toBe(false);
        const on = await ctx.fns.models.update({ id: conn.id, enabled: true });
        expect(on.secrets).toEqual({ apiKey: true });
        expect(seen.fetch).toBe(0);
    });

    test("modelDefault skips connections of disabled providers", async () => {
        const { ctx, conn } = await setup();
        const beta = await ctx.fns.models.create({ provider: "beta", accountName: "b-" + crypto.randomUUID(), config: {}, secrets: {} });
        await ctx.fns.procs.db.run({ sql: "DELETE FROM kv WHERE key = 'last-model'", params: [] });
        await ctx.fns.procs.db.run({ sql: "INSERT INTO kv (key, value) VALUES ('last-model', ?)", params: [`acme/${conn.accountName}:m1`] });
        await disable(ctx, ["acme"]);
        expect(await ctx.fns.settings.modelDefault({})).toBe(`beta/${beta.accountName}:m1`);
        await disable(ctx, ["acme", "beta"]);
        await expect(ctx.fns.settings.modelDefault({})).rejects.toMatchObject({ code: "NO_MODEL" });
    });
});

describe("models.api setProviderEnabled", () => {
    test("owner-only, CSRF, validation; GET and providers carry enabled/enabledLocked", async () => {
        const { ctx } = await setup();
        expect((await post(ctx, { action: "setProviderEnabled", provider: "acme", enabled: false }, member)).status).toBe(403);
        expect((await post(ctx, { action: "setProviderEnabled", provider: "acme", enabled: false }, owner, "bad")).status).toBe(403);
        expect((await post(ctx, { action: "setProviderEnabled", provider: "nope", enabled: false })).status).toBe(400);
        expect((await post(ctx, { action: "setProviderEnabled", provider: "acme", enabled: "no" })).status).toBe(400);
        expect(await ctx.fns.models.disabledProviders({}).then((s: Set<string>) => s.size)).toBe(0);
        const res = await post(ctx, { action: "setProviderEnabled", provider: "acme", enabled: false });
        expect(res.status).toBe(200);
        const body = await res.json() as { providers: types.models.ProviderSettingsView[] };
        expect(body.providers.find(p => p.id === "acme")).toMatchObject({ enabled: false, enabledLocked: false });
        expect(body.providers.find(p => p.id === "beta")).toMatchObject({ enabled: true });
        const got = await (await get(ctx)).json() as { providers: types.models.ProviderSettingsView[] };
        expect(got.providers.find(p => p.id === "acme")!.enabled).toBe(false);
        // Idempotent disable.
        expect((await post(ctx, { action: "setProviderEnabled", provider: "acme", enabled: false })).status).toBe(200);
        expect(await ctx.fns.settings.get({ module: "models", scopeType: "global", key: "disabledProviders" })).toEqual(["acme"]);
        // Re-enable through the API.
        await post(ctx, { action: "setProviderEnabled", provider: "acme", enabled: true });
        expect(await ctx.fns.models.disabledProviders({}).then((s: Set<string>) => s.size)).toBe(0);
    });

    test("concurrent toggles of different providers are both persisted", async () => {
        const { ctx } = await setup();
        const [a, b] = await Promise.all([
            post(ctx, { action: "setProviderEnabled", provider: "acme", enabled: false }),
            post(ctx, { action: "setProviderEnabled", provider: "beta", enabled: false }),
        ]);
        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        expect([...await ctx.fns.models.disabledProviders({})].sort()).toEqual(["acme", "beta"]);
    });

    test("a rejected write reaches its caller and does not block a later toggle", async () => {
        const { ctx } = await setup();
        const set = ctx.state.registry.settings.set;
        let fail = true;
        ctx.state.registry.settings.set = async (c: any, s: any, o: any) => {
            if (o.key === "disabledProviders" && fail) throw Object.assign(new Error("storage down"), { code: "STORAGE", status: 500 });
            return set(c, s, o);
        };
        expect((await post(ctx, { action: "setProviderEnabled", provider: "acme", enabled: false })).status).toBe(422);
        fail = false;
        const ok = await post(ctx, { action: "setProviderEnabled", provider: "beta", enabled: false });
        expect(ok.status).toBe(200);
        expect([...await ctx.fns.models.disabledProviders({})]).toEqual(["beta"]);
    });

    test("file-fixed setting: 409 SETTING_FIXED with path, enabledLocked in views, value unchanged", async () => {
        const dir = await mkdtemp(join(tmpdir(), "mauzcode-provider-fixed-"));
        try {
            await writeFile(join(dir, "$settings_models.json"), JSON.stringify({ disabledProviders: ["beta"] }));
            const { ctx } = await setup({ settingsDir: dir });
            await ctx.fns.settings.files({ force: true });
            const res = await post(ctx, { action: "setProviderEnabled", provider: "acme", enabled: false });
            expect(res.status).toBe(409);
            const body = await res.json() as { code: string; fixedBy: string; error: string };
            expect(body.code).toBe("SETTING_FIXED");
            expect(body.fixedBy).toBe(join(dir, "$settings_models.json"));
            expect(body.error).toContain("fixed by");
            expect([...await ctx.fns.models.disabledProviders({})]).toEqual(["beta"]);
            const got = await (await get(ctx)).json() as { providers: types.models.ProviderSettingsView[] };
            expect(got.providers.every(p => p.enabledLocked)).toBe(true);
            expect(got.providers.find(p => p.id === "beta")!.enabled).toBe(false);
            expect(got.providers.find(p => p.id === "acme")!.enabled).toBe(true);
        } finally { await rm(dir, { recursive: true, force: true }); }
    });

    test("create rejected via API for a disabled provider; modelUsage omits disabled providers", async () => {
        const { ctx, conn } = await setup();
        await ctx.fns.models.create({ provider: "beta", accountName: "b-" + crypto.randomUUID(), config: {}, secrets: {} });
        await disable(ctx, ["acme"]);
        const res = await post(ctx, { action: "create", provider: "acme", accountName: "x-" + crypto.randomUUID(), config: {}, secrets: {} });
        expect(res.status).toBe(409);
        expect((await res.json() as { code: string }).code).toBe("PROVIDER_DISABLED");
        const usage = await ctx.fns.frontendBridge.modelUsage({});
        expect(usage.connections.some((c: { id: string }) => c.id === conn.id)).toBe(false);
        expect(usage.connections.every((c: { provider: string }) => c.provider === "beta")).toBe(true);
    });
});

describe("settings.set SETTING_FIXED structure", () => {
    test("fixed-setting error carries code, status and path; unrelated failures keep their identity", async () => {
        const dir = await mkdtemp(join(tmpdir(), "mauzcode-setting-fixed-"));
        try {
            await writeFile(join(dir, "$settings_models.json"), JSON.stringify({ disabledProviders: [] }));
            const { ctx } = await setup({ settingsDir: dir });
            await ctx.fns.settings.files({ force: true });
            const err = await ctx.fns.settings.set({ module: "models", scopeType: "global", key: "disabledProviders", value: ["acme"] }).catch((e: unknown) => e as Error & { code: string; status: number; settingKey: string; fixedBy: string });
            expect(err).toMatchObject({ code: "SETTING_FIXED", status: 409, settingKey: "models.disabledProviders", fixedBy: join(dir, "$settings_models.json") });
            expect(err.message).toContain("is fixed by");
            // An unrelated storage failure must not become SETTING_FIXED.
            const run = ctx.state.registry.procs.db.run;
            ctx.state.registry.procs.db.run = async () => { throw Object.assign(new Error("db down"), { code: "DB", status: 500 }); };
            const other = await ctx.fns.settings.set({ module: "models", scopeType: "global", key: "usageWarnPercent", value: 40 }).catch((e: unknown) => e as { code?: string });
            ctx.state.registry.procs.db.run = run;
            expect(other.code).toBe("DB");
        } finally { await rm(dir, { recursive: true, force: true }); }
    });
});

describe("admission boundary (deterministic barriers, no sleeps)", () => {
    test("an operation admitted before the disable write may finish; the next request rechecks", async () => {
        const { ctx, seen, conn } = await setup();
        // Barrier: hold the provider stream inside its invocation until the disable write has succeeded.
        let entered!: () => void; let release!: () => void;
        const enteredP = new Promise<void>(r => { entered = r; });
        const releaseP = new Promise<void>(r => { release = r; });
        const def = ctx.state.models.providers.acme.definition;
        const original = def.stream!;
        def.stream = async (c: Context, cn: types.models.ResolvedConnection, r: types.models.StreamRequest) => { entered(); await releaseP; return original(c, cn, r); };
        const inflight = ctx.fns.models.stream(req(conn.id, "m1"));
        await enteredP; // The availability check already passed; provider invocation started.
        await disable(ctx, ["acme"]); // The write succeeds while the admitted stream is running.
        // A check reading after the write blocks a new request immediately.
        await expect(ctx.fns.models.stream(req(conn.id, "m2"))).rejects.toMatchObject({ code: "PROVIDER_DISABLED" });
        release();
        const done = await inflight; // The admitted stream is not cancelled and finishes.
        expect(done.text).toBe("hi m1");
        expect(seen.stream).toBe(1);
        def.stream = original;
        // The next inference request after re-enable passes again with a fresh check.
        await disable(ctx, []);
        expect((await ctx.fns.models.stream(req(conn.id, "m1"))).text).toBe("hi m1");
    });

    test("an availability check after the toggle blocks provider invocation even before network", async () => {
        const { ctx, seen, conn } = await setup();
        // Barrier inside the guard's read-through: the toggle write lands while the check is in flight,
        // and the check observes storage only after that write — it must block provider invocation.
        const reader = ctx.state.registry.models.disabledProviders;
        let reading!: () => void; let proceed!: () => void;
        const readingP = new Promise<void>(r => { reading = r; });
        const proceedP = new Promise<void>(r => { proceed = r; });
        let armed = true;
        ctx.state.registry.models.disabledProviders = async (c: any, s: any, o: any) => {
            if (armed) { armed = false; reading(); await proceedP; }
            return reader(c, s, o);
        };
        const attempt = ctx.fns.models.stream(req(conn.id, "m1"));
        // Observe the outcome through a plain derived promise; awaiting expect().rejects across
        // the barrier deadlocks bun's matcher, so assert on the settled shape afterwards.
        const outcome = attempt.then(() => null, (e: { code?: string }) => e.code ?? "unknown");
        await readingP;
        await disable(ctx, ["acme"]); // settings.set writes directly; it does not go through the reader stub.
        proceed();
        expect(await outcome).toBe("PROVIDER_DISABLED");
        expect(seen.stream + seen.fetch).toBe(0);
    });
});