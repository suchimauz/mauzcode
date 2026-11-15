import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import api from "./api";

let discovered: types.models.ModelInfo[] = [{ id: "m1", contextWindow: 262144 }, { id: "m2" }];
let failDiscovery = false;
const seen = { stream: 0, fetch: 0, list: 0 };

function provider(): types.models.ProviderDefinition {
    return {
        id: "acme", label: "Acme",
        fields: [],
        transports: ["direct"],
        test: async () => ({ status: "available", reason: "ok", message: "ok", checkedAt: Date.now() }),
        listModels: async () => { seen.list++; if (failDiscovery) throw new Error("discovery down"); return discovered; },
        stream: async (_ctx, _conn, req) => { seen.stream++; return { text: "hi " + req.model, thinking: "", finishReason: "stop", usage: { prompt_tokens: 1, completion_tokens: 1 } } as types.models.StreamResult; },
    };
}

async function setup() {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") } });
    ctx.state.models ??= {};
    ctx.state.models.providers = { acme: { owner: "core", module: "models", rel: "models/$modelProvider_acme.ts", definition: provider() } };
    ctx.state.models.health = {};
    ctx.state.registry.models.transport.fetch = async () => { seen.fetch++; return new Response("{}"); };
    discovered = [{ id: "m1", contextWindow: 262144 }, { id: "m2" }];
    failDiscovery = false;
    const name = "work-" + crypto.randomUUID();
    const conn = await ctx.fns.models.create({ provider: "acme", accountName: name, config: {}, secrets: {} });
    await ctx.fns.models.listModels({ id: conn.id, refresh: true });
    return { ctx, conn, route: (m: string, account = name) => `acme/${account}:${m}` };
}

beforeAll(async () => { await mkTestCtx(); }, 60000);

describe("models.catalog.contextLimit", () => {
    test("override, then provider, then 200000 fallback", async () => {
        const ctx = await mkTestCtx();
        expect(ctx.fns.models.catalog.contextLimit({})).toEqual({ provider: null, override: null, effective: 200000, source: "fallback" });
        expect(ctx.fns.models.catalog.contextLimit({ provider: 262144 })).toEqual({ provider: 262144, override: null, effective: 262144, source: "provider" });
        expect(ctx.fns.models.catalog.contextLimit({ provider: 262144, override: 128000 })).toEqual({ provider: 262144, override: 128000, effective: 128000, source: "override" });
        // An explicit override may exceed the provider value: provider data is a default, not a ceiling.
        expect(ctx.fns.models.catalog.contextLimit({ provider: 1000, override: 5000 }).effective).toBe(5000);
        expect(ctx.fns.models.catalog.contextLimit({ provider: -1, override: 0 }).source).toBe("fallback");
    });
});

