import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

const def = (id: string, inference?: types.models.ProviderDefinition["inference"]): types.models.ProviderDefinition => ({
    id, label: id, fields: [], transports: ["direct"], ...(inference ? { inference } : {}),
    test: async () => ({ status: "available", reason: "ok", message: "ok", checkedAt: Date.now() }),
    listModels: async () => [{ id: "glm-5.3" }, { id: "glm-5.1" }, { id: "own", contextWindow: 64000 }],
});

async function setup(dev: Record<string, unknown> = {}) {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") } });
    ctx.state.models ??= {};
    ctx.state.models.providers = {
        zc: { owner: "core", module: "models", rel: "models/$modelProvider_zc.ts", definition: def("zc", { priceVendor: "zai", catalog: { modelsDev: ["zai-coding-plan", "zai"], piAi: ["zai"] } }) },
        pv: { owner: "core", module: "models", rel: "models/$modelProvider_pv.ts", definition: def("pv", { priceVendor: "zai" }) },
        bare: { owner: "core", module: "models", rel: "models/$modelProvider_bare.ts", definition: def("bare") },
    };
    ctx.state.models.health = {};
    const calls: unknown[] = [];
    ctx.state.registry.models.catalog.priceCatalog = async (_c: unknown, _s: unknown, opts: unknown) => { calls.push(opts); return dev; };
    return { ctx, calls };
}

beforeAll(async () => { await mkTestCtx(); }, 60000);

describe("models.catalog.contextLimit with catalogue", () => {
    test("override, provider, catalogue, fallback", async () => {
        const ctx = await mkTestCtx();
        expect(ctx.fns.models.catalog.contextLimit({ catalog: 1000000 })).toEqual({ provider: null, override: null, catalog: 1000000, effective: 1000000, source: "catalog" });
        expect(ctx.fns.models.catalog.contextLimit({ provider: 64000, catalog: 1000000 }).source).toBe("provider");
        expect(ctx.fns.models.catalog.contextLimit({ override: 5000, catalog: 1000000 })).toEqual({ provider: null, override: 5000, catalog: 1000000, effective: 5000, source: "override" });
        expect(ctx.fns.models.catalog.contextLimit({ catalog: -3 })).toEqual({ provider: null, override: null, effective: 200000, source: "fallback" });
    });
});

describe("models.catalog.catalogLimits", () => {
    test("models.dev sections in order, cache-only, then pi-ai", async () => {
        const { ctx, calls } = await setup({
            "zai-coding-plan": { models: { "glm-5.3": { limit: { context: 777000, output: 1000 } } } },
            zai: { models: { "glm-5.3": { limit: { context: 1 } }, "glm-5.1": { limit: { context: 555000 } } } },
        });
        const r = await ctx.fns.models.catalog.catalogLimits({ provider: "zc", models: ["glm-5.3", "glm-5.1", "glm-4.7", "nope"] });
        expect(r["glm-5.3"]).toEqual({ context: 777000, output: 1000, source: "models.dev" });
        expect(r["glm-5.1"]).toEqual({ context: 555000, source: "models.dev" });
        expect(r["glm-4.7"]?.source).toBe("pi-ai");
        expect(r["glm-4.7"]?.context).toBeGreaterThan(0);
        expect(r.nope).toBeUndefined();
        expect(calls).toEqual([{ cacheOnly: true }]);
    });

    test("cold models.dev falls back to bundled pi-ai data", async () => {
        const { ctx } = await setup({});
        const r = await ctx.fns.models.catalog.catalogLimits({ provider: "zc", models: ["glm-5.3"] });
        expect(r["glm-5.3"]).toEqual({ context: 1000000, output: 131072, source: "pi-ai" });
    });

    test("sections default to the price vendor; providers without either get no lookup", async () => {
        const { ctx, calls } = await setup({ zai: { models: { "glm-5.1": { limit: { context: 555000 } } } } });
        expect((await ctx.fns.models.catalog.catalogLimits({ provider: "pv", models: ["glm-5.1"] }))["glm-5.1"]?.context).toBe(555000);
        expect(await ctx.fns.models.catalog.catalogLimits({ provider: "bare", models: ["glm-5.3"] })).toEqual({});
        expect(await ctx.fns.models.catalog.catalogLimits({ provider: "unknown", models: ["glm-5.3"] })).toEqual({});
        expect(calls.length).toBe(1);
    });
});

describe("route resolution with catalogue limits", () => {
    test("catalogue fills context and output only where the provider is silent", async () => {
        const { ctx } = await setup({});
        const conn = await ctx.fns.models.create({ provider: "zc", accountName: "plan-" + crypto.randomUUID(), config: {}, secrets: {} });
        await ctx.fns.models.listModels({ id: conn.id, refresh: true });
        const route = (m: string) => `zc/${conn.accountName}:${m}`;
        const r = await ctx.fns.models.resolveRoute({ route: route("glm-5.3") });
        expect(r.contextLimit).toEqual({ provider: null, override: null, catalog: 1000000, effective: 1000000, source: "catalog" });
        expect(r.contextWindow).toBe(1000000);
        expect(r.maxOutputTokens).toBe(131072);
        expect(await ctx.fns.compaction.contextWindow({ model: route("glm-5.3") })).toBe(1000000);
        expect((await ctx.fns.models.resolveRoute({ route: route("own") })).contextLimit?.source).toBe("provider");
        const saved = await ctx.fns.models.setContextLimits({ id: conn.id, limits: { "glm-5.3": 300000 } });
        expect(saved.limits["glm-5.3"]).toEqual({ provider: null, override: 300000, catalog: 1000000, effective: 300000, source: "override" });
        const reset = await ctx.fns.models.setContextLimits({ id: conn.id, limits: { "glm-5.3": null } });
        expect(reset.limits["glm-5.3"]?.source).toBe("catalog");
    });
});

describe("models.catalog.priceCatalog cacheOnly", () => {
    test("does not wait for the network on a cold cache", async () => {
        const ctx = await mkTestCtx();
        const state = ctx.state as typeof ctx.state & { modelsPriceCatalog?: unknown };
        const saved = state.modelsPriceCatalog;
        let release!: () => void;
        state.modelsPriceCatalog = { pending: new Promise<void>(r => { release = r; }), timer: 1 as unknown as ReturnType<typeof setInterval> };
        try {
            expect(await ctx.fns.models.catalog.priceCatalog({ cacheOnly: true })).toEqual({});
        } finally { release(); state.modelsPriceCatalog = saved; }
    });
});
