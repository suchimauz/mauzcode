import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

beforeAll(async () => { await mkTestCtx(); }, 60000);

const conn = (id: string, provider: string, accountName: string, extra: Record<string, unknown> = {}) =>
    ({ id, provider, providerRegistered: true, accountName, config: {}, secrets: {}, transport: { kind: "direct" }, enabled: true, disabledModels: [], createdAt: 1, updatedAt: 1, ...extra });

async function selection(opts: { last?: string; resolvable?: string[]; connections: any[]; models: Record<string, string[]> }) {
    const ctx = await mkTestCtx({ env: { MODEL: "env:should-not-be-read" } });
    await ctx.fns.procs.db.run({ sql: "DELETE FROM kv WHERE key = 'last-model'", params: [] });
    if (opts.last) await ctx.fns.procs.db.run({ sql: "INSERT INTO kv (key, value) VALUES ('last-model', ?)", params: [opts.last] });
    const reg = ctx.state.registry;
    reg.models.resolveRoute = async (_c: any, _s: any, o: any) => { if (!opts.resolvable?.includes(o.route)) throw Object.assign(new Error("gone"), { code: "CONNECTION_NOT_FOUND" }); return { route: o.route }; };
    reg.models.list = async () => opts.connections;
    reg.models.listModels = async (_c: any, _s: any, o: any) => ({ models: (opts.models[o.id] ?? []).map(id => ({ id })), source: "manual", cachedAt: null });
    let legacyRead = false;
    const get = reg.settings.get;
    reg.settings.get = async (c: any, s: any, o: any) => { if (o.module === "llm" && o.key === "defaultModel") legacyRead = true; return get(c, s, o); };
    return { ctx, legacyRead: () => legacyRead };
}

describe("model selection without a default setting", () => {
    test("last used model wins when it resolves", async () => {
        const { ctx, legacyRead } = await selection({ last: "codex/su4imauz:gpt-6-astra", resolvable: ["codex/su4imauz:gpt-6-astra"], connections: [conn("a", "claude", "w")], models: { a: ["claude-x"] } });
        const created = await ctx.fns.ui.createAgent({ open: false });
        expect(created.model).toBe("codex/su4imauz:gpt-6-astra");
        expect(legacyRead()).toBe(false);
    });
    test("unresolvable last model falls back to the earliest enabled connection's first enabled model", async () => {
        const { ctx } = await selection({ last: "codex/removed:gpt", connections: [conn("d", "claude", "off", { enabled: false }), conn("a", "claude", "work", { disabledModels: ["claude-a"] }), conn("b", "codex", "me")], models: { d: ["z"], a: ["claude-a", "claude-b"], b: ["gpt"] } });
        expect(await ctx.fns.settings.modelDefault({})).toBe("claude/work:claude-b");
    });
    test("no usable model fails with NO_MODEL and stores no agent", async () => {
        const { ctx } = await selection({ connections: [conn("a", "claude", "w", { enabled: false })], models: {} });
        const before = await ctx.fns.procs.db.select({ sql: "SELECT count(*)::int AS n FROM agents", params: [] });
        await expect(ctx.fns.ui.createAgent({ open: false })).rejects.toMatchObject({ code: "NO_MODEL" });
        expect(await ctx.fns.procs.db.select({ sql: "SELECT count(*)::int AS n FROM agents", params: [] })).toEqual(before);
    });
});

describe("localization model setting", () => {
    test("invalid route rejected on set, valid and empty accepted", async () => {
        const ctx = await mkTestCtx();
        await expect(ctx.fns.settings.set({ module: "models", scopeType: "global", key: "localizationModel", value: "claude-code:claude-opus-5" })).rejects.toMatchObject({ code: "INVALID_SETTING" });
        await ctx.fns.settings.set({ module: "models", scopeType: "global", key: "localizationModel", value: "claude/work:claude-opus-5-5" });
        expect(await ctx.fns.runtime.localizationModel({})).toBe("claude/work:claude-opus-5-5");
        await ctx.fns.settings.set({ module: "models", scopeType: "global", key: "localizationModel", value: "" });
        ctx.state.registry.settings.modelDefault = async () => "codex/me:gpt-6";
        expect(await ctx.fns.runtime.localizationModel({})).toBe("codex/me:gpt-6");
    });
    test("empty setting localizes through the selected model via models.call only", async () => {
        const ctx = await mkTestCtx();
        const reg = ctx.state.registry; const calls: any[] = [];
        reg.settings.modelDefault = async () => "codex/me:gpt-6";
        reg.models.resolveRoute = async (_c: any, _s: any, o: any) => ({ route: o.route, model: "gpt-6", connectionId: "c1" });
        reg.models.call = async (_c: any, _s: any, o: any) => { calls.push(o); const name = JSON.parse(o.user).capability.name; return { text: JSON.stringify({ name, text: "x".repeat(130) }) }; };
        const out = await ctx.fns.runtime.localize({ functions: [{ name: "a.b", text: "src" }], locales: ["ru"] });
        expect(out).toMatchObject({ provider: "codex", model: "codex/me:gpt-6", failed: [] });
        expect(out.localized["a.b"]).toHaveLength(130);
        expect(calls[0]).toMatchObject({ connectionId: "c1", model: "gpt-6", responseFormat: { type: "json_schema" } });
    });
});