describe("models.setContextLimits", () => {
    test("override wins, provider metadata is preserved, reset follows the current default", async () => {
        const { ctx, conn, route } = await setup();
        expect((await ctx.fns.models.resolveRoute({ route: route("m2") })).contextLimit).toEqual({ provider: null, override: null, effective: 200000, source: "fallback" });
        expect(await ctx.fns.compaction.contextWindow({ model: route("m2") })).toBe(200000);
        const saved = await ctx.fns.models.setContextLimits({ id: conn.id, limits: { m1: 128000 } });
        expect(saved).toEqual({ overrides: { m1: 128000 }, limits: { m1: { provider: 262144, override: 128000, effective: 128000, source: "override" } } });
        const r = await ctx.fns.models.resolveRoute({ route: route("m1") });
        expect(r.contextWindow).toBe(128000);
        expect(r.contextLimit).toEqual({ provider: 262144, override: 128000, effective: 128000, source: "override" });
        expect(await ctx.fns.compaction.contextWindow({ model: route("m1") })).toBe(128000);
        // Provider cache keeps raw metadata.
        expect((await ctx.fns.models.listModels({ id: conn.id })).models.find((m: types.models.ModelInfo) => m.id === "m1")?.contextWindow).toBe(262144);
        // Reset after the provider default changed resolves the current default, not a snapshot.
        discovered = [{ id: "m1", contextWindow: 300000 }, { id: "m2" }];
        await ctx.fns.models.listModels({ id: conn.id, refresh: true });
        await ctx.fns.models.setContextLimits({ id: conn.id, limits: { m1: null } });
        expect(await ctx.fns.compaction.contextWindow({ model: route("m1") })).toBe(300000);
        expect(seen.stream).toBe(0);
    });

    test("rejects invalid patches whole, isolates models and connections, keeps availability", async () => {
        const { ctx, conn } = await setup();
        const other = await ctx.fns.models.create({ provider: "acme", accountName: "other-" + crypto.randomUUID(), config: {}, secrets: {} });
        await ctx.fns.models.setModelEnabled({ id: conn.id, model: "m2", enabled: false });
        await ctx.fns.models.setContextLimits({ id: conn.id, limits: { m1: 100000 } });
        for (const bad of [0, -5, 1.5, "1000", Number.MAX_SAFE_INTEGER + 1, Number.NaN, Infinity]) {
            await expect(ctx.fns.models.setContextLimits({ id: conn.id, limits: { m2: 64000, m1: bad as number } })).rejects.toMatchObject({ code: "VALIDATION" });
        }
        await expect(ctx.fns.models.setContextLimits({ id: conn.id, limits: { "bad id": 1000 } })).rejects.toMatchObject({ code: "VALIDATION" });
        await expect(ctx.fns.models.setContextLimits({ id: conn.id, limits: {} })).rejects.toMatchObject({ code: "VALIDATION" });
        await expect(ctx.fns.models.setContextLimits({ id: crypto.randomUUID(), limits: { m1: 1000 } })).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(await ctx.fns.models.catalog.contextOverrides({ id: conn.id })).toEqual({ m1: 100000 });
        await ctx.fns.models.setContextLimits({ id: conn.id, limits: { m2: 64000 } });
        expect(await ctx.fns.models.catalog.contextOverrides({ id: conn.id })).toEqual({ m1: 100000, m2: 64000 });
        expect(await ctx.fns.models.catalog.contextOverrides({ id: other.id })).toEqual({});
        expect((await ctx.fns.models.get({ id: conn.id })).disabledModels).toEqual(["m2"]);
        // Concurrent different-model patches both survive.
        await Promise.all([1, 2, 3, 4, 5].map(n => ctx.fns.models.setContextLimits({ id: conn.id, limits: { ["c" + n]: n * 1000 } })));
        expect(Object.keys(await ctx.fns.models.catalog.contextOverrides({ id: conn.id })).sort()).toEqual(["c1", "c2", "c3", "c4", "c5", "m1", "m2"]);
    });

    test("survives refresh, refresh failure, disappearance and rename; deleted with the connection", async () => {
        const { ctx, conn } = await setup();
        await ctx.fns.models.setContextLimits({ id: conn.id, limits: { m2: 50000 } });
        discovered = [{ id: "m1" }];
        await ctx.fns.models.listModels({ id: conn.id, refresh: true });
        failDiscovery = true;
        expect((await ctx.fns.models.listModels({ id: conn.id, refresh: true })).error).toBeTruthy();
        failDiscovery = false;
        const renamed = "renamed-" + crypto.randomUUID();
        await ctx.fns.models.update({ id: conn.id, accountName: renamed });
        expect(await ctx.fns.models.catalog.contextOverrides({ id: conn.id })).toEqual({ m2: 50000 });
        discovered = [{ id: "m1" }, { id: "m2", contextWindow: 999999 }];
        await ctx.fns.models.listModels({ id: conn.id, refresh: true });
        expect(await ctx.fns.compaction.contextWindow({ model: `acme/${renamed}:m2` })).toBe(50000);
        await ctx.fns.models.remove({ id: conn.id });
        const again = await ctx.fns.models.create({ provider: "acme", accountName: renamed, config: {}, secrets: {} });
        expect(await ctx.fns.models.catalog.contextOverrides({ id: again.id })).toEqual({});
    });

    test("overrides never reach the upstream request", async () => {
        const { ctx, conn } = await setup();
        await ctx.fns.models.setContextLimits({ id: conn.id, limits: { m1: 4096 } });
        let request: Record<string, unknown> | null = null;
        ctx.state.models!.providers!.acme!.definition.stream = async (_c: Context, _conn: types.models.ResolvedConnection, req: types.models.StreamRequest) => { request = req as unknown as Record<string, unknown>; return { text: "ok", thinking: "", finishReason: "stop", usage: { prompt_tokens: 1, completion_tokens: 1 } } as types.models.StreamResult; };
        await ctx.fns.models.stream({ connectionId: conn.id, model: "m1", instructions: "x", messages: [{ role: "user", content: "hi" }], sessionId: "s" });
        expect(JSON.stringify(request)).not.toContain("4096");
    });
});

