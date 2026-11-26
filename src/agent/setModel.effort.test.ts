import { describe, expect, test } from "bun:test";
import { mkModelsTestCtx as mkTestCtx } from "./modelsTestCtx.entry";
import nativeRoute from "../api/$route_v1_agents_$id_model_POST";
import formRoute from "./$route_$id_model_POST";

/** Cached reasoning levels per mock connection (connectionId = "mock/<account>"); absent means a cold catalogue. */
function catalogue(ctx: any, levels: Record<string, Record<string, string[] | null>>) {
    let reads = 0;
    const setModel = ctx.state.registry.agent.setModel;
    let switching = false;
    // Only a model switch is checked for discovery; the explicit effort operation keeps its own read.
    ctx.state.registry.agent.setModel = async (...args: unknown[]) => { switching = true; try { return await setModel(...args); } finally { switching = false; } };
    ctx.state.registry.models.listModels = async (_c: unknown, _s: unknown, o: { id: string; cacheOnly?: boolean }) => {
        reads++;
        if (switching && !o.cacheOnly) throw new Error("discovery is forbidden while deciding effort support");
        const models = Object.entries(levels[o.id] ?? {}).map(([id, supported]) => supported ? { id, reasoning: { supported } } : { id });
        return { models, source: levels[o.id] ? "provider" : "manual", cachedAt: levels[o.id] ? 1 : null };
    };
    return () => reads;
}
const pair = async (ctx: any, id: string) => {
    const row = (await ctx.fns.procs.db.select({ sql: "SELECT model, reasoning_effort FROM agents WHERE id = ?", params: [id] }))[0];
    return { stored: [row.model, row.reasoning_effort], live: ctx.state.agent[id] ? [ctx.state.agent[id].model, ctx.state.agent[id].reasoningEffort] : null, loaded: await ctx.fns.session.load({ id }).then((a: any) => [a.model, a.reasoningEffort]) };
};

