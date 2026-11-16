import { beforeAll, describe, expect, test } from "bun:test";
import { testCtx } from "../$test";

// Official plugins mounted so workflow hits and plugin descriptions are real.
const ctx = await testCtx({ env: { PROCS_PLUGINS: "./plugins" } });

beforeAll(async () => {
    await ctx.fns.settings.set({ module: "embeddings", scopeType: "global", key: "provider", value: "off" });
    await ctx.fns.runtime.docs.index({ localize: false });
}, 120_000);

const snapshot = (allow: string[], deny: string[] = [], plugins: string[] = []): types.agentPreset.Snapshot =>
    ({ presetId: "test", name: "TestPreset", layers: [{ id: "test", allow, deny, plugins, prompt: "", excludeSections: [] }] });
const discovery = ["tools.toolSearch", "tools.toolDescribe", "runtime.docs.*", "plugins.*", "agent.readResult", "input.request"];
const agentWith = (preset?: types.agentPreset.Snapshot) => ({ id: "native-discovery", preset } as types.agent.Agent);
const call = (agent: types.agent.Agent, name: string, args: unknown) => ctx.fns.tools.call({ name, args, agent });
const json = (output: string) => JSON.parse(output);

describe("tool_search", () => {
    test("finds a function by intent with compact entries only", async () => {
        const result = await call(agentWith(snapshot(discovery)), "tool_search", { query: "read stored tool result" });
        expect(result.isError).toBe(false);
        const entries = json(result.output);
        expect(entries.find((e: any) => e.name === "agent.readResult")).toMatchObject({ kind: "function", source: "core" });
        for (const entry of entries) expect(Object.keys(entry).sort()).toEqual(["kind", "name", "source", "summary"]);
        expect(result.output).not.toMatch(/export default|signature|paramsSchema/);
    });

    test("rejects empty queries and unknown arguments, including a model-supplied filter", async () => {
        const agent = agentWith(snapshot(discovery));
        for (const args of [{ query: "" }, { query: "   " }, { query: "x", allows: "*" }, { query: "x", preset: "creator" }]) {
            const result = await call(agent, "tool_search", args);
            expect(result.isError).toBe(true);
            expect(result.output).toMatch(/invalid arguments|non-empty|unknown argument/);
        }
    });

    test("limit caps results and namespace narrows them", async () => {
        const agent = agentWith(snapshot(["*"], [], ["*"]));
        expect(json((await call(agent, "tool_search", { query: "agent", limit: 3 })).output)).toHaveLength(3);
        const scoped = json((await call(agent, "tool_search", { query: "list", namespace: "agentPreset", limit: 30 })).output);
        expect(scoped.length).toBeGreaterThan(0);
        for (const entry of scoped) expect(entry.name.startsWith("agentPreset.")).toBe(true);
    });

    test("never returns denied functions or ungranted plugin workflows", async () => {
        const agent = agentWith(snapshot(discovery, ["agent.readResult"]));
        const entries = json((await call(agent, "tool_search", { query: "read stored tool result spec change", limit: 30 })).output);
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
            expect(entry.name).not.toBe("agent.readResult");
            expect(entry.kind).toBe("function");
            expect(ctx.fns.agentPreset.allows({ snapshot: agent.preset!, name: entry.name })).toBe(true);
        }
    });

    test("is absent and unknown when its wrapped capability is denied", async () => {
        const agent = agentWith(snapshot(discovery, ["runtime.docs.search"]));
        expect(ctx.fns.agent.wireTools({ agent }).map(t => t.name)).not.toContain("tool_search");
        expect(ctx.fns.agent.wireTools({ agent }).map(t => t.name)).toContain("tool_describe");
        const result = await call(agent, "tool_search", { query: "x" });
        expect(result.output).toMatch(/^Error: unknown tool "tool_search"\. Available: /);
        expect(result.output).not.toContain("runtime.docs.search");
    });

    test("requires the trusted agent invocation", async () => {
        await expect(ctx.fns.tools.toolSearch({ query: "read result" })).rejects.toThrow("trusted agent invocation");
    });

    test("does not change the native tool list", async () => {
        const agent = agentWith(snapshot(discovery));
        const before = JSON.stringify(ctx.fns.agent.wireTools({ agent }));
        await call(agent, "tool_search", { query: "send telegram message" });
        await call(agent, "tool_describe", { name: "agent.readResult" });
        expect(JSON.stringify(ctx.fns.agent.wireTools({ agent }))).toBe(before);
    });
});

describe("tool_describe", () => {
    test("describes a function without source or internal authority parameters", async () => {
        const result = json((await call(agentWith(snapshot(discovery)), "tool_describe", { name: "input.request" })).output);
        expect(result).toMatchObject({ kind: "function", name: "input.request", source: "core" });
        expect(Object.keys(result.parameters.properties)).toEqual(expect.arrayContaining(["kind", "title", "spec", "waitForAnswer"]));
        expect(result.parameters.properties).not.toHaveProperty("agentId");
        expect(result.returnType).toContain("id: string");
        for (const key of ["abs", "rel", "signature", "optsType", "line"]) expect(result).not.toHaveProperty(key);
        const search = json((await call(agentWith(snapshot(discovery)), "tool_describe", { name: "runtime.docs.search" })).output);
        expect(search.parameters.properties).not.toHaveProperty("allows");
    });

    test("denied and nonexistent names fail identically", async () => {
        const agent = agentWith(snapshot(discovery, ["secrets.get"]));
        const denied = await call(agent, "tool_describe", { name: "secrets.get" });
        const missing = await call(agent, "tool_describe", { name: "secrets.nope" });
        expect(denied.isError).toBe(true);
        expect(denied.output).toBe(missing.output.replace("secrets.nope", "secrets.get"));
        const plugin = await call(agent, "tool_describe", { name: "openspec" });
        const nope = await call(agent, "tool_describe", { name: "nopespec" });
        expect(plugin.output).toBe(nope.output.replace("nopespec", "openspec"));
    });

    test("describes a granted plugin with only allowed functions and no source", async () => {
        const agent = agentWith(snapshot(discovery, ["openspec.run"], ["openspec"]));
        const result = json((await call(agent, "tool_describe", { name: "openspec" })).output);
        expect(result).toMatchObject({ kind: "workflow", name: "openspec", source: "official plugin" });
        expect(result.overview).toContain("openspec");
        expect(result.functions.length).toBeGreaterThan(0);
        for (const fn of result.functions) {
            expect(Object.keys(fn).sort()).toEqual(["name", "summary"]);
            expect(fn.name).not.toBe("openspec.run");
        }
    });

    test("function names win over plugin names and arguments are strict", async () => {
        const agent = agentWith(snapshot(["*"], [], ["*"]));
        const registry = ctx.state.registry as any;
        const fn = Object.assign(() => null, { meta: { name: "openspec", summary: "shadow", doc: "", paramsSchema: { type: "object", properties: {} }, returnType: "null" } });
        const saved = registry.openspec;
        registry.openspec = fn;
        try { expect(json((await call(agent, "tool_describe", { name: "openspec" })).output)).toMatchObject({ kind: "function", summary: "shadow" }); }
        finally { registry.openspec = saved; }
        for (const args of [{ name: "" }, { name: "x", allows: "*" }]) expect((await call(agent, "tool_describe", args)).isError).toBe(true);
        await expect(ctx.fns.tools.toolDescribe({ name: "input.request" })).rejects.toThrow("trusted agent invocation");
    });
});