describe("token price lookup", () => {
    test("vendor-keyed prices; unknown model and no-vendor provider map to null", async () => {
        const ctx = await mkTestCtx();
        const reg = ctx.state.registry;
        const vendors: Record<string, string | undefined> = { claude: "anthropic", custom: undefined };
        reg.models.inference.resolveRoute = async (_c: any, _s: any, o: any) => { const [head, model] = [o.route.slice(0, o.route.indexOf(":")), o.route.slice(o.route.indexOf(":") + 1)]; const p = head.split("/")[0]; return { route: o.route, model, ...(vendors[p] ? { priceVendor: vendors[p] } : {}) }; };
        reg.models.catalog.priceCatalog = async () => ({ anthropic: { models: { "claude-opus-5-5": { cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 } } } }, openai: { models: { "claude-opus-5-5": { cost: { input: 1, output: 1 } } } } });
        const r = await ctx.fns.models.tokenPrice({ routes: ["claude/2yfl55fsh:claude-opus-5-5", "claude/2yfl55fsh:unknown", "custom/x:claude-opus-5-5"] });
        expect(r).toEqual({ "claude/2yfl55fsh:claude-opus-5-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }, "claude/2yfl55fsh:unknown": null, "custom/x:claude-opus-5-5": null });
    });
    test("no catalogue fetch without a vendor", async () => {
        const ctx = await mkTestCtx(); let fetched = false;
        ctx.state.registry.models.inference.resolveRoute = async (_c: any, _s: any, o: any) => ({ route: o.route, model: "m" });
        ctx.state.registry.models.catalog.priceCatalog = async () => { fetched = true; return {}; };
        expect(await ctx.fns.models.tokenPrice({ routes: ["custom/x:m"] })).toEqual({ "custom/x:m": null });
        expect(fetched).toBe(false);
    });
});

describe("aggregated usage, quotas and icons", () => {
    async function usageCtx() {
        const ctx = await mkTestCtx();
        const reg = ctx.state.registry;
        let llmCalls = 0;
        for (const ns of ["llm", "llms"]) if (reg[ns]) for (const k of Object.keys(reg[ns])) if (typeof reg[ns][k] === "function") reg[ns][k] = async () => { llmCalls++; throw new Error("legacy"); };
        reg.models.list = async () => [conn("a", "codex", "me"), conn("b", "claude", "work"), conn("c", "custom", "api"), conn("d", "codex", "off", { enabled: false })];
        reg.models.usage = async (_c: any, _s: any, o: any) => {
            if (o.id === "b") throw new Error("boom");
            if (o.id === "a") return { status: "available", plan: "pro", checkedAt: 5, windows: [{ label: "Session (5h)", usedPercent: 80 }, { label: "Weekly", usedPercent: 30 }, { label: "Other", usedPercent: 10 }] };
            return { status: "configured", checkedAt: 6 };
        };
        return { ctx, llmCalls: () => llmCalls };
    }
    test("thresholds classify windows and one failing connection does not hide the others", async () => {
        const { ctx, llmCalls } = await usageCtx();
        const view = await ctx.fns.frontendBridge.modelUsage({});
        expect(view.thresholds).toEqual({ warn: 30, critical: 60, alert: 75 });
        expect(view.connections.map((c: any) => c.id)).toEqual(["a", "b", "c"]);
        expect(view.connections[0].windows.map((w: any) => w.level)).toEqual(["alert", "warning", "normal"]);
        expect(view.connections[0].level).toBe("alert");
        expect(view.connections[1]).toMatchObject({ status: "unavailable", level: "normal", windows: [] });
        expect(view.connections[2]).toMatchObject({ status: "configured", windows: [] });
        await ctx.fns.settings.set({ module: "models", scopeType: "global", key: "usageAlertPercent", value: 90 });
        expect((await ctx.fns.frontendBridge.modelUsage({})).connections[0].windows[0].level).toBe("critical");
        expect(llmCalls()).toBe(0);
    });
    test("/api/v1/quotas keeps { updatedAt, accounts } without legacy calls", async () => {
        const { ctx, llmCalls } = await usageCtx();
        const route = (await import("../api/$route_v1_quotas_GET")).default;
        const body: any = await (await route(ctx, null, { req: new Request("http://x/api/v1/quotas"), params: {} })).json();
        expect(Object.keys(body).sort()).toEqual(["accounts", "updatedAt"]);
        expect(body.accounts[0]).toMatchObject({ provider: "codex", account: "me", kind: "quota", tone: "error", planType: "pro", windows: { fiveHour: { usedPercent: 80, tone: "error" }, weekly: { usedPercent: 30, tone: "warning" } } });
        expect(body.accounts[1]).toMatchObject({ provider: "claude", kind: "status", status: "unavailable", tone: "error" });
        expect(body.accounts[2]).toMatchObject({ provider: "custom", kind: "status", status: "unknown" });
        // Quota cards carry the shared provider mark: brands for codex/claude, the plug for custom.
        for (const a of body.accounts) expect(a.icon).toEqual(await ctx.fns.frontendBridge.modelMark({ provider: a.provider }));
        expect(body.accounts[0].icon.src).not.toEqual(body.accounts[1].icon.src);
        expect(llmCalls()).toBe(0);
    });
    test("provider icons come from registered declarations only", async () => {
        const ctx = await mkTestCtx();
        const res = await ctx.fns.frontendBridge.providerIcons({ req: new Request("http://x/icons") });
        const { icons } = await res.json();
        expect(Object.keys(icons).sort()).toEqual(["claude", "codex", "custom"]);
        for (const id of ["claude", "codex", "custom"]) expect(icons[id].src).toStartWith("data:image/svg+xml,");
        expect(await ctx.fns.frontendBridge.declaredIcon({ icon: "NoSuchIconAnywhere" })).toBeNull();
        expect(await ctx.fns.frontendBridge.declaredIcon({ icon: "javascript:alert(1)" })).toBeNull();
    });
});

describe("settings status and borrowed keys", () => {
    test("status reports env key flags only, no llm call", async () => {
        const ctx = await mkTestCtx({ env: { OPENAI_API_KEY: "sk-test-secret" } });
        for (const k of Object.keys(ctx.state.registry.llm ?? {})) ctx.state.registry.llm[k] = async () => { throw new Error("legacy llm called"); };
        const status = await ctx.fns.settings.status({});
        expect(status).toEqual({ openai: { set: true }, anthropic: { set: false }, kimi: { set: false }, groq: { set: false }, openrouter: { set: false } });
        expect(JSON.stringify(status)).not.toContain("sk-test-secret");
    });
    test("migrations copy legacy references, not values, and keep existing module keys", async () => {
        const ctx = await mkTestCtx();
        const run = (sql: string, params: unknown[] = []) => ctx.fns.procs.db.run({ sql, params });
        await run("DELETE FROM settings WHERE key IN ('openaiApiKey','openrouterApiKey')");
        await run("INSERT INTO settings (module,scope_type,scope_id,key,value,is_secret,updated_at) VALUES ('llm','global','','openaiApiKey',?,1,1),('llm','global','','openrouterApiKey',?,1,1),('decision','global','','openaiApiKey',?,1,1)",
            [JSON.stringify("secret://llm/openai"), JSON.stringify("secret://llm/openrouter"), JSON.stringify("secret://decision/own")]);
        for (const p of ["../embeddings/$migration_20370404120000_relocate_openaiApiKey", "../decision/$migration_20370404120000_relocate_openaiApiKey", "../jev/$migration_20370404120000_relocate_openrouterApiKey"]) await (await import(p)).default.up(ctx);
        const rows = await ctx.fns.procs.db.select({ sql: "SELECT module,key,value,is_secret FROM settings WHERE key IN ('openaiApiKey','openrouterApiKey') AND module <> 'llm' ORDER BY module", params: [] });
        expect(rows).toEqual([
            { module: "decision", key: "openaiApiKey", value: JSON.stringify("secret://decision/own"), is_secret: 1 },
            { module: "embeddings", key: "openaiApiKey", value: JSON.stringify("secret://llm/openai"), is_secret: 1 },
            { module: "jev", key: "openrouterApiKey", value: JSON.stringify("secret://llm/openrouter"), is_secret: 1 },
        ]);
        const read: string[] = [];
        ctx.state.registry.secrets.resolveSetting = async (_c: any, _s: any, o: any) => { read.push(`${o.module}.${o.key}`); return "k"; };
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1] }] }), { status: 200 })) as any;
        try { await ctx.fns.embeddings.openai({ input: "x" }); } finally { globalThis.fetch = realFetch; }
        expect(read).toEqual(["embeddings.openaiApiKey"]);
    });
});
