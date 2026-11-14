import { beforeAll, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import claude from "./$modelProvider_claude";
import codex from "./$modelProvider_codex";
import facade from "./resolveRoute";

beforeAll(async () => { await mkTestCtx(); }, 60000);
async function setup() {
    const ctx = await mkTestCtx();
    let requests = 0;
    const forbidden = () => { requests++; throw Error("Provider/secret/network access forbidden"); };
    ctx.state.models.providers = {};
    for (const original of [claude, codex, { id: "custom", fields: [], transports: ["direct"], test: forbidden }]) {
        const definition = { ...original, fields: [], validate: undefined, listModels: forbidden };
        ctx.state.models.providers[original.id] = { owner: "core", module: "models", rel: "fixture", definition };
    }
    ctx.state.registry.models.transport.fetch = forbidden;
    ctx.state.registry.secrets.getLocal = forbidden;
    return { ctx, requests: () => requests, create: (provider: string, accountName: string) => ctx.fns.models.create({ provider, accountName }) };
}

test("parse/format preserve account spaces and all native model separators", async () => {
    const { ctx } = await setup();
    for (const [route, expected] of [
        ["codex/su4imauz:gpt-6-astra", { provider: "codex", accountName: "su4imauz", modelId: "gpt-6-astra" }],
        ["custom/Asoft LLM Gate:org/model:v2", { provider: "custom", accountName: "Asoft LLM Gate", modelId: "org/model:v2" }],
    ] as const) {
        const parsed = ctx.fns.models.inference.parseRoute({ route });
        expect(parsed).toEqual(expected);
        expect(ctx.fns.models.inference.formatRoute(parsed)).toBe(route);
    }
    for (const route of ["", "/a:m", "codex/:m", "codex/a:", "codex/a/b:m", "codex/a", "codex/a: "]) {
        expect(() => ctx.fns.models.inference.parseRoute({ route })).toThrow();
        try { ctx.fns.models.inference.parseRoute({ route }); } catch (e) { expect(e).toMatchObject({ code: "INVALID_ROUTE", retryable: false }); }
    }
    for (const route of ["ssh/aeza-criminal-amarant:codex/su4imauz:gpt-6-astra", "codex:gpt-6-astra", "openrouter:org/model:v2", "codex:x/a:m", "anthropic-oauth/whims-hue_7v:claude-opus-5-5"]) {
        await expect(ctx.fns.models.resolveRoute({ route })).rejects.toMatchObject({ code: "LEGACY_ROUTE", retryable: false, message: expect.stringContaining("choose a model") });
    }
    for (const accountName of ["team/main", "team:main"]) expect(() => ctx.fns.models.inference.formatRoute({ provider: "codex", accountName, modelId: "m" })).toThrow();
});

test("resolution is cache-only even on enabled cold caches and returns descriptor defaults", async () => {
    const { ctx, create, requests } = await setup();
    const c = await create("codex", "su4imauz");
    const a = await create("claude", "2yfl55fsh");
    const custom = await create("custom", "Asoft LLM Gate");
    const route = "codex/su4imauz:gpt-6-astra";
    expect(await ctx.fns.models.resolveRoute({ route })).toEqual({ route, connectionId: c.id, provider: "codex", accountName: "su4imauz", model: "gpt-6-astra", modelId: "gpt-6-astra", nativeCompaction: true, priceVendor: "openai" });
    await ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET models_cache=?::jsonb,models_cached_at=? WHERE id=?", params: [JSON.stringify([{ id: "gpt-6-astra", contextWindow: 100000, maxOutputTokens: 4096 }]), 123, c.id] });
    expect(await ctx.fns.models.resolveRoute({ route })).toMatchObject({ contextWindow: 100000, maxOutputTokens: 4096 });
    expect(await ctx.fns.models.resolveRoute({ route: "claude/2yfl55fsh:claude-opus-5-5" })).toMatchObject({ connectionId: a.id, systemPreamble: "You are Claude Code, Anthropic's official CLI for Claude.", priceVendor: "anthropic" });
    const resolved = await ctx.fns.models.resolveRoute({ route: "custom/Asoft LLM Gate:org/model:v2" });
    expect(resolved).toMatchObject({ connectionId: custom.id, nativeCompaction: false });
    for (const key of ["systemPreamble", "priceVendor", "contextWindow", "maxOutputTokens"]) expect(Object.hasOwn(resolved, key)).toBe(false);
    await ctx.fns.models.update({ id: custom.id, config: { models: ["manual"] } });
    expect(await ctx.fns.models.resolveRoute({ route: "custom/Asoft LLM Gate:manual" })).toMatchObject({ model: "manual" });
    expect(requests()).toBe(0);
    // Ordinary discovery still asks the provider on cold cache; only resolution is cache-only.
    await ctx.fns.models.listModels({ id: custom.id });
    expect(requests()).toBe(1);
});

test("missing and freshly disabled connection/model failures are nonretryable and send no request", async () => {
    const { ctx, create, requests } = await setup();
    const c = await create("codex", "work");
    const route = "codex/work:m";
    await expect(ctx.fns.models.resolveRoute({ route: "codex/missing:m" })).rejects.toMatchObject({ code: "CONNECTION_NOT_FOUND", retryable: false, failure: { acceptance: "none" } });
    await ctx.fns.models.resolveRoute({ route });
    await ctx.fns.models.update({ id: c.id, enabled: false });
    await expect(ctx.fns.models.resolveRoute({ route })).rejects.toMatchObject({ code: "CONNECTION_DISABLED", retryable: false });
    await ctx.fns.models.update({ id: c.id, enabled: true });
    await ctx.fns.models.setModelEnabled({ id: c.id, model: "m", enabled: false });
    await expect(ctx.fns.models.resolveRoute({ route })).rejects.toMatchObject({ code: "MODEL_DISABLED_BY_USER", retryable: false });
    expect(requests()).toBe(0);
});

test("lookup races normalize not-found at resolve, enabled gate and catalogue; unrelated errors retain identity", async () => {
    const { ctx, create } = await setup();
    await create("codex", "work");
    for (const [namespace, name] of [["connections", "resolve"], ["inference", "assertModelEnabled"], ["catalog", "listModels"]]) {
        const registry = ctx.state.registry.models[namespace!];
        const original = registry[name!];
        registry[name!] = () => { throw Object.assign(Error("removed concurrently"), { code: "NOT_FOUND" }); };
        await expect(ctx.fns.models.resolveRoute({ route: "codex/work:m" })).rejects.toMatchObject({ code: "CONNECTION_NOT_FOUND", retryable: false, failure: { acceptance: "none" } });
        const error = Error("storage unavailable");
        registry[name!] = () => { throw error; };
        await expect(ctx.fns.models.resolveRoute({ route: "codex/work:m" })).rejects.toBe(error);
        registry[name!] = original;
    }
});

test("public resolveRoute facade forwards exact options, value and error identity", async () => {
    const opts = { route: "codex/account:m" }, value = { marker: true }, error = Error("same");
    const ctx = { fns: { models: { inference: { resolveRoute: (o: object) => { expect(o).toBe(opts); return value; } } } } } as unknown as Context;
    expect<unknown>(await facade(ctx, null, opts)).toBe(value);
    (ctx.fns.models.inference.resolveRoute as Function) = () => { throw error; };
    await expect(facade(ctx, null, opts)).rejects.toBe(error);
});