describe("agent.setModel resets requested effort with the route (4.1)", () => {
    test("a different model resets high to auto even when both support it; reselecting the same route keeps it", async () => {
        const ctx: any = await mkTestCtx();
        catalogue(ctx, { "mock/default": { test: ["low", "high"], other: ["low", "high"] } });
        const a = await ctx.fns.agent.start({ model: "mock/default:test", reasoningEffort: "high" });
        await ctx.fns.agent.setModel({ id: a.id, model: "mock/default:test" });
        expect(await pair(ctx, a.id)).toMatchObject({ stored: ["mock/default:test", "high"], live: ["mock/default:test", "high"] });
        await ctx.fns.agent.setModel({ id: a.id, model: "mock/default:other" });
        expect(await pair(ctx, a.id)).toEqual({ stored: ["mock/default:other", "auto"], live: ["mock/default:other", "auto"], loaded: ["mock/default:other", "auto"] });
        expect((await ctx.fns.session.getEvents({ id: a.id })).filter((e: any) => e.type === "reasoning_effort_changed").at(-1)).toMatchObject({ from: "high", to: "auto" });
        // The owner can pick an explicit level again through the dedicated operation.
        await ctx.fns.agent.setReasoningEffort({ id: a.id, effort: "high" });
        expect((await pair(ctx, a.id)).stored).toEqual(["mock/default:other", "high"]);
        // A different provider-native slug of another account also resets.
        await ctx.fns.agent.setModel({ id: a.id, model: "mock/second:test" });
        expect((await pair(ctx, a.id)).stored).toEqual(["mock/second:test", "auto"]);
    });

    test("same slug on another connection keeps a cache-listed effort, otherwise auto, without discovery", async () => {
        const ctx: any = await mkTestCtx();
        const reads = catalogue(ctx, { "mock/default": { test: ["low", "high"] }, "mock/keeps": { test: ["low", "high"] }, "mock/lower": { test: ["low"] }, "mock/plain": { test: null } });
        const cases: [string, string][] = [["mock/keeps:test", "high"], ["mock/lower:test", "auto"], ["mock/plain:test", "auto"], ["mock/cold:test", "auto"]];
        for (const [route, expected] of cases) {
            const a = await ctx.fns.agent.start({ model: "mock/default:test", reasoningEffort: "high" });
            await ctx.fns.agent.setModel({ id: a.id, model: route });
            expect([route, ...(await pair(ctx, a.id)).stored]).toEqual([route, route, expected]);
            expect((await pair(ctx, a.id)).live).toEqual([route, expected]);
        }
        expect(reads()).toBeGreaterThan(0);
    });

    test("both agent model POST routes commit the pair in one mutation", async () => {
        const ctx: any = await mkTestCtx();
        catalogue(ctx, { "mock/default": { test: ["high"], other: ["high"] } });
        const a = await ctx.fns.agent.start({ model: "mock/default:test", reasoningEffort: "high" });
        const native = await nativeRoute(ctx, null, { req: new Request("http://x/api/v1/agents/a/model", { method: "POST", body: JSON.stringify({ model: "mock/default:other" }) }), params: { id: a.id } });
        expect(native.status).toBe(200);
        expect((await pair(ctx, a.id)).stored).toEqual(["mock/default:other", "auto"]);
        const b = await ctx.fns.agent.start({ model: "mock/default:test", reasoningEffort: "high" });
        const body = new FormData(); body.set("model", "mock/default:other");
        const form = await formRoute(ctx, null, { req: new Request("http://x/agent/b/model", { method: "POST", body }), params: { id: b.id } });
        expect(form.status).toBe(204);
        expect((await pair(ctx, b.id)).stored).toEqual(["mock/default:other", "auto"]);
    });

    test("provider-scope fan-out applies the rule per moved agent and leaves unmoved agents alone", async () => {
        const ctx: any = await mkTestCtx();
        catalogue(ctx, { "mock/default": { test: ["low", "high"], big: ["high"] }, "mock/second": { test: ["high"], big: ["low"] } });
        const a = await ctx.fns.agent.start({ model: "mock/default:test", reasoningEffort: "high" });
        const b = await ctx.fns.agent.start({ model: "mock/default:big", reasoningEffort: "high" });
        const untouched = await ctx.fns.agent.start({ model: "mock/third:test", reasoningEffort: "high" });
        const resetsAt = Date.now() + 3_600_000;
        await ctx.fns.agent.parkOnUsageLimit({ originAgentId: a.id, info: { code: "QUOTA_EXHAUSTED", classification: "quota", acceptance: "rejected", replaySafe: true, retryable: false, resetAt: resetsAt } });
        const result = await ctx.fns.agent.setModel({ id: a.id, model: "mock/second:test", scope: "provider" });
        expect(result.changed.sort()).toEqual([a.id, b.id].sort());
        // a keeps its slug on another account (supported); b moves to another slug and resets.
        expect((await pair(ctx, a.id)).stored).toEqual(["mock/second:test", "high"]);
        expect((await pair(ctx, b.id)).stored).toEqual(["mock/second:test", "auto"]);
        expect((await pair(ctx, untouched.id)).stored).toEqual(["mock/third:test", "high"]);
    });

    test("a connection rename keeps every affected effort", async () => {
        const ctx: any = await mkTestCtx();
        const a = await ctx.fns.agent.start({ model: "mock/old name:test", reasoningEffort: "high" });
        await ctx.fns.agent.onConnectionRenamed({ provider: "mock", from: "old name", to: "new name" });
        expect((await pair(ctx, a.id)).stored).toEqual(["mock/new name:test", "high"]);
        expect(ctx.state.agent[a.id].reasoningEffort).toBe("high");
    });

    test("a refused switch or failed unpark keeps or restores the previous pair", async () => {
        const ctx: any = await mkTestCtx();
        catalogue(ctx, { "mock/default": { test: ["high"], other: ["high"] } });
        const a = await ctx.fns.agent.start({ model: "mock/default:test", reasoningEffort: "high" });
        await expect(ctx.fns.agent.setModel({ id: a.id, model: "nosuch:model" })).rejects.toThrow();
        expect((await pair(ctx, a.id)).stored).toEqual(["mock/default:test", "high"]);
        // Concurrency check lost: nothing committed.
        await expect(ctx.fns.agent.setModel({ id: a.id, model: "mock/default:other", expectedModel: "mock/default:stale" })).rejects.toThrow(/model changed/);
        expect(await pair(ctx, a.id)).toMatchObject({ stored: ["mock/default:test", "high"], live: ["mock/default:test", "high"] });
        const unpark = ctx.state.registry.agent.unpark;
        ctx.state.registry.agent.unpark = async () => { throw new Error("unpark failed"); };
        try { await expect(ctx.fns.agent.setModel({ id: a.id, model: "mock/default:other" })).rejects.toThrow(/unpark failed/); }
        finally { ctx.state.registry.agent.unpark = unpark; }
        expect(await pair(ctx, a.id)).toMatchObject({ stored: ["mock/default:test", "high"], live: ["mock/default:test", "high"] });
    });
});
