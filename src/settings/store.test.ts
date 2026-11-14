import { describe, test, expect } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

describe("settings store", () => {
    test("set/get roundtrip for global and agent scopes", async () => {
        const ctx = await mkTestCtx();

        await ctx.fns.settings.set({
            module: "llm",
            scopeType: "global",
            key: "defaultModel",
            value: "openai:gpt-4o-mini",
        });
        await ctx.fns.settings.set({
            module: "ui",
            scopeType: "agent",
            scopeId: "b",
            key: "debounceMs",
            value: 250,
        });

        expect(await ctx.fns.settings.get({
            module: "llm",
            scopeType: "global",
            key: "defaultModel",
        })).toBe("openai:gpt-4o-mini");

        expect(await ctx.fns.settings.get({
            module: "ui",
            scopeType: "agent",
            scopeId: "b",
            key: "debounceMs",
        })).toBe(250);
    });

    test("list returns scope entries and remove deletes one", async () => {
        const ctx = await mkTestCtx();

        await ctx.fns.settings.set({ module: "provider", scopeType: "provider", scopeId: "openai", key: "apiKey", value: "sk-1", isSecret: true });
        await ctx.fns.settings.set({ module: "provider", scopeType: "provider", scopeId: "openai", key: "baseUrl", value: "https://api.openai.com/v1" });

        const before = await ctx.fns.settings.list({ module: "provider", scopeType: "provider", scopeId: "openai" });
        expect(before.map((x: any) => x.key).sort()).toEqual(["apiKey", "baseUrl"]);

        await ctx.fns.settings.remove({ module: "provider", scopeType: "provider", scopeId: "openai", key: "apiKey" });
        const after = await ctx.fns.settings.list({ module: "provider", scopeType: "provider", scopeId: "openai" });
        expect(after.map((x: any) => x.key)).toEqual(["baseUrl"]);
    });

    test("getNumber/getString fall back when missing or wrong type", async () => {
        const ctx = await mkTestCtx();

        await ctx.fns.settings.set({ module: "ui", scopeType: "global", key: "debounceMs", value: "not-a-number" });

        expect(await ctx.fns.settings.getNumber({ module: "ui", scopeType: "global", key: "debounceMs", fallback: 500 })).toBe(500);
        expect(await ctx.fns.settings.getString({ module: "ui", scopeType: "global", key: "missing", fallback: "x" })).toBe("x");
    });
});

describe("settings integration", () => {
    test("retired endpoint resolver is not registered even with stored legacy settings", async () => {
        const ctx = await mkTestCtx();
        await ctx.fns.settings.set({ module: "llm", scopeType: "global", key: "lmstudioBaseUrl", value: "http://from-settings:9999" });
        expect(ctx.state.registry.llm).toBeUndefined();
        expect(await ctx.fns.settings.get({ module: "llm", scopeType: "global", key: "lmstudioBaseUrl" })).toBe("http://from-settings:9999");
    });

    test("agent POST route uses agent setting debounceMs by default", async () => {
        const ctx = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test", systemPrompt: "" });
        await ctx.fns.session.save({ agent });
        (ctx.state as any).agent = { [agent.id]: agent };

        await ctx.fns.settings.set({
            module: "ui",
            scopeType: "agent",
            scopeId: agent.id,
            key: "debounceMs",
            value: 1200,
        });

        const t0 = Date.now();
        const res = await ctx.fns.procs.http.dispatch({ method: "POST", url: "/agent/" + agent.id, body: "hello" });
        expect(res.status).toBe(200);

        const body: any = await res.json();
        expect(body.sendAt - t0).toBeGreaterThanOrEqual(1100);
    });

    test("ui.createAgent uses the resolvable last-used model and ignores llm.defaultModel and MODEL", async () => {
        const ctx = await mkTestCtx();
        ctx.fns.agent.systemPrompt = async (_c: any, _s: any, _o: any) => "sys";
        // Conflicting legacy sources that the 3.1 contract must ignore.
        ctx.env.MODEL = "legacy-env:should-not-be-used";
        await ctx.fns.settings.set({ module: "llm", scopeType: "global", key: "defaultModel", value: "openai:gpt-4o-mini" });
        const last = "codex/work:gpt-6-astra";
        await ctx.fns.procs.db.run({ sql: "DELETE FROM kv WHERE key = 'last-model'", params: [] });
        await ctx.fns.procs.db.run({ sql: "INSERT INTO kv (key, value) VALUES ('last-model', ?)", params: [last] });
        const resolved: string[] = [];
        ctx.state.registry.models.resolveRoute = async (_c: any, _s: any, o: any) => {
            resolved.push(o.route);
            if (o.route !== last) throw Object.assign(new Error("not found"), { code: "CONNECTION_NOT_FOUND" });
            return { route: o.route };
        };

        const r = await ctx.fns.ui.createAgent({ open: false });
        expect(r.model).toBe(last);
        expect(resolved).toEqual([last]);
    });
});