describe("models.api setContextLimits", () => {
    test("owner-only, CSRF-protected, validated; models reply carries limits", async () => {
        const { ctx, conn } = await setup();
        ctx.state.registry.auth.verifyCsrf = async (_c: unknown, _s: unknown, o: { token: string }) => o.token === "good";
        const owner = { user: { id: "u1", role: "owner" } } as unknown as Session;
        const member = { user: { id: "u2", role: "member" } } as unknown as Session;
        const post = (body: unknown, session: Session = owner, token = "good") => api(ctx, session, { req: new Request("http://local/models/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-csrf-token": token } }) });
        expect((await post({ action: "setContextLimits", id: conn.id, limits: { m1: 1000 } }, member)).status).toBe(403);
        expect((await post({ action: "setContextLimits", id: conn.id, limits: { m1: 1000 } }, owner, "bad")).status).toBeGreaterThanOrEqual(400);
        expect((await post({ action: "setContextLimits", id: conn.id, limits: { m1: "1000" } })).status).toBe(400);
        expect((await post({ action: "setContextLimits", id: conn.id, limits: [1] })).status).toBe(400);
        expect(await ctx.fns.models.catalog.contextOverrides({ id: conn.id })).toEqual({});
        const res = await post({ action: "setContextLimits", id: conn.id, limits: { m1: 128000, gone: 7000 } });
        expect(res.status).toBe(200);
        expect(((await res.json()) as { overrides: Record<string, number> }).overrides).toEqual({ m1: 128000, gone: 7000 });
        const list = await (await post({ action: "models", id: conn.id })).json() as { contextOverrides: Record<string, number>; contextLimits: Record<string, types.models.ContextLimit> };
        expect(list.contextOverrides).toEqual({ m1: 128000, gone: 7000 });
        expect(list.contextLimits.m1).toEqual({ provider: 262144, override: 128000, effective: 128000, source: "override" });
        expect(list.contextLimits.m2?.source).toBe("fallback");
    });
});

test("route resolution keeps working before the overrides migration has run", async () => {
    const { ctx, conn, route } = await setup();
    const reg = ctx.state.registry.procs.db; const select = reg.select;
    reg.select = async (_c: unknown, _s: unknown, o: { sql: string; params?: unknown[] }) => {
        if (o.sql.includes("model_context_overrides")) throw Object.assign(new Error('column "model_context_overrides" does not exist'), { errno: "42703" });
        return select(ctx, null, o);
    };
    try {
        expect(await ctx.fns.models.catalog.contextOverrides({ id: conn.id })).toEqual({});
        expect((await ctx.fns.models.resolveRoute({ route: route("m1") })).contextWindow).toBe(262144);
    } finally { reg.select = select; }
});
