import { describe, test, expect } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkTestCtx } from "../_testCtx.entry";

// A throwaway module `enumtest` declares one dynamic enum; its options function is installed per test.
async function setup(fn?: (...args: any[]) => unknown, descriptor: Record<string, unknown> = {}) {
    const dir = await mkdtemp(join(tmpdir(), "mauzcode-enum-"));
    const ctx = await mkTestCtx({ env: { MAUZCODE_SETTINGS: dir } });
    ctx.state.settings.registry.set("enumtest.engine", {
        type: "enum", default: "a", options: ["a", "b"], optionsFrom: "enumtest.ids", ...descriptor,
    });
    const calls: unknown[] = [];
    ctx.state.registry.enumtest = { ids: async (_c: unknown, _s: unknown, opts: unknown) => { calls.push(opts); return fn ? fn() : ["a", "b", "plugin-x"]; } };
    const warnings: string[] = [];
    const warn = ctx.state.registry.procs.log.warn;
    ctx.state.registry.procs.log.warn = (c: any, s: any, o: any) => { warnings.push(o.event); return warn(c, s, o); };
    return { ctx, dir, calls, warnings };
}
const resolve = (ctx: any) => ctx.fns.settings.enumOptions({ module: "enumtest", key: "engine" });

describe("settings.enumOptions (dynamic enum options)", () => {
    test("dynamic options come from the own-module function called with {}", async () => {
        const { ctx, calls } = await setup();
        expect(await resolve(ctx)).toEqual({ options: ["a", "b", "plugin-x"], dynamic: true });
        expect(calls).toEqual([{}]);
        const item = (await ctx.fns.settings.declared({})).find((i: any) => i.module === "enumtest");
        expect(item.descriptor.options).toEqual(["a", "b", "plugin-x"]);
    });

    test("a failing function falls back to static options", async () => {
        const { ctx } = await setup(() => { throw new Error("boom"); });
        expect(await resolve(ctx)).toEqual({ options: ["a", "b"], dynamic: false });
    });

    test("a slow function falls back after its 1 second bound", async () => {
        const { ctx } = await setup(() => new Promise(() => {}));
        const original = globalThis.setTimeout; const delays: number[] = [];
        globalThis.setTimeout = ((fn: () => void, ms?: number) => { delays.push(ms ?? 0); return original(fn, 5); }) as typeof setTimeout;
        try { expect((await resolve(ctx)).options).toEqual(["a", "b"]); } finally { globalThis.setTimeout = original; }
        expect(delays).toContain(1000);
    });

    test("a foreign function is never called and is logged", async () => {
        const { ctx, calls, warnings } = await setup(undefined, { optionsFrom: "settings.list" });
        let called = false;
        const real = ctx.state.registry.settings.list;
        ctx.state.registry.settings.list = (...args: any[]) => { called = true; return real(...args); };
        expect((await resolve(ctx)).options).toEqual(["a", "b"]);
        expect(called).toBe(false); expect(calls).toHaveLength(0);
        expect(warnings).toContain("settings.optionsFrom.rejected");
    });

    for (const [name, output] of [["non-array", "a"], ["empty string", ["a", ""]], ["too long", ["x".repeat(101)]],
        ["too many", Array.from({ length: 201 }, (_, i) => `o${i}`)], ["non-string", ["a", 1]]] as const) {
        test(`invalid output (${name}) falls back to static options`, async () => {
            const { ctx } = await setup(() => output);
            expect((await resolve(ctx)).options).toEqual(["a", "b"]);
        });
    }

    test("static enums are unchanged", async () => {
        const { ctx } = await setup();
        ctx.state.settings.registry.set("enumtest.plain", { type: "enum", default: "x", options: ["x", "y"] });
        expect(await ctx.fns.settings.enumOptions({ module: "enumtest", key: "plain" })).toEqual({ options: ["x", "y"], dynamic: false });
        await ctx.fns.settings.set({ module: "enumtest", scopeType: "global", key: "plain", value: "y" });
        await expect(ctx.fns.settings.set({ module: "enumtest", scopeType: "global", key: "plain", value: "z" })).rejects.toThrow(/allowed: x, y/);
    });

    test("settings.set rejects an unregistered value and accepts a plugin-provided one", async () => {
        const { ctx } = await setup();
        await expect(ctx.fns.settings.set({ module: "enumtest", scopeType: "global", key: "engine", value: "nope" }))
            .rejects.toThrow(/"nope" is not allowed \(allowed: a, b, plugin-x\)/);
        await ctx.fns.settings.set({ module: "enumtest", scopeType: "global", key: "engine", value: "plugin-x" });
        expect(await ctx.fns.settings.get({ module: "enumtest", scopeType: "global", key: "engine" })).toBe("plugin-x");
        // Non-global scopes are not checked.
        await ctx.fns.settings.set({ module: "enumtest", scopeType: "user", scopeId: "u1", key: "engine", value: "anything" });
    });

    test("a stored value outside the resolved options is marked unavailable, not rewritten", async () => {
        const { ctx } = await setup();
        await ctx.fns.settings.set({ module: "enumtest", scopeType: "global", key: "engine", value: "plugin-x" });
        ctx.state.registry.enumtest.ids = async () => ["a", "b"];
        const item = (await ctx.fns.settings.declared({})).find((i: any) => i.module === "enumtest");
        expect(item.currentValue).toBe("plugin-x");
        expect(item.unavailable).toBe(true);
    });

    test("a settings file naming a plugin-provided option is accepted", async () => {
        const { ctx, dir } = await setup();
        await writeFile(join(dir, "$settings_enumtest.json"), JSON.stringify({ engine: "plugin-x" }));
        const files = await ctx.fns.settings.files({ force: true });
        expect(files.values["enumtest.engine"]?.value).toBe("plugin-x");
        await writeFile(join(dir, "$settings_enumtest.json"), JSON.stringify({ engine: "nope" }));
        const again = await ctx.fns.settings.files({ force: true });
        expect(again.values["enumtest.engine"]).toBeUndefined();
        expect(again.errors.join("\n")).toMatch(/enumtest\.engine" expected one of \["a","b","plugin-x"\]/);
    });

    test("an agent cannot set websearch.defaultEngine to an unregistered provider", async () => {
        // The optional websearch plugin is not mounted in the test context: wire its real descriptor and options function.
        const ctx = await mkTestCtx();
        const { default: descriptor } = await import("../../plugins/websearch/src/websearch/$setting_defaultEngine");
        const { default: providerIds } = await import("../../plugins/websearch/src/websearch/providerIds");
        ctx.state.settings.registry.set("websearch.defaultEngine", descriptor);
        ctx.state.registry.websearch = { ...ctx.state.registry.websearch, providerIds };
        ctx.state.websearch = { providers: { "google-browser": {}, openserp: {}, brave: {}, "acme-search": {} } };
        await expect(ctx.fns.settings.set({ module: "websearch", scopeType: "global", key: "defaultEngine", value: "nope" }))
            .rejects.toThrow(/websearch\.defaultEngine: "nope" is not allowed \(allowed: .*google-browser/);
        await expect(ctx.fns.settings.set({ module: "websearch", scopeType: "global", key: "defaultEngine", value: "native:codex" })).rejects.toThrow(/is not allowed/);
        await ctx.fns.settings.set({ module: "websearch", scopeType: "global", key: "defaultEngine", value: "acme-search" });
        expect(await ctx.fns.settings.get({ module: "websearch", scopeType: "global", key: "defaultEngine" })).toBe("acme-search");
    });
});
